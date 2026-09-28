package service

import (
	"context"
	"errors"
	"fmt"
	"io"
	"net/http"
	"path/filepath"
	"strings"
	"time"
	"unicode"

	werrors "github.com/Tencent/WeKnora/internal/errors"
	"github.com/Tencent/WeKnora/internal/infrastructure/docparser"
	"github.com/Tencent/WeKnora/internal/infrastructure/tikhub"
	"github.com/Tencent/WeKnora/internal/logger"
	"github.com/Tencent/WeKnora/internal/types"
	"github.com/Tencent/WeKnora/internal/types/interfaces"
	secutils "github.com/Tencent/WeKnora/internal/utils"
)

var (
	errTikHubNotConfigured          = errors.New("TikHub social import is not configured")
	errSocialVideoNotAllowed        = errors.New("current plan does not support social video import")
	errSocialVideoTooLarge          = errors.New("social video exceeds the product upload limit")
	errSocialVideoFormatUnsupported = errors.New("social video format is unsupported")
	errSocialMediaURLUnsafe         = errors.New("social media URL failed security validation")

	// SocialImportFailedPublicMessage is the neutral public source failure for
	// social works that may resolve to text, images, or video.
	SocialImportFailedPublicMessage = "社媒内容获取失败，请稍后重试"
	// SocialImportRetryingPublicMessage is the consumer-visible state while the
	// document worker spends its one bounded retry on a transient provider or
	// storage failure. It deliberately stays neutral so provider details never
	// leak into the knowledge row or UI.
	SocialImportRetryingPublicMessage = "社媒内容暂时没有结果，正在重试"
	// SocialFormatUnsupportedPublicMessage is the public format failure for a
	// provider video before the knowledge row has adopted its final file type.
	SocialFormatUnsupportedPublicMessage = "暂不支持此社媒视频格式"
)

func cleanupTikHubResolvedImages(ctx context.Context, fileSvc interfaces.FileService, images []docparser.StoredImage) {
	if fileSvc == nil {
		return
	}
	for _, image := range images {
		if imagePath := strings.TrimSpace(image.ServingURL); imagePath != "" &&
			!strings.HasPrefix(imagePath, "http://") && !strings.HasPrefix(imagePath, "https://") {
			if deleteErr := fileSvc.DeleteFile(ctx, imagePath); deleteErr != nil {
				logger.Warnf(ctx, "Failed to clean social image after source materialization failure, path: %s, error: %v", imagePath, deleteErr)
			}
		}
	}
}

func socialImportFailureReason(err error) string {
	switch {
	case errors.Is(err, errTikHubNotConfigured):
		return "not_configured"
	case errors.Is(err, errSocialVideoNotAllowed):
		return "video_not_allowed"
	case errors.Is(err, errSocialVideoTooLarge):
		return "artifact_too_large"
	case errors.Is(err, errSocialVideoFormatUnsupported):
		return "format_unsupported"
	case errors.Is(err, errSocialMediaURLUnsafe):
		return "unsafe_media_url"
	default:
		return "provider_or_processing_error"
	}
}

// socialImportShouldRetry allows one existing document-task retry for errors
// that may recover without changing user input. Deterministic policy, route,
// format, size, configuration, and SSRF failures must fail immediately; all
// other provider/media/storage failures get the same single retry budget used
// by video ingestion. Keeping this decision at the worker boundary avoids a
// second request loop inside TikHub (and preserves one attempt's billing
// checkpoint semantics).
func socialImportShouldRetry(err error, retryCount int) bool {
	if err == nil || retryCount >= 1 {
		return false
	}
	switch {
	case errors.Is(err, errTikHubNotConfigured),
		errors.Is(err, tikhub.ErrMissingAPIKey),
		errors.Is(err, tikhub.ErrMissingRouteValue),
		errors.Is(err, tikhub.ErrUnsupportedPlatform),
		errors.Is(err, errSocialVideoNotAllowed),
		errors.Is(err, errSocialVideoTooLarge),
		errors.Is(err, errSocialVideoFormatUnsupported),
		errors.Is(err, errSocialMediaURLUnsafe):
		return false
	}
	return true
}

func socialImportPublicMessage(err error) string {
	switch socialImportFailureReason(err) {
	case "not_configured":
		return VideoSourceFailedPublicMessage
	case "video_not_allowed":
		return "Current plan does not support social video import"
	case "artifact_too_large":
		return VideoTooLargePublicMessage
	case "format_unsupported":
		return SocialFormatUnsupportedPublicMessage
	case "unsafe_media_url":
		return SocialImportFailedPublicMessage
	default:
		return SocialImportFailedPublicMessage
	}
}

func socialImportPublicState(err error) (code, message string) {
	switch socialImportFailureReason(err) {
	case "artifact_too_large":
		return werrors.ErrCodeVideoTooLarge, VideoTooLargePublicMessage
	case "format_unsupported":
		return werrors.ErrCodeVideoFormatUnsupported, SocialFormatUnsupportedPublicMessage
	default:
		return werrors.ErrCodeVideoSourceFailed, socialImportPublicMessage(err)
	}
}

// resumeMaterializedTikHubArtifact makes a redelivered task consume the file
// checkpoint already stored on Knowledge. This is deliberately best-effort,
// not an exactly-once billing claim, but it closes the normal downstream
// retry/reparse path without adding a second queue or provider state table.
func resumeMaterializedTikHubArtifact(payload *types.DocumentProcessPayload, knowledge *types.Knowledge) bool {
	if payload == nil || knowledge == nil || strings.TrimSpace(payload.URL) == "" || strings.TrimSpace(knowledge.FilePath) == "" {
		return false
	}
	route, _, err := ParseSocialShareInput(payload.URL)
	if err != nil || route == nil {
		return false
	}
	payload.URL = ""
	payload.FilePath = knowledge.FilePath
	payload.FileName = knowledge.FileName
	payload.FileType = knowledge.FileType
	return true
}

// prepareTikHubArtifact recognizes a supported social work and materializes its
// normalized result as a real file. YouTube is understood directly by the
// fixed Google AI Studio model and saved as Markdown; the other social sources
// continue through TikHub. Once it returns handled=true, payload.URL is empty,
// so the existing pipeline sees an ordinary stored artifact instead of sending
// the social page to WebParser.
func (s *knowledgeService) prepareTikHubArtifact(
	ctx context.Context,
	payload *types.DocumentProcessPayload,
	kb *types.KnowledgeBase,
	knowledge *types.Knowledge,
	eff types.EffectiveProcessConfig,
) (bool, []docparser.StoredImage, error) {
	return s.prepareTikHubArtifactWithVideoLimit(
		ctx, payload, kb, knowledge, eff, secutils.GetMaxVideoFileSizeBytes(),
	)
}

func (s *knowledgeService) prepareTikHubArtifactWithVideoLimit(
	ctx context.Context,
	payload *types.DocumentProcessPayload,
	kb *types.KnowledgeBase,
	knowledge *types.Knowledge,
	eff types.EffectiveProcessConfig,
	videoMaxBytes int64,
) (bool, []docparser.StoredImage, error) {
	if payload == nil || strings.TrimSpace(payload.URL) == "" {
		return false, nil, nil
	}

	route, _, err := ParseSocialShareInput(payload.URL)
	if err != nil {
		return true, nil, err
	}
	if route == nil {
		return false, nil, nil
	}
	var result tikhub.Result
	if route.Platform == tikhub.PlatformYouTube {
		youtubeURL := "https://www.youtube.com/watch?v=" + route.ObjectID
		markdown, analyzeErr := s.analyzeYouTubeVideo(ctx, youtubeURL, eff.VLMConfig)
		if analyzeErr != nil {
			return true, nil, analyzeErr
		}
		result = tikhub.Result{
			Kind:     tikhub.ResultDocument,
			Title:    firstMarkdownTitle(markdown),
			Markdown: markdown,
			FileName: "youtube-" + route.ObjectID + ".md",
			FileType: "md",
		}
	} else {
		if s.tikhubImporter == nil {
			return true, nil, errTikHubNotConfigured
		}
		result, err = s.tikhubImporter.Fetch(ctx, *route)
		if err != nil {
			return true, nil, fmt.Errorf("TikHub social import failed for %s: %w", route.Platform, err)
		}
	}

	var content []byte
	var media *tikHubMediaStream
	var resolvedImages []docparser.StoredImage
	// ResolveRemoteImages can persist image copies before the source artifact
	// itself is admitted. Keep one compensation hook in scope for every
	// post-resolution, pre-claim exit (empty content, size limit, storage
	// lookup/save failure, and the source claim branches below).
	cleanupResolvedImages := func() {}
	switch result.Kind {
	case tikhub.ResultDocument:
		markdown := strings.TrimSpace(result.Markdown)
		// Resolve provider images before saving the source Markdown. This keeps
		// expiring/signed CDN URLs out of the durable artifact and makes reparse
		// consume the stored copies instead of calling TikHub again.
		if s.imageResolver != nil && len(result.ImageURLs) > 0 {
			fileSvc := s.resolveFileService(ctx, kb)
			if fileSvc == nil {
				return true, nil, errors.New("social artifact storage is not configured")
			}
			cleanupResolvedImages = func() {
				cleanupTikHubResolvedImages(ctx, fileSvc, resolvedImages)
			}
			updated, images, resolveErr := s.imageResolver.ResolveRemoteImages(ctx, markdown, fileSvc, payload.TenantID)
			resolvedImages = images
			if resolveErr != nil {
				cleanupResolvedImages()
				return true, nil, fmt.Errorf("social image materialization failed: %w", resolveErr)
			}
			if unresolved := unresolvedSocialImageURLs(result.ImageURLs, images); len(unresolved) > 0 {
				cleanupResolvedImages()
				return true, nil, fmt.Errorf(
					"social image materialization incomplete: %d image(s) unresolved",
					len(unresolved),
				)
			}
			markdown = updated
		}
		content = []byte(markdown)
		if len(content) == 0 {
			cleanupResolvedImages()
			return true, nil, errors.New("TikHub document response contained no content")
		}
		result.FileType = "md"
	case tikhub.ResultVideo:
		if !socialVideoUploadAllowed(ctx) {
			return true, nil, errSocialVideoNotAllowed
		}
		media, err = downloadTikHubMedia(ctx, result.MediaURL, s.tikhubMediaClient, videoMaxBytes)
		if err != nil {
			return true, nil, err
		}
		defer func() {
			if closeErr := media.Close(); closeErr != nil {
				logger.Warnf(ctx, "Failed to close TikHub media stream: %v", closeErr)
			}
		}()
		result.FileType = normalizeFileExtension(result.FileType)
		if !IsVideoType(result.FileType) {
			result.FileType = "mp4"
		}
	default:
		return true, nil, errors.New("TikHub response contained an unsupported content kind")
	}

	maxBytes := secutils.GetMaxFileSize()
	if result.Kind == tikhub.ResultVideo {
		maxBytes = videoMaxBytes
	}
	if media == nil && int64(len(content)) > maxBytes {
		cleanupResolvedImages()
		if result.Kind == tikhub.ResultVideo {
			return true, nil, fmt.Errorf("%w: %d bytes", errSocialVideoTooLarge, maxBytes)
		}
		return true, nil, fmt.Errorf("social artifact exceeds the configured %d MB upload limit", secutils.GetMaxFileSizeMB())
	}
	fileName := tikHubArtifactFileName(*route, result)
	fileSvc := s.resolveFileService(ctx, kb)
	if fileSvc == nil {
		cleanupResolvedImages()
		return true, nil, errors.New("social artifact storage is not configured")
	}
	// This file is the knowledge source and retry checkpoint, not scratch data.
	var filePath string
	var fileSize int64
	if media != nil {
		streamer, ok := fileSvc.(interfaces.StreamingFileService)
		if !ok {
			cleanupResolvedImages()
			return true, nil, errors.New("social video storage backend does not support streaming uploads")
		}
		filePath, err = streamer.SaveReader(
			ctx,
			media,
			media.contentLength,
			payload.TenantID,
			fileName,
			media.contentType,
			false,
		)
		if err != nil {
			if strings.TrimSpace(filePath) != "" {
				_ = fileSvc.DeleteFile(ctx, filePath)
			}
			cleanupResolvedImages()
			return true, nil, fmt.Errorf("failed to persist social artifact: %w", err)
		}
		fileSize = media.bytesRead
		if fileSize == 0 {
			if deleteErr := fileSvc.DeleteFile(ctx, filePath); deleteErr != nil {
				logger.Warnf(ctx, "Failed to clean empty social video, path: %s, error: %v", filePath, deleteErr)
			}
			cleanupResolvedImages()
			return true, nil, errors.New("TikHub media response was empty")
		}
		if fileSize > maxBytes {
			if deleteErr := fileSvc.DeleteFile(ctx, filePath); deleteErr != nil {
				logger.Warnf(ctx, "Failed to clean oversized social video, path: %s, error: %v", filePath, deleteErr)
			}
			cleanupResolvedImages()
			return true, nil, fmt.Errorf("%w: %d bytes", errSocialVideoTooLarge, maxBytes)
		}
	} else {
		fileSize = int64(len(content))
		filePath, err = fileSvc.SaveBytes(ctx, content, payload.TenantID, fileName, false)
	}
	if err != nil {
		cleanupResolvedImages()
		return true, nil, fmt.Errorf("failed to persist social artifact: %w", err)
	}

	// Build a copy so a failed paired row/counter mutation cannot publish a
	// path to an object that we immediately delete. The caller only receives
	// the materialized payload after the database and tenant usage commit.
	updatedKnowledge := new(types.Knowledge)
	*updatedKnowledge = *knowledge
	updatedKnowledge.FilePath = filePath
	updatedKnowledge.FileName = fileName
	updatedKnowledge.FileType = result.FileType
	updatedKnowledge.FileSize = fileSize
	// A provider caption is document content, not a user-authored title. Keep
	// image/text social works in the automatic URL-title state so the existing
	// summary-model call can publish a concise title. A document that has no
	// provider description or images is already a direct model-analysis result
	// (currently the YouTube path), so its generated heading can be used now.
	if result.Kind == tikhub.ResultDocument &&
		strings.TrimSpace(result.Description) == "" && len(result.ImageURLs) == 0 &&
		automaticURLKnowledgeTitle(updatedKnowledge) {
		if title := conciseAnalysisTitle(result.Title); title != "" {
			updatedKnowledge.Title = title
		}
	}
	if strings.TrimSpace(result.Description) != "" {
		updatedKnowledge.Description = strings.TrimSpace(result.Description)
	}
	updatedKnowledge.UpdatedAt = time.Now()
	tenantInfo, _ := types.TenantInfoFromContext(ctx)
	storageQuota := effectiveStorageQuota(tenantInfo, time.Now().UTC())
	currentKnowledge, claimed, claimErr := s.repo.ClaimKnowledgeSourceWithStorage(ctx, updatedKnowledge, storageQuota)
	if claimErr != nil {
		if deleteErr := fileSvc.DeleteFile(ctx, filePath); deleteErr != nil {
			logger.Warnf(ctx, "Failed to clean social artifact after source claim failure, path: %s, error: %v", filePath, deleteErr)
		}
		cleanupResolvedImages()
		return true, nil, fmt.Errorf("failed to persist social artifact state: %w", claimErr)
	}
	if currentKnowledge == nil {
		if deleteErr := fileSvc.DeleteFile(ctx, filePath); deleteErr != nil {
			logger.Warnf(ctx, "Failed to clean social artifact after empty source claim, path: %s, error: %v", filePath, deleteErr)
		}
		cleanupResolvedImages()
		return true, nil, errors.New("social artifact source claim returned no knowledge")
	}
	if !claimed && filePath != currentKnowledge.FilePath {
		if deleteErr := fileSvc.DeleteFile(ctx, filePath); deleteErr != nil {
			logger.Warnf(ctx, "Failed to clean losing social artifact, path: %s, winner: %s, error: %v", filePath, currentKnowledge.FilePath, deleteErr)
		}
	}
	if !claimed {
		cleanupResolvedImages()
	}

	*knowledge = *currentKnowledge
	payload.URL = ""
	payload.FilePath = currentKnowledge.FilePath
	payload.FileName = currentKnowledge.FileName
	payload.FileType = currentKnowledge.FileType
	if currentKnowledge.ParseStatus == types.ParseStatusCancelled || currentKnowledge.ParseStatus == types.ParseStatusDeleting {
		// The source claim is durable and already accounted. Stop this stale
		// worker before it can send the winner through conversion/indexing; the
		// cancellation/deletion lifecycle owns the persisted row from here. The
		// source artifact is retained for that lifecycle, while image copies have
		// no chunk ImageInfo yet and must be released now.
		cleanupResolvedImages()
		return true, nil, nil
	}
	if !claimed {
		// A losing worker's image copies are not part of the winner's source
		// artifact. Returning them would enqueue multimodal work against objects
		// that this worker just discarded (or that belong to another checkpoint).
		return true, nil, nil
	}
	return true, resolvedImages, nil
}

func firstMarkdownTitle(markdown string) string {
	var firstLine string
	for _, line := range strings.Split(markdown, "\n") {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		if firstLine == "" {
			firstLine = line
		}
		if strings.HasPrefix(line, "#") {
			title := strings.TrimSpace(strings.TrimLeft(line, "#"))
			if title != "" {
				return title
			}
		}
	}
	return strings.TrimSpace(strings.Trim(firstLine, "*_`"))
}

func unresolvedSocialImageURLs(expected []string, resolved []docparser.StoredImage) []string {
	resolvedByURL := make(map[string]struct{}, len(resolved))
	for _, image := range resolved {
		if original := strings.TrimSpace(image.OriginalRef); original != "" {
			resolvedByURL[original] = struct{}{}
		}
	}

	seen := make(map[string]struct{}, len(expected))
	unresolved := make([]string, 0)
	for _, rawURL := range expected {
		imageURL := strings.TrimSpace(rawURL)
		if imageURL == "" {
			continue
		}
		if _, duplicate := seen[imageURL]; duplicate {
			continue
		}
		seen[imageURL] = struct{}{}
		if _, ok := resolvedByURL[imageURL]; !ok {
			unresolved = append(unresolved, imageURL)
		}
	}
	return unresolved
}

func socialVideoUploadAllowed(ctx context.Context) bool {
	tenant, ok := types.TenantInfoFromContext(ctx)
	if !ok || tenant == nil || tenant.Plan == "" {
		return true
	}
	return types.LimitsForConsumerPlan(types.EffectiveConsumerPlanAt(tenant, time.Now().UTC())).VideoUpload
}

func tikHubArtifactFileName(route tikhub.Route, result tikhub.Result) string {
	ext := normalizeFileExtension(result.FileType)
	if ext == "" {
		if result.Kind == tikhub.ResultDocument {
			ext = "md"
		} else {
			ext = "mp4"
		}
	}
	name := filepath.Base(strings.TrimSpace(result.FileName))
	if name == "" || name == "." || name == string(filepath.Separator) {
		id := strings.TrimSpace(route.ObjectID)
		if id == "" {
			id = "shared-work"
		}
		name = string(route.Platform) + "-" + id + "." + ext
	}
	name = strings.Map(func(r rune) rune {
		if unicode.IsLetter(r) || unicode.IsDigit(r) || r == '.' || r == '-' || r == '_' {
			return r
		}
		return '-'
	}, name)
	name = strings.Trim(name, ".-")
	if name == "" {
		name = "social-work." + ext
	}
	if normalizeFileExtension(filepath.Ext(name)) == "" {
		name += "." + ext
	}
	return name
}

// downloadTikHubMedia intentionally uses a different HTTP client from the
// provider API client: the TikHub bearer token must never reach a returned CDN
// URL. In production (injectedClient == nil), every hop is validated by the
// repository's SSRF-safe dialer and redirect policy. Tests may inject a local
// transport to exercise the byte/materialization contract without public I/O.
type tikHubMediaStream struct {
	reader        *io.LimitedReader
	closer        io.Closer
	contentLength int64
	contentType   string
	bytesRead     int64
}

func (s *tikHubMediaStream) Read(p []byte) (int, error) {
	n, err := s.reader.Read(p)
	if n > 0 {
		s.bytesRead += int64(n)
	}
	return n, err
}

func (s *tikHubMediaStream) Close() error {
	if s == nil || s.closer == nil {
		return nil
	}
	return s.closer.Close()
}

func downloadTikHubMedia(
	ctx context.Context,
	mediaURL string,
	injectedClient *http.Client,
	maxBytes int64,
) (*tikHubMediaStream, error) {
	if strings.TrimSpace(mediaURL) == "" {
		return nil, errors.New("TikHub video response contained no media URL")
	}
	client := injectedClient
	if client == nil {
		if err := secutils.ValidateURLForSSRF(mediaURL); err != nil {
			return nil, fmt.Errorf("%w: %v", errSocialMediaURLUnsafe, err)
		}
		client = secutils.NewSSRFSafeHTTPClient(secutils.SSRFSafeHTTPClientConfig{
			// A 300 MB video cannot reliably finish inside the old 60-second
			// whole-request timeout on ordinary uplinks. Keep one bounded timeout
			// below the document-processing deadline without introducing a custom
			// downloader or resumable-download state machine.
			Timeout:      10 * time.Minute,
			MaxRedirects: 5,
		})
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, mediaURL, nil)
	if err != nil {
		return nil, errors.New("failed to create TikHub media request")
	}
	req.Header.Set("Accept", "video/*, application/octet-stream")
	resp, err := client.Do(req)
	if err != nil {
		return nil, errors.New("failed to fetch TikHub media")
	}
	if resp.StatusCode < http.StatusOK || resp.StatusCode >= http.StatusMultipleChoices {
		_ = resp.Body.Close()
		return nil, fmt.Errorf("TikHub media server returned HTTP %d", resp.StatusCode)
	}

	if resp.ContentLength > maxBytes {
		_ = resp.Body.Close()
		return nil, fmt.Errorf("%w: %d bytes", errSocialVideoTooLarge, maxBytes)
	}
	contentType := strings.ToLower(
		strings.TrimSpace(strings.Split(resp.Header.Get("Content-Type"), ";")[0]),
	)
	if contentType != "" &&
		!strings.HasPrefix(contentType, "video/") &&
		contentType != "application/octet-stream" &&
		contentType != "binary/octet-stream" {
		_ = resp.Body.Close()
		return nil, fmt.Errorf("%w: content type %q", errSocialVideoFormatUnsupported, contentType)
	}
	return &tikHubMediaStream{
		reader: &io.LimitedReader{R: resp.Body, N: maxBytes + 1},
		closer: resp.Body,
		// Do not forward a remote Content-Length as the storage request length.
		// A CDN can lie or truncate that header; -1 forces providers to consume
		// the bounded reader so the post-copy byte count remains authoritative.
		contentLength: -1,
		contentType:   contentType,
	}, nil
}
