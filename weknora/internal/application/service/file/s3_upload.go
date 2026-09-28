package file

import (
	"context"
	"fmt"
	"sort"
	"strings"
	"time"

	storageTypes "github.com/Tencent/WeKnora/internal/types"
	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/aws/signer/v4"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	s3types "github.com/aws/aws-sdk-go-v2/service/s3/types"
)

// PresignedObjectRequest is the small transport-neutral response needed by a
// browser direct upload. Signed headers must be sent exactly as returned (the
// Content-Type header is intentionally signed for both R2 and AWS S3).
type PresignedObjectRequest struct {
	URL     string
	Method  string
	Headers map[string]string
}

// PresignedObjectInfo is the subset of HeadObject metadata used to verify a
// completed direct upload.
type PresignedObjectInfo struct {
	Size        int64
	ContentType string
	ETag        string
}

// CompletedObjectPart is the client-reported ETag for one multipart part.
// The server, not the browser, submits these values to CompleteMultipartUpload
// after validating the signed upload token and tenant scope.
type CompletedObjectPart struct {
	PartNumber int32
	ETag       string
}

// PresignedObjectStore is implemented by S3-compatible object stores (R2 is
// one). Keeping this interface narrow lets the HTTP handler be tested without
// network calls while production reuses the existing AWS SDK v2 dependency.
type PresignedObjectStore interface {
	PresignPutObject(
		ctx context.Context,
		key, contentType string,
		size int64,
		expires time.Duration,
	) (PresignedObjectRequest, error)
	HeadObject(ctx context.Context, key string) (PresignedObjectInfo, error)
	// ObjectPath returns the provider URI persisted in Knowledge.FilePath.
	// DeleteObject is used to roll back an adopted object if DB persistence or
	// task enqueue fails before the normal knowledge pipeline owns it.
	ObjectPath(key string) string
	DeleteObject(ctx context.Context, key string) error
	CreateMultipartUpload(ctx context.Context, key, contentType string) (string, error)
	PresignUploadPart(
		ctx context.Context,
		key, uploadID string,
		partNumber int32,
		size int64,
		expires time.Duration,
	) (PresignedObjectRequest, error)
	CompleteMultipartUpload(ctx context.Context, key, uploadID string, parts []CompletedObjectPart) error
	AbortMultipartUpload(ctx context.Context, key, uploadID string) error
}

// S3PresignedObjectStore signs requests against an AWS S3 or S3-compatible
// endpoint. It intentionally does not probe/create the bucket; direct-upload
// signing is lazy and should not turn every app startup into a network call.
type S3PresignedObjectStore struct {
	client     *s3.Client
	presigner  *s3.PresignClient
	bucketName string
	backendID  string
	pathPrefix string
}

// NewS3PresignedObjectStore creates a direct-upload signer from the normalized
// tenant storage backend config. R2 uses provider "s3" with its S3 endpoint,
// access key, secret key, bucket and region (usually "auto").
func NewS3PresignedObjectStore(cfg storageTypes.StorageBackendConfig) (*S3PresignedObjectStore, error) {
	return newS3PresignedObjectStore(cfg, "")
}

// NewS3PresignedObjectStoreWithBackend creates a direct-upload signer scoped
// to a specific storage backend identity.
func NewS3PresignedObjectStoreWithBackend(
	cfg storageTypes.StorageBackendConfig,
	backendID string,
) (*S3PresignedObjectStore, error) {
	return newS3PresignedObjectStore(cfg, strings.TrimSpace(backendID))
}

func newS3PresignedObjectStore(
	cfg storageTypes.StorageBackendConfig,
	backendID string,
) (*S3PresignedObjectStore, error) {
	if strings.TrimSpace(cfg.Region) == "" {
		return nil, fmt.Errorf("S3 region is required")
	}
	if strings.TrimSpace(cfg.BucketName) == "" {
		return nil, fmt.Errorf("S3 bucket is required")
	}
	if (strings.TrimSpace(cfg.AccessKeyID) == "") != (strings.TrimSpace(cfg.SecretAccessKey) == "") {
		return nil, fmt.Errorf("S3 access key and secret key must be provided together")
	}
	base, err := newS3Client(
		strings.TrimSpace(cfg.Endpoint),
		strings.TrimSpace(cfg.AccessKeyID),
		strings.TrimSpace(cfg.SecretAccessKey),
		strings.TrimSpace(cfg.BucketName),
		strings.TrimSpace(cfg.Region),
		"",
		cfg.ForcePathStyle,
	)
	if err != nil {
		return nil, err
	}
	return &S3PresignedObjectStore{
		client:     base.client,
		presigner:  s3.NewPresignClient(base.client),
		bucketName: strings.TrimSpace(cfg.BucketName),
		backendID:  backendID,
		pathPrefix: strings.Trim(strings.TrimSpace(cfg.PathPrefix), "/"),
	}, nil
}

// PresignPutObject returns a signed single-request upload URL for key.
func (s *S3PresignedObjectStore) PresignPutObject(
	ctx context.Context,
	key, contentType string,
	size int64,
	expires time.Duration,
) (PresignedObjectRequest, error) {
	if err := validateDirectObjectKey(key); err != nil {
		return PresignedObjectRequest{}, err
	}
	request, err := s.presigner.PresignPutObject(ctx, &s3.PutObjectInput{
		Bucket:        aws.String(s.bucketName),
		Key:           aws.String(key),
		ContentType:   aws.String(contentType),
		ContentLength: aws.Int64(size),
	}, s3.WithPresignExpires(expires))
	if err != nil {
		return PresignedObjectRequest{}, fmt.Errorf("presign S3 PUT: %w", err)
	}
	return presignedRequest(request), nil
}

// HeadObject returns metadata for a previously uploaded object.
func (s *S3PresignedObjectStore) HeadObject(ctx context.Context, key string) (PresignedObjectInfo, error) {
	if err := validateDirectObjectKey(key); err != nil {
		return PresignedObjectInfo{}, err
	}
	output, err := s.client.HeadObject(ctx, &s3.HeadObjectInput{
		Bucket: aws.String(s.bucketName),
		Key:    aws.String(key),
	})
	if err != nil {
		return PresignedObjectInfo{}, fmt.Errorf("head S3 object: %w", err)
	}
	info := PresignedObjectInfo{
		ContentType: strings.TrimSpace(aws.ToString(output.ContentType)),
		ETag:        strings.Trim(aws.ToString(output.ETag), `"`),
	}
	if output.ContentLength != nil {
		info.Size = *output.ContentLength
	}
	return info, nil
}

// ObjectPath returns the provider path persisted for key.
func (s *S3PresignedObjectStore) ObjectPath(key string) string {
	if err := validateDirectObjectKey(key); err != nil || strings.TrimSpace(s.bucketName) == "" {
		return ""
	}
	providerPath := "s3://" + s.bucketName + "/" + strings.TrimLeft(key, "/")
	if s.backendID != "" {
		return storageTypes.BuildStorageBackendPath(s.backendID, providerPath)
	}
	return providerPath
}

// ObjectKeyPrefix returns the configured object-key prefix.
func (s *S3PresignedObjectStore) ObjectKeyPrefix() string {
	return s.pathPrefix
}

// DeleteObject removes key from the object store.
func (s *S3PresignedObjectStore) DeleteObject(ctx context.Context, key string) error {
	if err := validateDirectObjectKey(key); err != nil {
		return err
	}
	_, err := s.client.DeleteObject(ctx, &s3.DeleteObjectInput{
		Bucket: aws.String(s.bucketName),
		Key:    aws.String(key),
	})
	if err != nil {
		return fmt.Errorf("delete S3 object: %w", err)
	}
	return nil
}

// CreateMultipartUpload starts a multipart upload and returns its provider ID.
func (s *S3PresignedObjectStore) CreateMultipartUpload(ctx context.Context, key, contentType string) (string, error) {
	if err := validateDirectObjectKey(key); err != nil {
		return "", err
	}
	output, err := s.client.CreateMultipartUpload(ctx, &s3.CreateMultipartUploadInput{
		Bucket:      aws.String(s.bucketName),
		Key:         aws.String(key),
		ContentType: aws.String(contentType),
	})
	if err != nil {
		return "", fmt.Errorf("create S3 multipart upload: %w", err)
	}
	if strings.TrimSpace(aws.ToString(output.UploadId)) == "" {
		return "", fmt.Errorf("S3 returned an empty multipart upload ID")
	}
	return aws.ToString(output.UploadId), nil
}

// PresignUploadPart returns a signed URL for one multipart upload part.
func (s *S3PresignedObjectStore) PresignUploadPart(
	ctx context.Context,
	key, uploadID string,
	partNumber int32,
	size int64,
	expires time.Duration,
) (PresignedObjectRequest, error) {
	if err := validateDirectObjectKey(key); err != nil {
		return PresignedObjectRequest{}, err
	}
	if strings.TrimSpace(uploadID) == "" || partNumber < 1 || partNumber > 10_000 {
		return PresignedObjectRequest{}, fmt.Errorf("invalid multipart upload part")
	}
	request, err := s.presigner.PresignUploadPart(ctx, &s3.UploadPartInput{
		Bucket:        aws.String(s.bucketName),
		Key:           aws.String(key),
		UploadId:      aws.String(uploadID),
		PartNumber:    aws.Int32(partNumber),
		ContentLength: aws.Int64(size),
	}, s3.WithPresignExpires(expires))
	if err != nil {
		return PresignedObjectRequest{}, fmt.Errorf("presign S3 multipart part: %w", err)
	}
	return presignedRequest(request), nil
}

// CompleteMultipartUpload commits a multipart upload after validating parts.
func (s *S3PresignedObjectStore) CompleteMultipartUpload(
	ctx context.Context,
	key, uploadID string,
	parts []CompletedObjectPart,
) error {
	if err := validateDirectObjectKey(key); err != nil {
		return err
	}
	if strings.TrimSpace(uploadID) == "" || len(parts) == 0 {
		return fmt.Errorf("multipart upload ID and parts are required")
	}
	sorted := append([]CompletedObjectPart(nil), parts...)
	sort.Slice(sorted, func(i, j int) bool { return sorted[i].PartNumber < sorted[j].PartNumber })
	completed := make([]s3types.CompletedPart, 0, len(sorted))
	for i, part := range sorted {
		if part.PartNumber != int32(i+1) || strings.Trim(strings.TrimSpace(part.ETag), `"`) == "" {
			return fmt.Errorf("multipart parts must be consecutive and include ETags")
		}
		etag := strings.Trim(strings.TrimSpace(part.ETag), `"`)
		completed = append(completed, s3types.CompletedPart{
			PartNumber: aws.Int32(part.PartNumber),
			ETag:       aws.String(etag),
		})
	}
	_, err := s.client.CompleteMultipartUpload(ctx, &s3.CompleteMultipartUploadInput{
		Bucket:   aws.String(s.bucketName),
		Key:      aws.String(key),
		UploadId: aws.String(uploadID),
		MultipartUpload: &s3types.CompletedMultipartUpload{
			Parts: completed,
		},
	})
	if err != nil {
		return fmt.Errorf("complete S3 multipart upload: %w", err)
	}
	return nil
}

// AbortMultipartUpload cancels an in-progress multipart upload.
func (s *S3PresignedObjectStore) AbortMultipartUpload(ctx context.Context, key, uploadID string) error {
	if err := validateDirectObjectKey(key); err != nil {
		return err
	}
	if strings.TrimSpace(uploadID) == "" {
		return fmt.Errorf("multipart upload ID is required")
	}
	_, err := s.client.AbortMultipartUpload(ctx, &s3.AbortMultipartUploadInput{
		Bucket:   aws.String(s.bucketName),
		Key:      aws.String(key),
		UploadId: aws.String(uploadID),
	})
	if err != nil {
		return fmt.Errorf("abort S3 multipart upload: %w", err)
	}
	return nil
}

func presignedRequest(request *v4.PresignedHTTPRequest) PresignedObjectRequest {
	headers := make(map[string]string, len(request.SignedHeader))
	for key, values := range request.SignedHeader {
		// Browsers set Content-Length automatically and forbid callers from
		// overriding it via XHR/fetch. It is still included in the signature by
		// the SDK from the expected size passed to Presign*; only omit it from
		// the client-facing header map.
		if strings.EqualFold(key, "Content-Length") {
			continue
		}
		if len(values) > 0 {
			headers[key] = values[0]
		}
	}
	return PresignedObjectRequest{URL: request.URL, Method: request.Method, Headers: headers}
}

func validateDirectObjectKey(key string) error {
	if strings.TrimSpace(key) == "" {
		return fmt.Errorf("object key is required")
	}
	if strings.Contains(key, "..") || strings.HasPrefix(key, "/") {
		return fmt.Errorf("invalid object key")
	}
	return nil
}

var _ PresignedObjectStore = (*S3PresignedObjectStore)(nil)
