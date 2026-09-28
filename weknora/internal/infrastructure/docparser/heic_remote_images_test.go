package docparser

import (
	"bytes"
	"context"
	"fmt"
	"image"
	"image/color"
	"image/jpeg"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/Tencent/WeKnora/internal/types"
	secutils "github.com/Tencent/WeKnora/internal/utils"
)

func TestResolveRemoteImages_NormalizesMislabelledHEICBeforeStorage(t *testing.T) {
	originalWhitelist, hadWhitelist := os.LookupEnv("SSRF_WHITELIST")
	jpegPath, converterDir := installFakeHEICConverter(t)
	t.Setenv("MUSUW_TEST_JPEG", jpegPath)
	t.Setenv("PATH", converterDir+string(os.PathListSeparator)+os.Getenv("PATH"))

	heicData := append([]byte(nil), []byte("\x00\x00\x00\x1cftypheic\x00\x00\x00\x00mif1heicmiaf")...)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		// Reproduces the TikHub/Douyin response: the header claims PNG while
		// the bytes are an HEIC container.
		w.Header().Set("Content-Type", "image/png")
		_, _ = w.Write(heicData)
	}))
	t.Cleanup(server.Close)

	host := strings.TrimPrefix(server.URL, "http://")
	t.Setenv("SSRF_WHITELIST", "127.0.0.1,localhost")
	t.Setenv("IMAGE_HOST_KEEP_URL", host)
	secutils.ResetSSRFWhitelistForTest()
	t.Cleanup(func() {
		if hadWhitelist {
			_ = os.Setenv("SSRF_WHITELIST", originalWhitelist)
		} else {
			_ = os.Unsetenv("SSRF_WHITELIST")
		}
		secutils.ResetSSRFWhitelistForTest()
	})

	files := &mockFileService{}
	updated, images, err := NewImageResolver().ResolveRemoteImages(
		context.Background(), fmt.Sprintf("![photo](%s/photo.png)", server.URL), files, 42,
	)
	if err != nil {
		t.Fatalf("ResolveRemoteImages: %v", err)
	}
	if len(images) != 1 {
		t.Fatalf("stored images = %d, want 1", len(images))
	}
	if len(files.saved) != 1 {
		t.Fatalf("saved files = %d, want 1", len(files.saved))
	}
	if images[0].MimeType != "image/jpeg" {
		t.Fatalf("stored MIME = %q, want image/jpeg", images[0].MimeType)
	}
	if ext := filepath.Ext(files.saved[0].FileName); ext != ".jpg" {
		t.Fatalf("stored extension = %q, want .jpg", ext)
	}
	if _, err := jpeg.Decode(bytes.NewReader(files.saved[0].Data)); err != nil {
		t.Fatalf("stored bytes are not JPEG: %v", err)
	}
	if strings.Contains(updated, server.URL) {
		t.Fatalf("converted HEIC must be served from storage, got %q", updated)
	}
}

func TestResolveAndStore_NormalizesMislabelledHEICImageRef(t *testing.T) {
	jpegPath, converterDir := installFakeHEICConverter(t)
	t.Setenv("MUSUW_TEST_JPEG", jpegPath)
	t.Setenv("PATH", converterDir+string(os.PathListSeparator)+os.Getenv("PATH"))

	files := &mockFileService{}
	result := &types.ReadResult{
		MarkdownContent: "![uploaded image](photo.png)",
		ImageRefs: []types.ImageRef{{
			Filename:    "photo.png",
			OriginalRef: "photo.png",
			MimeType:    "image/png",
			ImageData:   []byte("\x00\x00\x00\x1cftypheic\x00\x00\x00\x00mif1heicmiaf"),
			IsOriginal:  true,
		}},
	}

	updated, images, err := NewImageResolver().ResolveAndStore(
		context.Background(), result, files, 42,
	)
	if err != nil {
		t.Fatalf("ResolveAndStore: %v", err)
	}
	if len(images) != 1 || len(files.saved) != 1 {
		t.Fatalf("stored images/files = %d/%d, want 1/1", len(images), len(files.saved))
	}
	if images[0].MimeType != "image/jpeg" {
		t.Fatalf("stored MIME = %q, want image/jpeg", images[0].MimeType)
	}
	if ext := filepath.Ext(files.saved[0].FileName); ext != ".jpg" {
		t.Fatalf("stored extension = %q, want .jpg", ext)
	}
	if _, err := jpeg.Decode(bytes.NewReader(files.saved[0].Data)); err != nil {
		t.Fatalf("stored bytes are not JPEG: %v", err)
	}
	if !strings.Contains(updated, "local://images/") || !strings.Contains(updated, ".jpg") {
		t.Fatalf("updated markdown did not reference normalized JPEG: %q", updated)
	}
}

func TestDownloadImageAcceptsHEICWithGenericContentType(t *testing.T) {
	heicData := []byte("\x00\x00\x00\x1cftypheic\x00\x00\x00\x00mif1heicmiaf")
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/octet-stream")
		_, _ = w.Write(heicData)
	}))
	t.Cleanup(server.Close)

	data, mimeType, err := downloadImage(context.Background(), server.Client(), server.URL)
	if err != nil {
		t.Fatalf("downloadImage: %v", err)
	}
	if !bytes.Equal(data, heicData) {
		t.Fatal("downloadImage changed HEIC bytes before normalization")
	}
	if mimeType != "image/heic" {
		t.Fatalf("detected MIME = %q, want image/heic", mimeType)
	}
}

func installFakeHEICConverter(t *testing.T) (jpegPath, converterDir string) {
	t.Helper()
	dir := t.TempDir()

	img := image.NewRGBA(image.Rect(0, 0, 200, 200))
	for y := 0; y < 200; y++ {
		for x := 0; x < 200; x++ {
			img.Set(x, y, color.RGBA{R: byte(x), G: byte(y), B: 96, A: 255})
		}
	}
	var encoded bytes.Buffer
	if err := jpeg.Encode(&encoded, img, &jpeg.Options{Quality: 90}); err != nil {
		t.Fatalf("encode test JPEG: %v", err)
	}
	jpegPath = filepath.Join(dir, "expected.jpg")
	if err := os.WriteFile(jpegPath, encoded.Bytes(), 0o600); err != nil {
		t.Fatalf("write test JPEG: %v", err)
	}

	converter := filepath.Join(dir, "heif-convert")
	script := "#!/bin/sh\ncp \"$MUSUW_TEST_JPEG\" \"$4\"\n"
	if err := os.WriteFile(converter, []byte(script), 0o700); err != nil {
		t.Fatalf("write fake heif-convert: %v", err)
	}
	return jpegPath, dir
}
