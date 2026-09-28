package service

import "testing"

func TestEffectiveWebSearchEnabled(t *testing.T) {
	t.Run("Lite forces omitted or false requests on", func(t *testing.T) {
		t.Setenv("MUSUW_PRODUCT_EDITION", "lite")
		if !effectiveWebSearchEnabled(false) || !effectiveWebSearchEnabled(true) {
			t.Fatal("Lite web search must be mandatory")
		}
	})

	t.Run("Standard preserves the native request choice", func(t *testing.T) {
		t.Setenv("MUSUW_PRODUCT_EDITION", "standard")
		if effectiveWebSearchEnabled(false) {
			t.Fatal("Standard false request must remain false")
		}
		if !effectiveWebSearchEnabled(true) {
			t.Fatal("Standard true request must remain true")
		}
	})
}

func TestEffectiveWebSearchEnabledWithAgentRequestIntersection(t *testing.T) {
	t.Run("Lite ignores stale agent and request switches", func(t *testing.T) {
		t.Setenv("MUSUW_PRODUCT_EDITION", "lite")
		for _, agentConfigured := range []bool{false, true} {
			for _, requested := range []bool{false, true} {
				if !effectiveWebSearchEnabled(agentConfigured && requested) {
					t.Fatalf("Lite must force web search on for agent=%v request=%v", agentConfigured, requested)
				}
			}
		}
	})

	t.Run("Standard keeps native agent/request intersection", func(t *testing.T) {
		t.Setenv("MUSUW_PRODUCT_EDITION", "standard")
		for _, tt := range []struct {
			agentConfigured bool
			requested       bool
			want            bool
		}{
			{agentConfigured: false, requested: false, want: false},
			{agentConfigured: false, requested: true, want: false},
			{agentConfigured: true, requested: false, want: false},
			{agentConfigured: true, requested: true, want: true},
		} {
			if got := effectiveWebSearchEnabled(tt.agentConfigured && tt.requested); got != tt.want {
				t.Fatalf("Standard agent=%v request=%v = %v, want %v", tt.agentConfigured, tt.requested, got, tt.want)
			}
		}
	})
}
