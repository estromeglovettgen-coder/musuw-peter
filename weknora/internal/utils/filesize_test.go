package utils

import "testing"

func TestGetMaxVideoFileSizeBytesDefault(t *testing.T) {
	if got := GetMaxVideoFileSizeBytes(); got != 300_000_000 {
		t.Fatalf("default video upload limit = %d, want 300000000", got)
	}
}

func TestGetMaxVideoFileSizeBytesCannotDriftFromPublicBoundary(t *testing.T) {
	t.Setenv("VIDEO_MAX_BYTES", "8")
	if got := GetMaxVideoFileSizeBytes(); got != 300_000_000 {
		t.Fatalf("legacy environment override changed product boundary: %d", got)
	}
}
