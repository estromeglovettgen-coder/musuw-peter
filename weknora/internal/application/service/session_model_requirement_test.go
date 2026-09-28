package service

import (
	"context"
	"testing"

	"github.com/Tencent/WeKnora/internal/types"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestResolveChatModelIDRequiresConfiguredAgentModel(t *testing.T) {
	svc := &sessionService{
		modelService: &stubModelService{
			modelsByID: map[string]*types.Model{
				"builtin-chat": {
					ID:   "builtin-chat",
					Type: types.ModelTypeKnowledgeQA,
				},
			},
		},
	}
	req := &types.QARequest{
		Session: &types.Session{},
		CustomAgent: &types.CustomAgent{
			ID: "agent-1",
		},
		// Even a valid request-level model must not hide incomplete agent config.
		SummaryModelID: "builtin-chat",
	}

	modelID, err := svc.resolveChatModelID(context.Background(), req, nil, nil)

	require.Error(t, err)
	assert.Empty(t, modelID)
	assert.Contains(t, err.Error(), "model_id")
}

func TestResolveChatModelIDRejectsUnavailableConfiguredAgentModel(t *testing.T) {
	svc := &sessionService{
		modelService: &stubModelService{modelsByID: map[string]*types.Model{}},
	}
	req := &types.QARequest{
		Session: &types.Session{},
		CustomAgent: &types.CustomAgent{
			ID: "agent-1",
			Config: types.CustomAgentConfig{
				ModelID: "deleted-model",
			},
		},
	}

	modelID, err := svc.resolveChatModelID(context.Background(), req, nil, nil)

	require.Error(t, err)
	assert.Empty(t, modelID)
	assert.Contains(t, err.Error(), "unavailable")
}

func TestResolveChatModelIDUsesValidConfiguredAgentModel(t *testing.T) {
	svc := &sessionService{
		modelService: &stubModelService{
			modelsByID: map[string]*types.Model{
				"agent-chat": {
					ID:   "agent-chat",
					Type: types.ModelTypeKnowledgeQA,
				},
			},
		},
	}
	req := &types.QARequest{
		Session: &types.Session{},
		CustomAgent: &types.CustomAgent{
			ID: "agent-1",
			Config: types.CustomAgentConfig{
				ModelID: "agent-chat",
			},
		},
	}

	modelID, err := svc.resolveChatModelID(context.Background(), req, nil, nil)

	require.NoError(t, err)
	assert.Equal(t, "agent-chat", modelID)
}

func TestResolveChatModelIDRejectsNonChatSummaryModelOverride(t *testing.T) {
	svc := &sessionService{
		modelService: &stubModelService{
			modelsByID: map[string]*types.Model{
				"agent-chat": {
					ID:   "agent-chat",
					Type: types.ModelTypeKnowledgeQA,
				},
				"rerank-only": {
					ID:   "rerank-only",
					Type: types.ModelTypeRerank,
				},
			},
		},
	}
	req := &types.QARequest{
		Session: &types.Session{},
		CustomAgent: &types.CustomAgent{
			ID: "agent-1",
			Config: types.CustomAgentConfig{
				ModelID: "agent-chat",
			},
		},
		SummaryModelID: "rerank-only",
	}

	modelID, err := svc.resolveChatModelID(context.Background(), req, nil, nil)

	require.NoError(t, err)
	assert.Equal(t, "agent-chat", modelID)
}

func TestResolveChatModelIDUsesValidSummaryModelOverride(t *testing.T) {
	svc := &sessionService{
		modelService: &stubModelService{
			modelsByID: map[string]*types.Model{
				"agent-chat": {
					ID:   "agent-chat",
					Type: types.ModelTypeKnowledgeQA,
				},
				"override-chat": {
					ID:   "override-chat",
					Type: types.ModelTypeKnowledgeQA,
				},
			},
		},
	}
	req := &types.QARequest{
		Session: &types.Session{},
		CustomAgent: &types.CustomAgent{
			ID: "agent-1",
			Config: types.CustomAgentConfig{
				ModelID: "agent-chat",
			},
		},
		SummaryModelID: "override-chat",
	}

	modelID, err := svc.resolveChatModelID(context.Background(), req, nil, nil)

	require.NoError(t, err)
	assert.Equal(t, "override-chat", modelID)
}

func TestResolveChatModelIDUsesAllowedRuntimeModelForPlatformModes(t *testing.T) {
	svc := &sessionService{
		modelService: &stubModelService{
			modelsByID: map[string]*types.Model{
				types.PlatformKnowledgeBaseChatModelID: {
					ID:   types.PlatformKnowledgeBaseChatModelID,
					Type: types.ModelTypeKnowledgeQA,
				},
				"builtin-deepseek-v4-pro": {
					ID:   "builtin-deepseek-v4-pro",
					Type: types.ModelTypeKnowledgeQA,
				},
			},
		},
	}

	for _, tc := range []struct {
		name          string
		agentID       string
		configuredID  string
		requestModel  string
		expectedModel string
	}{
		{
			name:          "flash accepts a policy-approved runtime selection",
			agentID:       types.BuiltinQuickAnswerID,
			configuredID:  "builtin-deepseek-v4-flash",
			requestModel:  types.PlatformKnowledgeBaseChatModelID,
			expectedModel: types.PlatformKnowledgeBaseChatModelID,
		},
		{
			name:          "pro accepts a policy-approved runtime selection",
			agentID:       types.BuiltinSmartReasoningID,
			configuredID:  types.PlatformKnowledgeBaseChatModelID,
			requestModel:  "builtin-deepseek-v4-pro",
			expectedModel: "builtin-deepseek-v4-pro",
		},
	} {
		t.Run(tc.name, func(t *testing.T) {
			req := &types.QARequest{
				Session:        &types.Session{},
				SummaryModelID: tc.requestModel,
				CustomAgent: &types.CustomAgent{
					ID: tc.agentID,
					Config: types.CustomAgentConfig{
						ModelID: tc.configuredID,
					},
				},
			}

			modelID, err := svc.resolveChatModelID(context.Background(), req, nil, nil)

			require.NoError(t, err)
			assert.Equal(t, tc.expectedModel, modelID)
			assert.Equal(t, tc.expectedModel, req.CustomAgent.Config.ModelID)
			assert.Equal(t, tc.expectedModel, req.CustomAgent.Config.QueryUnderstandModelID)
		})
	}
}

func TestResolveChatModelIDRejectsUnavailableRuntimeModelForPlatformMode(t *testing.T) {
	svc := &sessionService{
		modelService: &stubModelService{
			modelsByID: map[string]*types.Model{
				"builtin-deepseek-v4-flash": {
					ID:   "builtin-deepseek-v4-flash",
					Type: types.ModelTypeKnowledgeQA,
				},
			},
		},
	}
	req := &types.QARequest{
		Session:        &types.Session{},
		SummaryModelID: "not-in-the-platform-catalog",
		CustomAgent: &types.CustomAgent{
			ID: types.BuiltinQuickAnswerID,
			Config: types.CustomAgentConfig{
				ModelID: "builtin-deepseek-v4-flash",
			},
		},
	}

	modelID, err := svc.resolveChatModelID(context.Background(), req, nil, nil)

	require.Error(t, err)
	assert.Empty(t, modelID)
	assert.Contains(t, err.Error(), "unavailable")
}

func TestResolveChatModelIDLiteOwnedRuntimeSelectionPrecedesStaleDefaults(t *testing.T) {
	t.Setenv("MUSUW_PRODUCT_EDITION", "lite")
	flash := consumerSceneModel(types.CheapestChatModelID, "Flash")
	pro := consumerSceneModel("builtin-deepseek-v4-pro", "Pro")
	repo := &consumerSceneModelRepo{models: []*types.Model{flash, pro}}
	svc := &sessionService{modelService: NewModelServiceWithEntitlement(
		repo, nil, nil, nil, nil, nil, &consumerSceneResolverEntitlement{plan: types.ConsumerPlanMax},
	)}
	for _, tc := range []struct {
		name, configured, requested string
		allowed                     bool
	}{
		{"downgraded paid default", pro.ID, flash.ID, true},
		{"removed default", "removed-model", flash.ID, true},
		{"empty default", "", flash.ID, true},
		{"paid override rejected", flash.ID, pro.ID, false},
		{"missing override rejected", flash.ID, "missing-model", false},
		{"no override retains configured model gate", pro.ID, "", false},
	} {
		t.Run(tc.name, func(t *testing.T) {
			ctx := contextWithConsumerPlan(41, types.ConsumerPlanFree)
			req := &types.QARequest{
				Session: &types.Session{TenantID: 41}, SummaryModelID: tc.requested,
				CustomAgent: &types.CustomAgent{ID: "owned-agent", TenantID: 41, Config: types.CustomAgentConfig{
					ModelID: tc.configured, QueryUnderstandModelID: tc.configured,
					SystemPrompt: "owned persona", KnowledgeBases: []string{"owned-kb"},
				}},
			}
			modelID, err := svc.resolveChatModelID(ctx, req, nil, nil)
			if tc.allowed {
				require.NoError(t, err)
				require.Equal(t, flash.ID, modelID)
				require.Equal(t, flash.ID, req.CustomAgent.Config.ModelID)
				require.Equal(t, flash.ID, req.CustomAgent.Config.QueryUnderstandModelID)
			} else {
				require.Error(t, err)
				require.Empty(t, modelID, "invalid explicit selection must not silently fall back")
				require.Equal(t, tc.configured, req.CustomAgent.Config.ModelID)
			}
			require.Equal(t, "owned persona", req.CustomAgent.Config.SystemPrompt)
			require.Equal(t, []string{"owned-kb"}, req.CustomAgent.Config.KnowledgeBases)
		})
	}
}

func TestResolveChatModelIDRuntimeSelectionDoesNotRelaxOtherAgentScopes(t *testing.T) {
	for _, tc := range []struct {
		name, edition string
		agentTenant   uint64
		sessionTenant uint64
		im            bool
	}{
		{"Standard keeps configured model requirement", "standard", 41, 41, false},
		{"Lite foreign agent", "lite", 99, 41, false},
		{"Lite foreign session", "lite", 41, 99, false},
		{"IM keeps configured model requirement", "lite", 41, 41, true},
	} {
		t.Run(tc.name, func(t *testing.T) {
			t.Setenv("MUSUW_PRODUCT_EDITION", tc.edition)
			ctx := contextWithConsumerPlan(41, types.ConsumerPlanFree)
			if tc.im {
				ctx = types.WithPrincipal(ctx, types.Principal{Type: types.PrincipalIMUser, ID: "im-user"})
			}
			svc := &sessionService{modelService: &stubModelService{modelsByID: map[string]*types.Model{
				types.CheapestChatModelID: {ID: types.CheapestChatModelID, Type: types.ModelTypeKnowledgeQA},
			}}}
			req := &types.QARequest{
				Session: &types.Session{TenantID: tc.sessionTenant}, SummaryModelID: types.CheapestChatModelID,
				CustomAgent: &types.CustomAgent{ID: "custom-agent", TenantID: tc.agentTenant},
			}
			modelID, err := svc.resolveChatModelID(ctx, req, nil, nil)
			require.Error(t, err)
			require.Empty(t, modelID)
		})
	}
}

func TestResolveChatModelIDWikiFixerFallsBackToKnowledgeBaseModel(t *testing.T) {
	svc := &sessionService{
		modelService: &stubModelService{
			modelsByID: map[string]*types.Model{
				"wiki-chat": {
					ID:   "wiki-chat",
					Type: types.ModelTypeKnowledgeQA,
				},
			},
		},
		knowledgeBaseService: &fakeAgentKnowledgeBaseService{
			kb: &types.KnowledgeBase{
				ID:             "wiki-kb",
				SummaryModelID: "wiki-chat",
			},
		},
	}
	req := &types.QARequest{
		Session: &types.Session{},
		CustomAgent: &types.CustomAgent{
			ID: types.BuiltinWikiFixerID,
		},
	}

	modelID, err := svc.resolveChatModelID(context.Background(), req, []string{"wiki-kb"}, nil)

	require.NoError(t, err)
	assert.Equal(t, "wiki-chat", modelID)
}

func TestResolveChatModelIDWikiFixerFallsBackToAvailableModel(t *testing.T) {
	svc := &sessionService{
		modelService: &stubModelService{
			availableModels: []*types.Model{
				{
					ID:   "system-chat",
					Type: types.ModelTypeKnowledgeQA,
				},
			},
		},
	}
	req := &types.QARequest{
		Session: &types.Session{},
		CustomAgent: &types.CustomAgent{
			ID: types.BuiltinWikiFixerID,
		},
	}

	modelID, err := svc.resolveChatModelID(context.Background(), req, nil, nil)

	require.NoError(t, err)
	assert.Equal(t, "system-chat", modelID)
}
