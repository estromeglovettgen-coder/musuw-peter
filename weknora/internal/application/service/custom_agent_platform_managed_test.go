package service

import (
	"context"
	"path/filepath"
	"testing"

	"github.com/Tencent/WeKnora/internal/application/repository"
	"github.com/Tencent/WeKnora/internal/types"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

func TestAnswerModesArePlatformManaged(t *testing.T) {
	t.Setenv("MUSUW_PRODUCT_EDITION", "lite")
	assert.True(t, isPlatformManagedBuiltinAgentID(types.BuiltinQuickAnswerID))
	assert.True(t, isPlatformManagedBuiltinAgentID(types.BuiltinSmartReasoningID))
	assert.False(t, isPlatformManagedBuiltinAgentID("custom-agent"))
}

func TestPeterStandardBuiltinConfigurationPersistsAndCopies(t *testing.T) {
	t.Setenv("MUSUW_PRODUCT_EDITION", "standard")
	require.NoError(t, types.LoadBuiltinAgentsConfig("../../../config"))
	db, err := gorm.Open(sqlite.Open(filepath.Join(t.TempDir(), "agents.db")), &gorm.Config{})
	require.NoError(t, err)
	sqlDB, err := db.DB()
	require.NoError(t, err)
	t.Cleanup(func() { _ = sqlDB.Close() })
	require.NoError(t, db.AutoMigrate(&types.CustomAgent{}))
	svc := &customAgentService{repo: repository.NewCustomAgentRepository(db)}
	ctx := context.WithValue(context.Background(), types.TenantIDContextKey, uint64(71))
	other := context.WithValue(context.Background(), types.TenantIDContextKey, uint64(72))

	for _, id := range []string{types.BuiltinQuickAnswerID, types.BuiltinSmartReasoningID} {
		t.Run(id, func(t *testing.T) {
			agent, err := svc.GetAgentByID(ctx, id)
			require.NoError(t, err)
			otherBefore, err := svc.GetAgentByID(other, id)
			require.NoError(t, err)
			agent.Config.ModelID = "peter-private-chat"
			agent.Config.SystemPrompt = "Use Peter's saved instructions."
			agent.Config.Temperature = 0.23
			agent.Config.MaxCompletionTokens = 1536
			agent.Config.MaxIterations = 9
			agent.Config.LLMCallTimeout = 45
			agent.Config.MCPSelectionMode = "selected"
			agent.Config.MCPServices = []string{"private-crm"}
			agent.Config.SkillsSelectionMode = "selected"
			agent.Config.SelectedSkills = []string{"sales-research"}
			agent.Config.SandboxConfigID = "private-sandbox"
			agent.Config.AllowedTools = []string{"knowledge_search", "shell_exec"}
			saved, err := svc.UpdateAgent(ctx, agent)
			require.NoError(t, err)
			reloaded, err := svc.GetAgentByID(ctx, id)
			require.NoError(t, err)
			require.Equal(t, saved.Config, reloaded.Config)
			require.Equal(t, agent.Config, reloaded.Config)
			listed, err := svc.ListAgents(ctx)
			require.NoError(t, err)
			found := false
			for _, item := range listed {
				if item.ID == id {
					require.Equal(t, saved.Config, item.Config)
					found = true
				}
			}
			require.True(t, found)
			copied, err := svc.CopyAgent(ctx, id)
			require.NoError(t, err)
			require.False(t, copied.IsBuiltin)
			require.NotEqual(t, id, copied.ID)
			require.Equal(t, saved.Config, copied.Config)
			require.ErrorIs(t, svc.DeleteAgent(ctx, id), ErrCannotDeleteBuiltin)
			otherAfter, err := svc.GetAgentByID(other, id)
			require.NoError(t, err)
			require.Equal(t, otherBefore.Config, otherAfter.Config)

			// Editing an existing override follows the same persistence path.
			reloaded.Config.SystemPrompt = "Revised Peter instructions."
			_, err = svc.UpdateAgent(ctx, reloaded)
			require.NoError(t, err)
			reloaded, err = svc.GetAgentByID(ctx, id)
			require.NoError(t, err)
			require.Equal(t, "Revised Peter instructions.", reloaded.Config.SystemPrompt)
		})
	}

	// Switching to the public product must not expose saved private overrides.
	t.Setenv("MUSUW_PRODUCT_EDITION", "lite")
	platform, err := svc.GetAgentByID(ctx, types.BuiltinSmartReasoningID)
	require.NoError(t, err)
	require.NotEqual(t, "peter-private-chat", platform.Config.ModelID)
	_, err = svc.UpdateAgent(ctx, platform)
	require.ErrorIs(t, err, ErrCannotModifyBuiltin)
}
