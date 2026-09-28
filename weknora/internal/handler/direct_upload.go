package handler

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"mime"
	"net/http"
	"os"
	"path"
	"strconv"
	"strings"
	"time"

	filesvc "github.com/Tencent/WeKnora/internal/application/service/file"
	apperrors "github.com/Tencent/WeKnora/internal/errors"
	"github.com/Tencent/WeKnora/internal/logger"
	"github.com/Tencent/WeKnora/internal/types"
	"github.com/Tencent/WeKnora/internal/types/interfaces"
	"github.com/Tencent/WeKnora/internal/utils"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

const (
	directUploadDefaultTTL = time.Hour
	directUploadMinTTL     = time.Minute
	directUploadMaxTTL     = time.Hour
	directUploadPartSize   = int64(8 * 1024 * 1024)
	directUploadMinPart    = int64(5 * 1024 * 1024)
	directUploadMaxPart    = int64(5 * 1024 * 1024 * 1024)
	directUploadMaxParts   = int64(10_000)
	directUploadTokenLimit = 16 * 1024

	directUploadFailedPublicMessage       = "视频上传失败，请稍后重试"
	directUploadExpiredPublicMessage      = "上传已失效，请重新选择视频"
	directUploadFormatPublicMessage       = "暂不支持此视频格式"
	directUploadTooLargePublicMessage     = "视频超过 300 MB，当前版本暂不支持"
	directUploadFileFailedPublicMessage   = "文件上传失败，请稍后重试"
	directUploadFileExpiredPublicMessage  = "上传已失效，请重新选择文件"
	directUploadFileFormatPublicMessage   = "暂不支持此文件格式"
	directUploadFileTooLargePublicMessage = "文件超过当前上传大小限制"
	directUploadVideoContextKey           = "direct_upload_video"
)

// DirectUploadStoreFactory resolves the caller's tenant-scoped object store.
// It is intentionally separate from FileService: direct browser uploads only
// need S3 presigning/HEAD/MPU and must not force every storage backend or mock
// to implement those methods.
type DirectUploadStoreFactory func(
	ctx context.Context,
	tenant *types.Tenant,
	backendID, provider string,
) (filesvc.PresignedObjectStore, error)

// DirectUploadHandler implements the small browser-direct protocol:
//
//	POST /knowledge-bases/:id/knowledge/uploads               -> signed PUT or MPU part URLs
//	POST /knowledge-bases/:id/knowledge/uploads/:upload_id/complete -> server-side completion + HEAD verification
//	HEAD /knowledge-bases/:id/knowledge/uploads/:upload_id    -> repeat HEAD verification (idempotent)
//
// There is intentionally no public DELETE/abort route: a successful token must
// not remain a bearer credential that can delete an adopted Knowledge object.
//
// Upload intent is a short-lived HMAC token. The token binds tenant, object
// key, expected byte size, MIME type, operation mode and backend MPU ID, so a
// caller cannot complete another tenant's object or change the size contract.
type DirectUploadHandler struct {
	storeFactory DirectUploadStoreFactory
	kbService    interfaces.KnowledgeBaseService
	creator      interfaces.StoredKnowledgeCreator
	secret       []byte
	now          func() time.Time
	ttl          time.Duration
}

// NewDirectUploadHandler wires the production tenant-aware factory around the
// existing storage backend resolver. S3-compatible R2 is enabled by selecting
// provider "s3" and configuring its R2 endpoint in the tenant backend.
func NewDirectUploadHandler(resolver interfaces.StorageBackendResolver) *DirectUploadHandler {
	return NewDirectUploadHandlerWithFactory(directUploadFactory(resolver), directUploadSecret())
}

// NewDirectUploadHandlerForKnowledge enables the optional end-to-end path:
// the token is bound to a concrete KB storage backend and completion imports
// the verified object through StoredKnowledgeCreator. The plain constructor
// remains available for generic S3/R2 object uploads and focused tests.
func NewDirectUploadHandlerForKnowledge(
	resolver interfaces.StorageBackendResolver,
	kbService interfaces.KnowledgeBaseService,
	creator interfaces.StoredKnowledgeCreator,
) *DirectUploadHandler {
	h := NewDirectUploadHandler(resolver)
	h.kbService = kbService
	h.creator = creator
	return h
}

// NewDirectUploadHandlerWithFactory is primarily useful for focused handler
// tests and for embedders that already own an S3-compatible signer.
func NewDirectUploadHandlerWithFactory(factory DirectUploadStoreFactory, secret []byte) *DirectUploadHandler {
	if len(secret) == 0 {
		secret = directUploadSecret()
	}
	return &DirectUploadHandler{
		storeFactory: factory,
		secret:       append([]byte(nil), secret...),
		now:          time.Now,
		ttl:          directUploadTTL(),
	}
}

type directUploadIntent struct {
	Version          int    `json:"v"`
	ID               string `json:"id"`
	TenantID         uint64 `json:"tenant_id"`
	KnowledgeBaseID  string `json:"knowledge_base_id,omitempty"`
	StorageBackendID string `json:"storage_backend_id,omitempty"`
	Provider         string `json:"provider,omitempty"`
	Key              string `json:"key"`
	FileName         string `json:"file_name"`
	Kind             string `json:"kind"`
	Size             int64  `json:"size"`
	ContentType      string `json:"content_type"`
	Multipart        bool   `json:"multipart"`
	PartSize         int64  `json:"part_size,omitempty"`
	PartCount        int64  `json:"part_count,omitempty"`
	BackendUploadID  string `json:"backend_upload_id,omitempty"`
	ExpiresAtUnix    int64  `json:"expires_at"`
}

type directUploadRequest struct {
	KnowledgeBaseID string `json:"knowledge_base_id"`
	FileName        string `json:"file_name"`
	Size            int64  `json:"size"`
	ContentType     string `json:"content_type"`
	Kind            string `json:"kind"`
	Multipart       bool   `json:"multipart"`
	PartSize        int64  `json:"part_size"`
}

type directUploadCompleteRequest struct {
	Token            string                           `json:"token"`
	KnowledgeBaseID  string                           `json:"knowledge_base_id"`
	FileName         string                           `json:"file_name"`
	Metadata         map[string]string                `json:"metadata"`
	EnableMultimodel *bool                            `json:"enable_multimodel"`
	CustomFileName   string                           `json:"custom_file_name"`
	TagIDs           []string                         `json:"tag_ids"`
	Channel          string                           `json:"channel"`
	ProcessConfig    *types.KnowledgeProcessOverrides `json:"process_config"`
	Parts            []directUploadPartRequest        `json:"parts"`
}

type directUploadPartRequest struct {
	PartNumber int32  `json:"part_number"`
	ETag       string `json:"etag"`
}

// Create starts a direct upload intent. The body is tiny metadata only; the
// browser sends bytes directly to the returned object-store URL.
func (h *DirectUploadHandler) Create(c *gin.Context) {
	if h == nil || h.storeFactory == nil {
		directUploadError(c, http.StatusServiceUnavailable, "direct upload is not configured")
		return
	}
	ctx := c.Request.Context()
	tenantID, ok := types.TenantIDFromContext(ctx)
	if !ok || tenantID == 0 {
		directUploadError(c, http.StatusUnauthorized, "tenant context is required")
		return
	}
	// Keep malformed or oversized metadata from being buffered by Gin's JSON
	// decoder. File bytes never pass through this request.
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, 64<<10)
	var req directUploadRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		directUploadError(c, http.StatusBadRequest, "invalid direct upload request")
		return
	}
	c.Set(directUploadVideoContextKey, directUploadRequestLooksVideo(req))
	if kbID := strings.TrimSpace(c.Param("id")); kbID != "" {
		if req.KnowledgeBaseID != "" && strings.TrimSpace(req.KnowledgeBaseID) != kbID {
			directUploadError(c, http.StatusForbidden, "knowledge base does not match upload scope")
			return
		}
		req.KnowledgeBaseID = kbID
	}
	fileName, kind, contentType, err := normalizeDirectUploadRequest(&req)
	if err != nil {
		directUploadError(c, http.StatusBadRequest, err.Error())
		return
	}
	if err := validateDirectUploadSize(kind, req.Size); err != nil {
		directUploadError(c, http.StatusBadRequest, err.Error())
		return
	}
	if req.Multipart && req.Size < directUploadMinPart {
		directUploadError(c, http.StatusBadRequest, "multipart uploads require at least a 5 MiB object")
		return
	}

	tenant, backendID, provider, err := h.tenantForKnowledgeBase(ctx, c, tenantID, req.KnowledgeBaseID)
	if err != nil {
		directUploadError(c, directUploadStatus(err), directUploadPublicError(err))
		return
	}
	if req.KnowledgeBaseID != "" {
		if h.creator == nil {
			directUploadError(c, http.StatusServiceUnavailable, "knowledge direct-upload capability is unavailable")
			return
		}
		if err := h.creator.ValidateStoredKnowledgeUpload(
			ctx, req.KnowledgeBaseID, fileName, req.Size, contentType,
		); err != nil {
			if appErr, ok := apperrors.IsAppError(err); ok {
				directUploadError(c, appErr.HTTPCode, appErr.Message)
			} else {
				directUploadError(c, http.StatusBadRequest, "direct upload is not allowed")
			}
			return
		}
	}
	store, err := h.storeFactory(ctx, tenant, backendID, provider)
	if err != nil {
		directUploadError(c, http.StatusServiceUnavailable, "direct upload storage is unavailable")
		return
	}
	id := uuid.NewString()
	prefix := ""
	if keyPrefixer, ok := store.(interface{ ObjectKeyPrefix() string }); ok {
		prefix = keyPrefixer.ObjectKeyPrefix()
	}
	key := directUploadObjectKey(tenantID, id, fileName, prefix, tenant.StorageEngineConfig)
	if key == "" {
		directUploadError(c, http.StatusBadRequest, "invalid upload object key")
		return
	}
	expiresAt := h.now().Add(h.ttl)
	intent := directUploadIntent{
		Version:          1,
		ID:               id,
		TenantID:         tenantID,
		KnowledgeBaseID:  strings.TrimSpace(req.KnowledgeBaseID),
		StorageBackendID: strings.TrimSpace(backendID),
		Provider:         strings.ToLower(strings.TrimSpace(provider)),
		Key:              key,
		FileName:         fileName,
		Kind:             kind,
		Size:             req.Size,
		ContentType:      contentType,
		Multipart:        req.Multipart,
		ExpiresAtUnix:    expiresAt.Unix(),
	}
	response := gin.H{
		"success":      true,
		"id":           id,
		"token":        "",
		"key":          key,
		"expires_at":   expiresAt.UTC().Format(time.RFC3339),
		"multipart":    req.Multipart,
		"content_type": contentType,
		"size":         req.Size,
	}
	if strings.TrimSpace(req.KnowledgeBaseID) != "" {
		response["knowledge_base_id"] = strings.TrimSpace(req.KnowledgeBaseID)
	}
	if req.Multipart {
		partSize := req.PartSize
		if partSize == 0 {
			partSize = directUploadPartSize
		}
		if partSize < directUploadMinPart || partSize > directUploadMaxPart {
			directUploadError(c, http.StatusBadRequest, "multipart part_size must be between 5 MiB and 5 GiB")
			return
		}
		partCount := (req.Size + partSize - 1) / partSize
		if partCount < 1 || partCount > directUploadMaxParts {
			directUploadError(c, http.StatusBadRequest, "multipart upload has too many parts")
			return
		}
		intent.PartSize = partSize
		intent.PartCount = partCount
		backendID, err := store.CreateMultipartUpload(ctx, key, contentType)
		if err != nil {
			directUploadError(c, http.StatusBadGateway, "could not start multipart upload")
			return
		}
		intent.BackendUploadID = backendID
		parts := make([]gin.H, 0, partCount)
		for partNumber := int32(1); partNumber <= int32(partCount); partNumber++ {
			expectedPartSize := partSize
			if remaining := req.Size - int64(partNumber-1)*partSize; remaining < expectedPartSize {
				expectedPartSize = remaining
			}
			part, err := store.PresignUploadPart(ctx, key, backendID, partNumber, expectedPartSize, h.ttl)
			if err != nil {
				// The MPU was created in this request and no token has been
				// returned yet, so aborting it cannot affect a knowledge-owned
				// object. Once a token is returned, Complete/Verify deliberately
				// avoid DeleteObject because those endpoints are replayable.
				_ = store.AbortMultipartUpload(ctx, key, backendID)
				directUploadError(c, http.StatusBadGateway, "could not sign multipart upload")
				return
			}
			parts = append(parts, directUploadRequestJSON(partNumber, part))
		}
		response["part_size"] = partSize
		response["part_count"] = partCount
		response["parts"] = parts
	} else {
		request, err := store.PresignPutObject(ctx, key, contentType, req.Size, h.ttl)
		if err != nil {
			directUploadError(c, http.StatusBadGateway, "could not sign upload")
			return
		}
		response["method"] = request.Method
		response["url"] = request.URL
		response["headers"] = request.Headers
	}
	response["token"] = h.encodeIntent(intent)
	c.JSON(http.StatusCreated, response)
}

// Complete completes an MPU (if applicable) and always calls HeadObject to
// verify the exact expected size before acknowledging the upload.
func (h *DirectUploadHandler) Complete(c *gin.Context) {
	if h == nil || h.storeFactory == nil {
		directUploadError(c, http.StatusServiceUnavailable, "direct upload is not configured")
		return
	}
	intent, store, err := h.intentAndStore(c)
	if err != nil {
		directUploadError(c, directUploadStatus(err), directUploadPublicError(err))
		return
	}
	var req directUploadCompleteRequest
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, 256<<10)
	if err := c.ShouldBindJSON(&req); err != nil {
		directUploadError(c, http.StatusBadRequest, "invalid completion request")
		return
	}
	if req.Token == "" {
		// intentAndStore already decoded the token from the request body or
		// X-Upload-Token header; keep this branch for a clear client error.
		directUploadError(c, http.StatusBadRequest, "upload token is required")
		return
	}
	if req.KnowledgeBaseID != "" && strings.TrimSpace(req.KnowledgeBaseID) != intent.KnowledgeBaseID {
		directUploadError(c, http.StatusForbidden, "knowledge base does not match upload token")
		return
	}
	// Re-decode from the body token after reading it. This avoids trusting any
	// path-only identifier and lets the same token be used by HEAD verification.
	intent, err = h.decodeAndAuthorize(c, req.Token)
	if err != nil {
		directUploadError(c, directUploadStatus(err), directUploadPublicError(err))
		return
	}
	tenant, backendID, provider, err := h.tenantForKnowledgeBase(
		c.Request.Context(), c, intent.TenantID, intent.KnowledgeBaseID,
	)
	if err != nil {
		directUploadError(c, directUploadStatus(err), directUploadPublicError(err))
		return
	}
	if err := validateIntentBackend(intent, backendID, provider); err != nil {
		directUploadError(c, directUploadStatus(err), directUploadPublicError(err))
		return
	}
	store, err = h.storeFactory(c.Request.Context(), tenant, backendID, provider)
	if err != nil {
		directUploadError(c, http.StatusServiceUnavailable, "direct upload storage is unavailable")
		return
	}
	if intent.Multipart {
		parts, err := normalizeCompletedParts(req.Parts)
		if err != nil {
			directUploadError(c, http.StatusBadRequest, err.Error())
			return
		}
		if intent.PartCount <= 0 || int64(len(parts)) != intent.PartCount {
			directUploadError(c, http.StatusBadRequest, "multipart completion must include every signed part")
			return
		}
		// Complete is retryable. If the object was already finalized by a prior
		// request, a second remote CompleteMultipartUpload can report "no such
		// upload"; an exact HEAD match is the idempotent authority.
		if existing, headErr := h.verifyHead(c, intent, store); headErr != nil || existing.Size != intent.Size {
			if completeErr := store.CompleteMultipartUpload(
				c.Request.Context(), intent.Key, intent.BackendUploadID, parts,
			); completeErr != nil {
				if _, headErr := h.verifyHead(c, intent, store); headErr != nil {
					directUploadError(c, http.StatusBadGateway, "could not complete multipart upload")
					return
				}
			}
		}
	} else if len(req.Parts) != 0 {
		directUploadError(c, http.StatusBadRequest, "parts are only valid for multipart uploads")
		return
	}
	info, err := h.verifyHead(c, intent, store)
	if err != nil {
		directUploadError(c, directUploadStatus(err), directUploadPublicError(err))
		return
	}
	if intent.KnowledgeBaseID != "" {
		if h.creator == nil {
			directUploadError(c, http.StatusServiceUnavailable, "knowledge direct-upload capability is unavailable")
			return
		}
		filePath := store.ObjectPath(intent.Key)
		if strings.TrimSpace(filePath) == "" {
			directUploadError(c, http.StatusServiceUnavailable, "direct upload storage is unavailable")
			return
		}
		knowledge, createErr := h.creator.CreateKnowledgeFromStoredObject(
			c.Request.Context(), intent.ID, intent.KnowledgeBaseID, intent.FileName, intent.Size,
			intent.ContentType, filePath, info.ETag,
			func(ctx context.Context) error { return store.DeleteObject(ctx, intent.Key) },
			req.Metadata, req.EnableMultimodel, req.CustomFileName, req.TagIDs, req.Channel, req.ProcessConfig,
		)
		if createErr != nil {
			// The creator rolls back only before the row adopts the object. Avoid
			// deleting an object after a persisted-row/tag/enqueue error.
			if appErr, ok := apperrors.IsAppError(createErr); ok {
				directUploadError(c, appErr.HTTPCode, appErr.Message)
			} else {
				directUploadError(c, http.StatusInternalServerError, "knowledge creation failed")
			}
			return
		}
		c.JSON(http.StatusOK, gin.H{
			"success": true, "status": "ready", "id": intent.ID, "key": intent.Key,
			"size": info.Size, "content_type": info.ContentType, "etag": info.ETag,
			"knowledge": knowledge,
		})
		return
	}
	h.respondHeadInfo(c, intent, info)
}

// Verify exposes the same HEAD check used after completion. The token may be
// supplied in `X-Upload-Token`; keeping it out of URLs avoids proxy/access-log
// leakage while making the request safe to retry after a network timeout.
func (h *DirectUploadHandler) Verify(c *gin.Context) {
	intent, store, err := h.intentAndStore(c)
	if err != nil {
		directUploadError(c, directUploadStatus(err), directUploadPublicError(err))
		return
	}
	h.respondHead(c, intent, store)
}

func (h *DirectUploadHandler) respondHead(
	c *gin.Context,
	intent directUploadIntent,
	store filesvc.PresignedObjectStore,
) {
	info, err := h.verifyHead(c, intent, store)
	if err != nil {
		directUploadError(c, directUploadStatus(err), directUploadPublicError(err))
		return
	}
	h.respondHeadInfo(c, intent, info)
}

func (h *DirectUploadHandler) verifyHead(
	c *gin.Context,
	intent directUploadIntent,
	store filesvc.PresignedObjectStore,
) (filesvc.PresignedObjectInfo, error) {
	info, err := store.HeadObject(c.Request.Context(), intent.Key)
	if err != nil {
		return filesvc.PresignedObjectInfo{}, errDirectUploadObjectUnavailable
	}
	if info.Size != intent.Size {
		return filesvc.PresignedObjectInfo{}, errDirectUploadObjectMismatch
	}
	if info.ContentType != "" && !sameMediaType(info.ContentType, intent.ContentType) {
		return filesvc.PresignedObjectInfo{}, errDirectUploadObjectMismatch
	}
	return info, nil
}

func (h *DirectUploadHandler) respondHeadInfo(
	c *gin.Context,
	intent directUploadIntent,
	info filesvc.PresignedObjectInfo,
) {
	c.JSON(http.StatusOK, gin.H{
		"success":      true,
		"status":       "ready",
		"id":           intent.ID,
		"key":          intent.Key,
		"size":         info.Size,
		"content_type": info.ContentType,
		"etag":         info.ETag,
	})
}

func (h *DirectUploadHandler) intentAndStore(c *gin.Context) (directUploadIntent, filesvc.PresignedObjectStore, error) {
	token := strings.TrimSpace(c.GetHeader("X-Upload-Token"))
	if c.Request.Method == http.MethodPost && token == "" {
		var peek struct {
			Token string `json:"token"`
		}
		// The body is consumed by Complete after this helper. Save the bytes and
		// restore the reader so ShouldBindJSON can decode it again.
		body, err := readAndRestoreBody(c, 256<<10)
		if err != nil {
			return directUploadIntent{}, nil, errDirectUploadBadRequest
		}
		if json.Unmarshal(body, &peek) == nil {
			token = strings.TrimSpace(peek.Token)
		}
	}
	intent, err := h.decodeAndAuthorize(c, token)
	if err != nil {
		return directUploadIntent{}, nil, err
	}
	tenant, backendID, provider, err := h.tenantForKnowledgeBase(
		c.Request.Context(), c, intent.TenantID, intent.KnowledgeBaseID,
	)
	if err != nil {
		return directUploadIntent{}, nil, err
	}
	if err := validateIntentBackend(intent, backendID, provider); err != nil {
		return directUploadIntent{}, nil, err
	}
	store, err := h.storeFactory(c.Request.Context(), tenant, backendID, provider)
	if err != nil {
		return directUploadIntent{}, nil, errDirectUploadStorage
	}
	return intent, store, nil
}

func (h *DirectUploadHandler) decodeAndAuthorize(c *gin.Context, token string) (directUploadIntent, error) {
	if strings.TrimSpace(token) == "" {
		return directUploadIntent{}, errDirectUploadBadRequest
	}
	intent, err := h.decodeIntent(token)
	if err != nil {
		return directUploadIntent{}, errDirectUploadForbidden
	}
	c.Set(directUploadVideoContextKey, intent.Kind == "video")
	currentTenantID, ok := types.TenantIDFromContext(c.Request.Context())
	if !ok || currentTenantID == 0 {
		return directUploadIntent{}, errDirectUploadUnauthorized
	}
	if intent.TenantID != currentTenantID {
		return directUploadIntent{}, errDirectUploadForbidden
	}
	if pathID := directUploadPathID(c); pathID != "" && pathID != intent.ID {
		return directUploadIntent{}, errDirectUploadForbidden
	}
	kbID := strings.TrimSpace(c.Param("id"))
	if kbID != "" && intent.KnowledgeBaseID != "" && kbID != intent.KnowledgeBaseID {
		return directUploadIntent{}, errDirectUploadForbidden
	}
	if intent.ExpiresAtUnix <= h.now().Unix() {
		return directUploadIntent{}, errDirectUploadExpired
	}
	return intent, nil
}

func directUploadPathID(c *gin.Context) string {
	if value := strings.TrimSpace(c.Param("upload_id")); value != "" {
		return value
	}
	if value := strings.TrimSpace(c.Param("uploadId")); value != "" {
		return value
	}
	// Keep compatibility with callers that mounted the handler at a generic
	// /uploads/:id route in older integrations; KB-scoped routes use
	// :upload_id so the KB's :id is never mistaken for an upload identifier.
	return strings.TrimSpace(c.Param("id"))
}

func (h *DirectUploadHandler) encodeIntent(intent directUploadIntent) string {
	payload, _ := json.Marshal(intent)
	encoded := base64.RawURLEncoding.EncodeToString(payload)
	mac := hmac.New(sha256.New, h.secret)
	_, _ = mac.Write([]byte(encoded))
	signature := base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
	return encoded + "." + signature
}

func (h *DirectUploadHandler) decodeIntent(token string) (directUploadIntent, error) {
	if len(token) > directUploadTokenLimit {
		return directUploadIntent{}, errDirectUploadForbidden
	}
	parts := strings.Split(token, ".")
	if len(parts) != 2 || parts[0] == "" || parts[1] == "" {
		return directUploadIntent{}, errDirectUploadForbidden
	}
	mac := hmac.New(sha256.New, h.secret)
	_, _ = mac.Write([]byte(parts[0]))
	signature, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil || !hmac.Equal(signature, mac.Sum(nil)) {
		return directUploadIntent{}, errDirectUploadForbidden
	}
	payload, err := base64.RawURLEncoding.DecodeString(parts[0])
	if err != nil || len(payload) > directUploadTokenLimit {
		return directUploadIntent{}, errDirectUploadForbidden
	}
	var intent directUploadIntent
	if err := json.Unmarshal(payload, &intent); err != nil ||
		intent.Version != 1 ||
		intent.ID == "" ||
		intent.TenantID == 0 ||
		intent.Key == "" ||
		intent.Size <= 0 ||
		intent.ExpiresAtUnix <= 0 {
		return directUploadIntent{}, errDirectUploadForbidden
	}
	return intent, nil
}

func directUploadRequestLooksVideo(req directUploadRequest) bool {
	return strings.EqualFold(strings.TrimSpace(req.Kind), "video") ||
		isDirectVideoName(req.FileName) ||
		strings.HasPrefix(strings.ToLower(strings.TrimSpace(req.ContentType)), "video/")
}

func normalizeDirectUploadRequest(req *directUploadRequest) (string, string, string, error) {
	fileName, err := utils.SafeFileName(strings.TrimSpace(req.FileName))
	if err != nil {
		return "", "", "", fmt.Errorf("invalid file_name")
	}
	if req.Size <= 0 {
		return "", "", "", fmt.Errorf("size must be positive")
	}
	contentType := strings.TrimSpace(req.ContentType)
	if len(contentType) > 255 {
		return "", "", "", fmt.Errorf("content_type is too long")
	}
	if contentType == "" {
		contentType = "application/octet-stream"
	}
	mediaType, _, err := mime.ParseMediaType(contentType)
	if err != nil {
		return "", "", "", fmt.Errorf("invalid content_type")
	}
	kind := strings.ToLower(strings.TrimSpace(req.Kind))
	extensionVideo := isDirectVideoName(fileName)
	mimeVideo := strings.HasPrefix(strings.ToLower(mediaType), "video/")
	isVideo := isDirectVideoFile(fileName, mediaType)
	if extensionVideo || mimeVideo {
		if !isVideo {
			return "", "", "", fmt.Errorf("video content_type and file extension must match")
		}
		// Sign one canonical media type. Browsers report MOV as
		// video/quicktime; accepting the legacy video/mov alias is harmless,
		// but the object and parser always see video/quicktime.
		if canonical, ok := directVideoContentType(fileName); ok {
			contentType = canonical
		}
	}
	if kind == "" {
		if isVideo {
			kind = "video"
		} else {
			kind = "document"
		}
	}
	if kind != "video" && kind != "document" {
		return "", "", "", fmt.Errorf("kind must be video or document")
	}
	if kind == "video" && !isVideo {
		return "", "", "", fmt.Errorf("kind=video requires a supported video MIME type and extension")
	}
	if isVideo && kind != "video" {
		return "", "", "", fmt.Errorf("video files must use kind=video")
	}
	return fileName, kind, contentType, nil
}

func validateDirectUploadSize(kind string, size int64) error {
	if kind == "video" {
		if size > utils.GetMaxVideoFileSizeBytes() {
			return fmt.Errorf("%s", directUploadTooLargePublicMessage)
		}
		return nil
	}
	if size > utils.GetMaxFileSize() {
		return fmt.Errorf("document size cannot exceed %d bytes", utils.GetMaxFileSize())
	}
	return nil
}

func directUploadObjectKey(
	tenantID uint64,
	uploadID, fileName, backendPrefix string,
	legacy *types.StorageEngineConfig,
) string {
	prefix := strings.Trim(strings.TrimSpace(backendPrefix), "/")
	if legacy != nil && legacy.S3 != nil {
		if prefix == "" {
			prefix = strings.Trim(strings.TrimSpace(legacy.S3.PathPrefix), "/")
		}
	}
	parts := []string{}
	if prefix != "" {
		parts = append(parts, prefix)
	}
	parts = append(parts, "direct", strconv.FormatUint(tenantID, 10), uploadID, fileName)
	key := path.Join(parts...)
	if strings.HasPrefix(key, "../") || strings.Contains(key, "..") {
		return ""
	}
	return key
}

func directUploadRequestJSON(partNumber int32, request filesvc.PresignedObjectRequest) gin.H {
	return gin.H{"part_number": partNumber, "method": request.Method, "url": request.URL, "headers": request.Headers}
}

func normalizeCompletedParts(parts []directUploadPartRequest) ([]filesvc.CompletedObjectPart, error) {
	if len(parts) == 0 || len(parts) > int(directUploadMaxParts) {
		return nil, fmt.Errorf("multipart completion requires 1-%d parts", directUploadMaxParts)
	}
	seen := make(map[int32]struct{}, len(parts))
	completed := make([]filesvc.CompletedObjectPart, 0, len(parts))
	for _, part := range parts {
		if part.PartNumber < 1 ||
			part.PartNumber > int32(directUploadMaxParts) ||
			strings.Trim(strings.TrimSpace(part.ETag), `"`) == "" {
			return nil, fmt.Errorf("each multipart part requires a valid part_number and etag")
		}
		if _, ok := seen[part.PartNumber]; ok {
			return nil, fmt.Errorf("multipart part numbers must be unique")
		}
		seen[part.PartNumber] = struct{}{}
		completed = append(completed, filesvc.CompletedObjectPart{
			PartNumber: part.PartNumber,
			ETag:       strings.Trim(strings.TrimSpace(part.ETag), `"`),
		})
	}
	// The store sorts and checks consecutiveness as a second defence. Requiring
	// consecutive parts here gives clients a deterministic 400 before a remote
	// CompleteMultipartUpload call.
	for i, part := range completed {
		if part.PartNumber != int32(i+1) {
			return nil, fmt.Errorf("multipart part numbers must start at 1 and be consecutive")
		}
	}
	return completed, nil
}

func isDirectVideoName(name string) bool {
	switch strings.ToLower(path.Ext(name)) {
	case ".mp4", ".mpeg", ".mov", ".webm":
		return true
	default:
		return false
	}
}

func directVideoContentType(name string) (string, bool) {
	switch strings.ToLower(path.Ext(strings.TrimSpace(name))) {
	case ".mp4":
		return "video/mp4", true
	case ".mpeg":
		return "video/mpeg", true
	case ".mov":
		return "video/quicktime", true
	case ".webm":
		return "video/webm", true
	default:
		return "", false
	}
}

func isDirectVideoFile(name, contentType string) bool {
	mediaType, _, err := mime.ParseMediaType(strings.TrimSpace(contentType))
	if err != nil || !strings.HasPrefix(strings.ToLower(mediaType), "video/") {
		return false
	}
	expected, ok := directVideoContentType(name)
	if !ok {
		return false
	}
	return strings.EqualFold(expected, mediaType) ||
		(strings.EqualFold(expected, "video/quicktime") &&
			strings.EqualFold(mediaType, "video/mov"))
}

func sameMediaType(a, b string) bool {
	aType, _, aErr := mimeParseMediaType(a)
	bType, _, bErr := mimeParseMediaType(b)
	return aErr == nil && bErr == nil && strings.EqualFold(aType, bType)
}

// Kept as a tiny indirection to make malformed MIME tests independent from
// any future parser package changes.
func mimeParseMediaType(value string) (string, map[string]string, error) {
	mediaType, params, err := mime.ParseMediaType(value)
	return mediaType, params, err
}

func tenantForDirectUpload(c *gin.Context, tenantID uint64) (*types.Tenant, error) {
	if tenant, ok := types.TenantInfoFromContext(c.Request.Context()); ok {
		// The auth middleware's effective tenant ID is authoritative. Never
		// silently replace a populated TenantInfo with a synthetic tenant: doing
		// so could resolve a backend/quota for a different tenant on admin paths.
		if tenant == nil || tenant.ID != tenantID {
			return nil, errDirectUploadForbidden
		}
		return tenant, nil
	}
	return &types.Tenant{ID: tenantID}, nil
}

func validateIntentBackend(intent directUploadIntent, backendID, provider string) error {
	expectedID := strings.TrimSpace(intent.StorageBackendID)
	actualID := strings.TrimSpace(backendID)
	if expectedID != "" && expectedID != actualID {
		return errDirectUploadBackendChanged
	}
	expectedProvider := strings.ToLower(strings.TrimSpace(intent.Provider))
	actualProvider := strings.ToLower(strings.TrimSpace(provider))
	if expectedProvider != "" && expectedProvider != actualProvider {
		return errDirectUploadBackendChanged
	}
	return nil
}

// tenantForKnowledgeBase binds a direct-upload intent to the KB's concrete
// storage backend. A missing KB id keeps the generic object-upload API useful,
// while production's end-to-end knowledge path always sends one and therefore
// cannot silently sign against the workspace default when a KB is bound to a
// different backend.
func (h *DirectUploadHandler) tenantForKnowledgeBase(
	ctx context.Context,
	c *gin.Context,
	tenantID uint64,
	kbID string,
) (*types.Tenant, string, string, error) {
	tenant, err := tenantForDirectUpload(c, tenantID)
	if err != nil {
		return nil, "", "", err
	}
	kbID = strings.TrimSpace(kbID)
	if kbID == "" || h.kbService == nil {
		return tenant, "", "", nil
	}
	kb, err := h.kbService.GetKnowledgeBaseByID(ctx, kbID)
	if err != nil || kb == nil {
		return nil, "", "", errDirectUploadKnowledgeBase
	}
	if kb.TenantID != tenantID {
		return nil, "", "", errDirectUploadForbidden
	}
	backendID := ""
	if kb.StorageBackendID != nil {
		backendID = strings.TrimSpace(*kb.StorageBackendID)
	}
	return tenant, backendID, kb.GetStorageProvider(), nil
}

func directUploadFactory(resolver interfaces.StorageBackendResolver) DirectUploadStoreFactory {
	return func(
		ctx context.Context,
		tenant *types.Tenant,
		backendID, provider string,
	) (filesvc.PresignedObjectStore, error) {
		if resolver == nil || tenant == nil || tenant.ID == 0 {
			return nil, errDirectUploadStorage
		}
		backend, err := resolver.ResolveBackend(ctx, tenant, strings.TrimSpace(backendID), strings.TrimSpace(provider))
		if err != nil {
			return nil, errDirectUploadStorage
		}
		if backend == nil && strings.TrimSpace(backendID) == "" {
			provider := ""
			if tenant.StorageEngineConfig != nil {
				provider = strings.ToLower(strings.TrimSpace(tenant.StorageEngineConfig.DefaultProvider))
				backend = types.StorageBackendFromLegacy(tenant.ID, provider, tenant.StorageEngineConfig)
			}
			if backend == nil {
				backend = types.StorageBackendFromEnvironment(tenant.ID)
			}
		}
		if backend == nil ||
			backend.TenantID != tenant.ID ||
			strings.ToLower(strings.TrimSpace(backend.Provider)) != "s3" {
			return nil, errDirectUploadStorage
		}
		store, err := filesvc.NewS3PresignedObjectStoreWithBackend(backend.Config, backend.ID)
		if err != nil {
			return nil, errDirectUploadStorage
		}
		return store, nil
	}
}

func directUploadSecret() []byte {
	for _, name := range []string{"WEKNORA_DIRECT_UPLOAD_SECRET", "JWT_SECRET"} {
		if value := strings.TrimSpace(os.Getenv(name)); value != "" {
			return []byte(value)
		}
	}
	secret := make([]byte, 32)
	if _, err := rand.Read(secret); err == nil {
		return secret
	}
	// crypto/rand is expected to be available in supported deployments. A
	// process-local fallback still prevents accepting attacker-chosen tokens if
	// the OS entropy source is temporarily unavailable.
	return []byte(uuid.NewString())
}

func directUploadTTL() time.Duration {
	value := strings.TrimSpace(os.Getenv("WEKNORA_DIRECT_UPLOAD_TTL_SECONDS"))
	if value == "" {
		return directUploadDefaultTTL
	}
	seconds, err := strconv.ParseInt(value, 10, 64)
	if err != nil || seconds <= 0 {
		return directUploadDefaultTTL
	}
	ttl := time.Duration(seconds) * time.Second
	if ttl < directUploadMinTTL {
		return directUploadMinTTL
	}
	if ttl > directUploadMaxTTL {
		return directUploadMaxTTL
	}
	return ttl
}

func readAndRestoreBody(c *gin.Context, limit int64) ([]byte, error) {
	body, err := io.ReadAll(io.LimitReader(c.Request.Body, limit+1))
	if err != nil || int64(len(body)) > limit {
		return nil, fmt.Errorf("request body too large")
	}
	c.Request.Body = io.NopCloser(bytes.NewReader(body))
	return body, nil
}

func directUploadError(c *gin.Context, status int, message string) {
	logger.Warnf(c.Request.Context(), "direct upload rejected status=%d detail=%s", status, message)
	video, _ := c.Get(directUploadVideoContextKey)
	isVideo, _ := video.(bool)
	c.AbortWithStatusJSON(status, gin.H{"success": false, "error": safeDirectUploadMessage(status, message, isVideo)})
}

func safeDirectUploadMessage(status int, detail string, isVideo bool) string {
	lower := strings.ToLower(strings.TrimSpace(detail))
	if strings.Contains(detail, directUploadTooLargePublicMessage) ||
		(strings.Contains(lower, "video") && strings.Contains(lower, "size") && strings.Contains(lower, "exceed")) {
		if isVideo {
			return directUploadTooLargePublicMessage
		}
		return directUploadFileTooLargePublicMessage
	}
	if strings.Contains(lower, "document size") && strings.Contains(lower, "exceed") {
		return directUploadFileTooLargePublicMessage
	}
	if strings.Contains(lower, "mime") || strings.Contains(lower, "content_type") ||
		strings.Contains(lower, "extension") || strings.Contains(lower, "supported video") {
		if isVideo {
			return directUploadFormatPublicMessage
		}
		return directUploadFileFormatPublicMessage
	}
	if status == http.StatusGone || strings.Contains(lower, "expired") {
		if isVideo {
			return directUploadExpiredPublicMessage
		}
		return directUploadFileExpiredPublicMessage
	}
	if strings.Contains(lower, "quota") {
		if isVideo {
			return "存储空间不足，无法上传视频"
		}
		return "存储空间不足，无法上传文件"
	}
	if isVideo {
		return directUploadFailedPublicMessage
	}
	return directUploadFileFailedPublicMessage
}

var (
	errDirectUploadBadRequest        = fmt.Errorf("upload token is required")
	errDirectUploadUnauthorized      = fmt.Errorf("tenant context is required")
	errDirectUploadForbidden         = fmt.Errorf("invalid or unauthorized upload token")
	errDirectUploadExpired           = fmt.Errorf("upload token has expired")
	errDirectUploadStorage           = fmt.Errorf("direct upload storage is unavailable")
	errDirectUploadKnowledgeBase     = fmt.Errorf("knowledge base is unavailable")
	errDirectUploadBackendChanged    = fmt.Errorf("knowledge base storage backend changed during upload")
	errDirectUploadObjectMismatch    = fmt.Errorf("uploaded object does not match signed request")
	errDirectUploadObjectUnavailable = fmt.Errorf("uploaded object is not available")
)

func directUploadStatus(err error) int {
	switch err {
	case errDirectUploadBadRequest:
		return http.StatusBadRequest
	case errDirectUploadUnauthorized:
		return http.StatusUnauthorized
	case errDirectUploadExpired:
		return http.StatusGone
	case errDirectUploadStorage:
		return http.StatusServiceUnavailable
	case errDirectUploadKnowledgeBase:
		return http.StatusNotFound
	case errDirectUploadBackendChanged:
		return http.StatusConflict
	case errDirectUploadObjectMismatch:
		return http.StatusBadRequest
	case errDirectUploadObjectUnavailable:
		return http.StatusConflict
	default:
		return http.StatusForbidden
	}
}

func directUploadPublicError(err error) string {
	switch err {
	case errDirectUploadBadRequest:
		return "upload token is required"
	case errDirectUploadUnauthorized:
		return "tenant context is required"
	case errDirectUploadExpired:
		return "upload token has expired"
	case errDirectUploadStorage:
		return "direct upload storage is unavailable"
	case errDirectUploadKnowledgeBase:
		return "knowledge base is unavailable"
	case errDirectUploadBackendChanged:
		return "knowledge base storage backend changed during upload"
	case errDirectUploadObjectMismatch:
		return "uploaded object does not match the signed request"
	case errDirectUploadObjectUnavailable:
		return "uploaded object is not available"
	default:
		return "invalid or unauthorized upload token"
	}
}
