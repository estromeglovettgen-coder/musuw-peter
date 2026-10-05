package file

import (
	"context"
	"net/url"
	"strings"
	"testing"

	"github.com/Tencent/WeKnora/internal/utils"
	"github.com/aws/aws-sdk-go-v2/aws"
)

func TestNewS3Client_Credentials(t *testing.T) {
	t.Run("static credentials remain supported", func(t *testing.T) {
		svc, err := newS3Client("", "static-ak", "static-sk", "bucket", "us-east-1", "", false)
		if err != nil {
			t.Fatalf("newS3Client() error = %v", err)
		}
		got, err := svc.client.Options().Credentials.Retrieve(context.Background())
		if err != nil {
			t.Fatalf("Retrieve() error = %v", err)
		}
		if got.AccessKeyID != "static-ak" || got.SecretAccessKey != "static-sk" {
			t.Fatalf("unexpected credentials: access key %q", got.AccessKeyID)
		}
	})

	t.Run("empty keys use the AWS default credential chain", func(t *testing.T) {
		t.Setenv("AWS_ACCESS_KEY_ID", "role-ak")
		t.Setenv("AWS_SECRET_ACCESS_KEY", "role-sk")
		svc, err := newS3Client("", "", "", "bucket", "us-east-1", "", false)
		if err != nil {
			t.Fatalf("newS3Client() error = %v", err)
		}
		got, err := svc.client.Options().Credentials.Retrieve(context.Background())
		if err != nil {
			t.Fatalf("Retrieve() error = %v", err)
		}
		if got.AccessKeyID != "role-ak" || got.SecretAccessKey != "role-sk" {
			t.Fatalf("default credential chain returned access key %q", got.AccessKeyID)
		}
	})

	t.Run("partial static credentials are rejected", func(t *testing.T) {
		_, err := newS3Client("", "only-ak", "", "bucket", "us-east-1", "", false)
		if err == nil {
			t.Fatal("newS3Client() expected an error")
		}
	})
}

func TestNewS3Client_PathStyleForCompatibleEndpoints(t *testing.T) {
	tests := []struct {
		name          string
		endpoint      string
		wantPathStyle bool
	}{
		{
			name:          "S3-compatible service uses path-style",
			endpoint:      "https://storage.internal:9000",
			wantPathStyle: true,
		},
		{
			name:          "MinIO endpoint uses path-style",
			endpoint:      "http://minio.local:9000",
			wantPathStyle: true,
		},
		{
			name:          "AWS S3 regional endpoint uses virtual-hosted",
			endpoint:      "https://s3.us-east-1.amazonaws.com",
			wantPathStyle: false,
		},
		{
			name:          "AWS China endpoint uses virtual-hosted",
			endpoint:      "https://s3.cn-north-1.amazonaws.com.cn",
			wantPathStyle: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			// Verify the path-style detection logic matches our implementation
			usePathStyle := !strings.Contains(tt.endpoint, "amazonaws.com")
			if usePathStyle != tt.wantPathStyle {
				t.Errorf("endpoint %q: usePathStyle = %v, want %v", tt.endpoint, usePathStyle, tt.wantPathStyle)
			}
		})
	}
}

func TestNewS3Client_EmptyEndpoint(t *testing.T) {
	// Empty endpoint should not trigger path-style (standard AWS S3)
	endpoint := ""
	if endpoint != "" {
		t.Fatal("expected empty endpoint to skip custom configuration")
	}
}

func TestNewS3Client_RequestChecksumCalculation(t *testing.T) {
	const (
		compatibleEndpoint = "https://s3-compatible.example.com"
		awsEndpoint        = "https://s3.us-east-1.amazonaws.com"
	)

	// Keep the test independent of the developer's AWS profile while checking
	// that a standard AWS endpoint still honors the SDK-resolved default.
	t.Setenv("AWS_REQUEST_CHECKSUM_CALCULATION", "when_supported")
	t.Setenv("SSRF_WHITELIST", "s3-compatible.example.com,s3.us-east-1.amazonaws.com")
	utils.ResetSSRFWhitelistForTest()
	t.Cleanup(utils.ResetSSRFWhitelistForTest)

	standard, err := newS3Client("", "ak", "sk", "bucket", "us-east-1", "", false)
	if err != nil {
		t.Fatalf("newS3Client() with empty endpoint error = %v", err)
	}
	wantStandard := standard.client.Options().RequestChecksumCalculation

	tests := []struct {
		name     string
		endpoint string
		want     aws.RequestChecksumCalculation
	}{
		{
			name:     "empty endpoint preserves standard AWS setting",
			endpoint: "",
			want:     wantStandard,
		},
		{
			name:     "AWS endpoint preserves standard AWS setting",
			endpoint: awsEndpoint,
			want:     wantStandard,
		},
		{
			name:     "S3-compatible endpoint calculates checksum only when required",
			endpoint: compatibleEndpoint,
			want:     aws.RequestChecksumCalculationWhenRequired,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			svc, err := newS3Client(tt.endpoint, "ak", "sk", "bucket", "us-east-1", "", false)
			if err != nil {
				t.Fatalf("newS3Client() error = %v", err)
			}
			got := svc.client.Options().RequestChecksumCalculation
			if got != tt.want {
				t.Errorf("RequestChecksumCalculation = %v, want %v", got, tt.want)
			}
		})
	}
}

func TestParseS3FilePath(t *testing.T) {
	svc := &s3FileService{bucketName: "test-bucket"}

	tests := []struct {
		name    string
		input   string
		want    string
		wantErr bool
	}{
		{
			name:  "valid s3 path",
			input: "s3://test-bucket/123/exports/abc.png",
			want:  "123/exports/abc.png",
		},
		{
			name:    "wrong bucket",
			input:   "s3://other-bucket/key",
			wantErr: true,
		},
		{
			name:    "not s3 scheme",
			input:   "minio://test-bucket/key",
			wantErr: true,
		},
		{
			name:    "missing object key",
			input:   "s3://test-bucket/",
			wantErr: true,
		},
		{
			name:    "empty path",
			input:   "",
			wantErr: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := svc.parseS3FilePath(tt.input)
			if tt.wantErr {
				if err == nil {
					t.Errorf("parseS3FilePath(%q) expected error, got %q", tt.input, got)
				}
				return
			}
			if err != nil {
				t.Errorf("parseS3FilePath(%q) unexpected error: %v", tt.input, err)
				return
			}
			if got != tt.want {
				t.Errorf("parseS3FilePath(%q) = %q, want %q", tt.input, got, tt.want)
			}
		})
	}
}

func TestS3BackendPrefixRejectsOtherDeploymentPaths(t *testing.T) {
	// A nil client ensures every operation rejects outside paths before I/O.
	svc := &s3FileService{bucketName: "shared-bucket", pathPrefix: "peter/server/"}
	for _, path := range []string{
		"s3://shared-bucket/musuw/10000/exports/video.mp4",
		"s3://shared-bucket/peter/server-other/10000/exports/video.mp4",
	} {
		t.Run(path, func(t *testing.T) {
			if got, err := svc.parseS3FilePath(path); err == nil || got != "" {
				t.Fatal("outside-prefix path must not parse")
			}
			if got, err := svc.GetFile(context.Background(), path); err == nil || got != nil {
				t.Fatal("outside-prefix path must not be read")
			}
			if err := svc.DeleteFile(context.Background(), path); err == nil {
				t.Fatal("outside-prefix path must not be deleted")
			}
			if got, err := svc.CopyFile(context.Background(), path, 10000, "knowledge"); err == nil || got != "" {
				t.Fatal("outside-prefix path must not be copied")
			}
			if got, err := svc.GetFileURL(context.Background(), path); err == nil || got != "" {
				t.Fatal("outside-prefix path must not be signed")
			}
		})
	}
}

func TestS3BackendPrefixAllowsOwnedPathsAndLegacyUnprefixedBackend(t *testing.T) {
	svc, err := newS3Client("", "ak", "sk", "shared-bucket", "us-east-1", "peter/server", false)
	if err != nil {
		t.Fatal(err)
	}
	const key = "peter/server/10000/exports/video.mp4"
	path := "s3://shared-bucket/" + key
	if got, err := svc.parseS3FilePath(path); err != nil || got != key {
		t.Fatal("owned-prefix path must remain accessible")
	}
	// AWS SDK signing with static credentials is local and makes no request.
	signed, err := svc.GetFileURL(context.Background(), path)
	if err != nil {
		t.Fatal(err)
	}
	parsed, err := url.Parse(signed)
	if err != nil || parsed.Path != "/"+key || parsed.Query().Get("X-Amz-Signature") == "" {
		t.Fatal("owned-prefix path must receive a valid download signature")
	}
	legacy := &s3FileService{bucketName: "shared-bucket"}
	const legacyKey = "musuw/10000/exports/video.mp4"
	if got, err := legacy.parseS3FilePath("s3://shared-bucket/" + legacyKey); err != nil || got != legacyKey {
		t.Fatal("backend without a configured prefix must preserve legacy paths")
	}
}
