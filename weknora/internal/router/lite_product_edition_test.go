package router

import "testing"

func TestNormalizeMusuwProductEdition(t *testing.T) {
	t.Parallel()

	tests := []struct {
		input string
		want  string
		ok    bool
	}{
		{input: "lite", want: "lite", ok: true},
		{input: " LITE ", want: "lite", ok: true},
		{input: "standard", want: "standard", ok: true},
		{input: "Standard", want: "standard", ok: true},
		{input: "", ok: false},
		{input: "full", ok: false},
		{input: "managed", ok: false},
	}

	for _, tt := range tests {
		t.Run(tt.input, func(t *testing.T) {
			t.Parallel()
			got, ok := normalizeMusuwProductEdition(tt.input)
			if got != tt.want || ok != tt.ok {
				t.Fatalf("normalizeMusuwProductEdition(%q) = (%q, %v), want (%q, %v)", tt.input, got, ok, tt.want, tt.ok)
			}
		})
	}
}
