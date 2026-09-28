package service

import (
	"context"
	"testing"

	"github.com/Tencent/WeKnora/internal/types"
)

func TestCollectImageURLs(t *testing.T) {
	ctx := context.Background()

	tests := []struct {
		name       string
		imageInfos []string
		wantURLs   []string
	}{
		{
			name:       "empty input",
			imageInfos: nil,
			wantURLs:   nil,
		},
		{
			name:       "empty strings",
			imageInfos: []string{"", ""},
			wantURLs:   nil,
		},
		{
			name: "single image",
			imageInfos: []string{
				`[{"url":"s3://bucket/prefix/123/exports/abc.png","original_url":"https://example.com/img.png"}]`,
			},
			wantURLs: []string{"s3://bucket/prefix/123/exports/abc.png"},
		},
		{
			name: "multiple images in one chunk",
			imageInfos: []string{
				`[{"url":"s3://bucket/a.png"},{"url":"s3://bucket/b.png"}]`,
			},
			wantURLs: []string{"s3://bucket/a.png", "s3://bucket/b.png"},
		},
		{
			name: "dedup across chunks — parent and child share same URL",
			imageInfos: []string{
				`[{"url":"s3://bucket/same.png"}]`,
				`[{"url":"s3://bucket/same.png"}]`,
				`[{"url":"s3://bucket/other.png"}]`,
			},
			wantURLs: []string{"s3://bucket/same.png", "s3://bucket/other.png"},
		},
		{
			name: "skip empty URL field",
			imageInfos: []string{
				`[{"url":"","original_url":"https://example.com/img.png"}]`,
			},
			wantURLs: nil,
		},
		{
			name: "invalid JSON — skipped with no panic",
			imageInfos: []string{
				`not valid json`,
				`[{"url":"s3://bucket/valid.png"}]`,
			},
			wantURLs: []string{"s3://bucket/valid.png"},
		},
		{
			name: "mixed providers",
			imageInfos: []string{
				`[{"url":"s3://bucket/img1.png"}]`,
				`[{"url":"minio://bucket/img2.jpg"}]`,
				`[{"url":"local://data/img3.webp"}]`,
			},
			wantURLs: []string{
				"s3://bucket/img1.png",
				"minio://bucket/img2.jpg",
				"local://data/img3.webp",
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := collectImageURLs(ctx, tt.imageInfos)

			if len(got) != len(tt.wantURLs) {
				t.Fatalf("collectImageURLs() returned %d URLs, want %d\ngot:  %v\nwant: %v",
					len(got), len(tt.wantURLs), got, tt.wantURLs)
			}
			for i, url := range got {
				if url != tt.wantURLs[i] {
					t.Errorf("collectImageURLs()[%d] = %q, want %q", i, url, tt.wantURLs[i])
				}
			}
		})
	}
}

func TestShouldPreserveExtractedImagesForFileBackedURLMarkdown(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name      string
		knowledge *types.Knowledge
		want      bool
	}{
		{
			name: "file-backed social markdown",
			knowledge: &types.Knowledge{
				Type:     "url",
				FilePath: "resource://tenant/social.md",
				FileName: "social.md",
				FileType: "md",
			},
			want: true,
		},
		{
			name: "case-insensitive markdown extension",
			knowledge: &types.Knowledge{
				Type:     "url",
				FilePath: "resource://tenant/social",
				FileName: "social.MD",
			},
			want: true,
		},
		{
			name:      "url without materialized file",
			knowledge: &types.Knowledge{Type: "url", FileName: "social.md", FileType: "md"},
			want:      false,
		},
		{
			name: "file-backed video",
			knowledge: &types.Knowledge{
				Type:     "url",
				FilePath: "resource://tenant/social.mp4",
				FileName: "social.mp4",
				FileType: "mp4",
			},
			want: false,
		},
		{
			name: "ordinary uploaded markdown",
			knowledge: &types.Knowledge{
				Type:     "file",
				FilePath: "resource://tenant/document.md",
				FileName: "document.md",
				FileType: "md",
			},
			want: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := shouldPreserveExtractedImagesForReparse(tt.knowledge); got != tt.want {
				t.Fatalf("shouldPreserveExtractedImagesForReparse() = %v, want %v", got, tt.want)
			}
		})
	}
}
