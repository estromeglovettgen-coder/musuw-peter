package service

import (
	"testing"

	"github.com/Tencent/WeKnora/internal/agent/tools"
	"github.com/Tencent/WeKnora/internal/config"
	"github.com/Tencent/WeKnora/internal/types"
	"github.com/stretchr/testify/require"
)

func TestAgentWebFetchSettingReachesToolRegistration(t *testing.T) {
	tests := []struct {
		name             string
		requestWebSearch bool
		agentWebFetch    bool
		wantWebSearch    bool
		wantWebFetch     bool
	}{
		{
			name:             "fetch disabled keeps search only",
			requestWebSearch: true,
			wantWebSearch:    true,
		},
		{
			name:             "fetch enabled registers both tools",
			requestWebSearch: true,
			agentWebFetch:    true,
			wantWebSearch:    true,
			wantWebFetch:     true,
		},
		{
			name:          "request disables the entire web tool pair",
			agentWebFetch: true,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			sessionSvc := &sessionService{
				cfg:                   &config.Config{},
				webSearchProviderRepo: &sharedAgentWebSearchRepo{},
			}
			req := &types.QARequest{
				Session:          &types.Session{ID: "session-1", TenantID: 1},
				WebSearchEnabled: tc.requestWebSearch,
				CustomAgent: &types.CustomAgent{
					TenantID: 1,
					Config: types.CustomAgentConfig{
						WebSearchEnabled: true,
						WebFetchEnabled:  tc.agentWebFetch,
					},
				},
			}

			agentConfig, err := sessionSvc.buildAgentConfig(
				t.Context(), req, &types.Tenant{ID: 1}, 1,
			)
			require.NoError(t, err)

			registry := tools.NewToolRegistry()
			agentSvc := &agentService{}
			require.NoError(t, agentSvc.registerTools(
				t.Context(), registry, agentConfig, nil, nil, "session-1",
			))
			require.Equal(t, tc.wantWebSearch, hasTool(registry, tools.ToolWebSearch))
			require.Equal(t, tc.wantWebFetch, hasTool(registry, tools.ToolWebFetch))
		})
	}
}
