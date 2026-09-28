package service

import (
	"context"
	"errors"
	"testing"

	"github.com/Tencent/WeKnora/internal/models/provider"
	"github.com/Tencent/WeKnora/internal/types"
)

func TestConsumerModelPolicyRequiresBuiltinOpenRouterModel(t *testing.T) {
	t.Setenv("MUSUW_PRODUCT_EDITION", "lite")
	svc := &modelService{entitlement: &consumerSceneResolverEntitlement{plan: types.ConsumerPlanPlus}}

	cases := []struct {
		name    string
		model   *types.Model
		allowed bool
	}{
		{
			name: "platform openrouter builtin",
			model: &types.Model{
				IsBuiltin:  true,
				Source:     types.ModelSourceRemote,
				Parameters: types.ModelParameters{Provider: "openrouter", BaseURL: provider.OpenRouterBaseURL},
			},
			allowed: true,
		},
		{
			name: "platform openrouter builtin with canonical trailing slash",
			model: &types.Model{
				IsBuiltin: true,
				Source:    types.ModelSourceRemote,
				Parameters: types.ModelParameters{
					Provider: "openrouter",
					BaseURL:  provider.OpenRouterBaseURL + "/",
				},
			},
			allowed: true,
		},
		{
			name: "builtin mixed-case provider does not install OpenRouter transport",
			model: &types.Model{
				IsBuiltin: true,
				Source:    types.ModelSourceRemote,
				Parameters: types.ModelParameters{
					Provider: "OpenRouter",
					BaseURL:  provider.OpenRouterBaseURL,
				},
			},
			allowed: false,
		},
		{
			name: "builtin provider with surrounding whitespace is rejected",
			model: &types.Model{
				IsBuiltin: true,
				Source:    types.ModelSourceRemote,
				Parameters: types.ModelParameters{
					Provider: " openrouter",
					BaseURL:  provider.OpenRouterBaseURL,
				},
			},
			allowed: false,
		},
		{
			name: "manual openrouter model",
			model: &types.Model{
				IsBuiltin:  false,
				Source:     types.ModelSourceRemote,
				Parameters: types.ModelParameters{Provider: "openrouter", BaseURL: provider.OpenRouterBaseURL},
			},
			allowed: false,
		},
		{
			name: "builtin openrouter model with missing source",
			model: &types.Model{
				IsBuiltin: true,
				Parameters: types.ModelParameters{
					Provider: "openrouter",
					BaseURL:  provider.OpenRouterBaseURL,
				},
			},
			allowed: false,
		},
		{
			name: "builtin openrouter model with missing endpoint",
			model: &types.Model{
				IsBuiltin: true,
				Source:    types.ModelSourceRemote,
				Parameters: types.ModelParameters{
					Provider: "openrouter",
				},
			},
			allowed: false,
		},
		{
			name: "builtin non-openrouter model",
			model: &types.Model{
				IsBuiltin:  true,
				Parameters: types.ModelParameters{Provider: "openai"},
			},
			allowed: false,
		},
		{
			name: "builtin openrouter provider with local source",
			model: &types.Model{
				IsBuiltin:  true,
				Source:     types.ModelSourceLocal,
				Parameters: types.ModelParameters{Provider: "openrouter"},
			},
			allowed: false,
		},
		{
			name: "builtin openrouter provider with non-openrouter endpoint",
			model: &types.Model{
				IsBuiltin: true,
				Source:    types.ModelSourceRemote,
				Parameters: types.ModelParameters{
					Provider: "openrouter",
					BaseURL:  "https://api.openai.com/v1",
				},
			},
			allowed: false,
		},
		{
			name: "builtin openrouter model with surrounding whitespace in source",
			model: &types.Model{
				IsBuiltin: true,
				Source:    types.ModelSource(" remote"),
				Parameters: types.ModelParameters{
					Provider: "openrouter",
					BaseURL:  provider.OpenRouterBaseURL,
				},
			},
			allowed: false,
		},
		{
			name: "builtin openrouter model with surrounding whitespace in endpoint",
			model: &types.Model{
				IsBuiltin: true,
				Source:    types.ModelSourceRemote,
				Parameters: types.ModelParameters{
					Provider: "openrouter",
					BaseURL:  " " + provider.OpenRouterBaseURL,
				},
			},
			allowed: false,
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			allowed, err := svc.consumerPlanAllowsModel(context.Background(), tc.model)
			if err != nil {
				t.Fatalf("consumerPlanAllowsModel returned error: %v", err)
			}
			if allowed != tc.allowed {
				t.Fatalf("allowed=%v want=%v", allowed, tc.allowed)
			}
		})
	}
}

func TestLiteConsumerModelPolicyFailsClosedWithoutEntitlementMeter(t *testing.T) {
	t.Setenv("MUSUW_PRODUCT_EDITION", "lite")
	model := &types.Model{
		IsBuiltin: true,
		Source:    types.ModelSourceRemote,
		Parameters: types.ModelParameters{
			Provider: "openrouter",
			BaseURL:  provider.OpenRouterBaseURL,
		},
	}

	allowed, err := (&modelService{}).consumerPlanAllowsModel(contextWithConsumerPlan(1, types.ConsumerPlanPlus), model)
	if allowed || !errors.Is(err, errLiteModelEntitlementUnavailable) {
		t.Fatalf("allowed=%v err=%v, want fail-closed entitlement error", allowed, err)
	}
}

func TestConsumerModelPolicyPreservesStandardModelAuthority(t *testing.T) {
	t.Setenv("MUSUW_PRODUCT_EDITION", "standard")
	svc := &modelService{}

	for _, tc := range []struct {
		name  string
		model *types.Model
	}{
		{name: "nonbuiltin custom", model: &types.Model{Parameters: types.ModelParameters{Provider: "generic"}}},
		{name: "local builtin", model: &types.Model{IsBuiltin: true, Source: types.ModelSourceLocal, Parameters: types.ModelParameters{Provider: "ollama"}}},
		{name: "non-openrouter remote", model: &types.Model{IsBuiltin: true, Source: types.ModelSourceRemote, Parameters: types.ModelParameters{Provider: "openai", BaseURL: "https://api.openai.com/v1"}}},
		{name: "missing model metadata", model: &types.Model{}},
		{name: "nil model", model: nil},
	} {
		t.Run(tc.name, func(t *testing.T) {
			allowed, err := svc.consumerPlanAllowsModel(context.Background(), tc.model)
			if err != nil {
				t.Fatalf("consumerPlanAllowsModel returned error: %v", err)
			}
			if tc.model == nil {
				if allowed {
					t.Fatalf("standard nil model was unexpectedly allowed")
				}
				return
			}
			if !allowed {
				t.Fatalf("standard model authority rejected %s", tc.name)
			}
		})
	}
}
