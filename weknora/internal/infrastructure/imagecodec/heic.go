// Package imagecodec normalizes image formats that downstream vision models
// cannot consume reliably.
package imagecodec

import (
	"bytes"
	"context"
	"encoding/binary"
	"errors"
	"fmt"
	"image/jpeg"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"sync"
	"time"
)

const (
	heicConversionTimeout = 20 * time.Second
	maxJPEGBytes          = 10 * 1024 * 1024
	maxJPEGPixelCount     = 40_000_000
	maxCommandOutputBytes = 8 * 1024
)

// NormalizeHEIC converts HEIC bytes to JPEG. Other image formats pass through
// without allocation. The boolean reports whether conversion was required.
func NormalizeHEIC(ctx context.Context, data []byte) ([]byte, bool, error) {
	if !IsHEIC(data) {
		return data, false, nil
	}

	converted, err := convertHEIC(ctx, data)
	if err != nil {
		return nil, true, err
	}
	return converted, true, nil
}

// IsHEIC identifies HEVC-backed HEIF containers from the ftyp box instead of
// trusting a CDN's Content-Type header or filename.
func IsHEIC(data []byte) bool {
	if len(data) < 12 || !bytes.Equal(data[4:8], []byte("ftyp")) {
		return false
	}

	boxEnd, brandStart, compatibleStart := ftypBounds(data)
	if boxEnd == 0 {
		return false
	}
	if isHEICBrand(data[brandStart : brandStart+4]) {
		return true
	}
	for offset := compatibleStart; offset+4 <= boxEnd; offset += 4 {
		if isHEICBrand(data[offset : offset+4]) {
			return true
		}
	}
	return false
}

func ftypBounds(data []byte) (boxEnd, brandStart, compatibleStart int) {
	size := uint64(binary.BigEndian.Uint32(data[:4]))
	brandStart, compatibleStart = 8, 16
	if size == 1 {
		if len(data) < 20 {
			return 0, 0, 0
		}
		size = binary.BigEndian.Uint64(data[8:16])
		brandStart, compatibleStart = 16, 24
	}
	if size == 0 || size > uint64(len(data)) {
		size = uint64(len(data))
	}
	if size < uint64(brandStart+4) {
		return 0, 0, 0
	}
	return int(size), brandStart, compatibleStart
}

func isHEICBrand(brand []byte) bool {
	switch string(brand) {
	case "heic", "heix", "hevc", "hevx", "heim", "heis", "hevm", "hevs":
		return true
	default:
		return false
	}
}

func convertHEIC(ctx context.Context, data []byte) ([]byte, error) {
	tempDir, err := os.MkdirTemp("", "weknora-heic-")
	if err != nil {
		return nil, fmt.Errorf("create HEIC conversion directory: %w", err)
	}
	defer func() { _ = os.RemoveAll(tempDir) }()

	inputPath := filepath.Join(tempDir, "input.heic")
	outputPath := filepath.Join(tempDir, "output.jpg")
	if err := os.WriteFile(inputPath, data, 0o600); err != nil {
		return nil, fmt.Errorf("write HEIC input: %w", err)
	}

	conversionCtx, cancel := context.WithTimeout(ctx, heicConversionTimeout)
	defer cancel()
	cmd := exec.CommandContext(
		conversionCtx, "heif-convert", "-q", "90", inputPath, outputPath,
	)
	commandOutput := &cappedCommandOutput{limit: maxCommandOutputBytes}
	cmd.Stdout = commandOutput
	cmd.Stderr = commandOutput
	if err := cmd.Run(); err != nil {
		if errors.Is(conversionCtx.Err(), context.DeadlineExceeded) {
			return nil, fmt.Errorf("HEIC conversion timed out: %w", conversionCtx.Err())
		}
		return nil, fmt.Errorf("HEIC conversion failed: %w: %s", err, truncate(commandOutput.String(), 512))
	}

	output, err := readLimited(outputPath, maxJPEGBytes)
	if err != nil {
		return nil, err
	}
	config, err := jpeg.DecodeConfig(bytes.NewReader(output))
	if err != nil {
		return nil, fmt.Errorf("HEIC converter returned invalid JPEG: %w", err)
	}
	if config.Width <= 0 || config.Height <= 0 || config.Width > maxJPEGPixelCount/config.Height {
		return nil, fmt.Errorf("converted JPEG exceeds %d pixel limit", maxJPEGPixelCount)
	}
	return output, nil
}

// cappedCommandOutput keeps a failed converter from filling application memory
// while still retaining enough output for a useful error message.
type cappedCommandOutput struct {
	mu    sync.Mutex
	data  []byte
	limit int
}

func (w *cappedCommandOutput) Write(p []byte) (int, error) {
	w.mu.Lock()
	defer w.mu.Unlock()

	if remaining := w.limit - len(w.data); remaining > 0 {
		if len(p) < remaining {
			remaining = len(p)
		}
		w.data = append(w.data, p[:remaining]...)
	}
	return len(p), nil
}

func (w *cappedCommandOutput) String() string {
	w.mu.Lock()
	defer w.mu.Unlock()
	return string(w.data)
}

func readLimited(name string, limit int64) ([]byte, error) {
	file, err := os.Open(name)
	if err != nil {
		return nil, fmt.Errorf("open converted JPEG: %w", err)
	}
	defer func() { _ = file.Close() }()

	data, err := io.ReadAll(io.LimitReader(file, limit+1))
	if err != nil {
		return nil, fmt.Errorf("read converted JPEG: %w", err)
	}
	if int64(len(data)) > limit {
		return nil, fmt.Errorf("converted JPEG exceeds %d byte limit", limit)
	}
	return data, nil
}

func truncate(value string, limit int) string {
	value = string(bytes.TrimSpace([]byte(value)))
	if len(value) <= limit {
		return value
	}
	return value[:limit]
}
