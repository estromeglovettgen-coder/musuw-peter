package imagecodec

import (
	"bytes"
	"context"
	"strings"
	"testing"
)

func TestIsHEICUsesContainerBrands(t *testing.T) {
	tests := []struct {
		name string
		data []byte
		want bool
	}{
		{name: "major brand", data: []byte("\x00\x00\x00\x1cftypheic\x00\x00\x00\x00mif1heicmiaf"), want: true},
		{name: "compatible brand", data: []byte("\x00\x00\x00\x1cftypmif1\x00\x00\x00\x00heicmiafxxxx"), want: true},
		{name: "multiview major brand", data: []byte("\x00\x00\x00\x18ftyphevm\x00\x00\x00\x00mif1hevm"), want: true},
		{name: "scalable major brand", data: []byte("\x00\x00\x00\x18ftyphevs\x00\x00\x00\x00mif1hevs"), want: true},
		{name: "avif is not HEIC", data: []byte("\x00\x00\x00\x18ftypavif\x00\x00\x00\x00mif1avif"), want: false},
		{name: "brand outside ftyp box", data: []byte("\x00\x00\x00\x10ftypmif1\x00\x00\x00\x00heic"), want: false},
		{name: "not ISO BMFF", data: []byte("this is not an image"), want: false},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			if got := IsHEIC(test.data); got != test.want {
				t.Fatalf("IsHEIC() = %v, want %v", got, test.want)
			}
		})
	}
}

func TestNormalizeHEICLeavesOtherFormatsUntouched(t *testing.T) {
	png := []byte("\x89PNG\r\n\x1a\nunchanged")
	got, converted, err := NormalizeHEIC(context.Background(), png)
	if err != nil {
		t.Fatalf("NormalizeHEIC: %v", err)
	}
	if converted {
		t.Fatal("PNG reported as converted")
	}
	if !bytes.Equal(got, png) || &got[0] != &png[0] {
		t.Fatal("PNG should pass through without allocation")
	}
}

func TestNormalizeHEICReportsMissingConverter(t *testing.T) {
	t.Setenv("PATH", t.TempDir())
	heic := []byte("\x00\x00\x00\x1cftypheic\x00\x00\x00\x00mif1heicmiaf")
	got, converted, err := NormalizeHEIC(context.Background(), heic)
	if err == nil {
		t.Fatal("expected missing heif-convert error")
	}
	if !converted {
		t.Fatal("HEIC should report that conversion was required")
	}
	if got != nil {
		t.Fatalf("failed conversion returned %d bytes", len(got))
	}
	if !strings.Contains(err.Error(), "executable file not found") {
		t.Fatalf("unexpected error: %v", err)
	}
}
