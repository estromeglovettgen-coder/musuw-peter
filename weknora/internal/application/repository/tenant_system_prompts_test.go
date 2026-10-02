package repository

import (
	"context"
	"testing"

	"github.com/Tencent/WeKnora/internal/types"
	"github.com/stretchr/testify/require"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

func TestSystemPromptPersistencePreservesOtherKeysAndTenants(t *testing.T) {
	db, err := gorm.Open(sqlite.Open(t.TempDir()+"/prompts.db"), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, db.Exec("CREATE TABLE tenants (id INTEGER PRIMARY KEY, system_prompt_config TEXT, updated_at DATETIME, deleted_at DATETIME)").Error)
	require.NoError(t, db.Exec(`INSERT INTO tenants (id, system_prompt_config) VALUES (1, '{"wiki_summary":"原总结"}'), (2, '{}')`).Error)
	r := &tenantRepository{db: db}
	ctx := context.Background()
	require.NoError(t, r.UpdateSystemPrompt(ctx, 1, "memory.extract", "记忆规则"))
	read := func(id int) types.SystemPromptConfig {
		var cfg types.SystemPromptConfig
		var raw string
		require.NoError(t, db.Raw("SELECT system_prompt_config FROM tenants WHERE id = ?", id).Scan(&raw).Error)
		require.NoError(t, cfg.Scan(raw))
		return cfg
	}
	require.Equal(t, types.SystemPromptConfig{"wiki_summary": "原总结", "memory.extract": "记忆规则"}, read(1))
	require.Empty(t, read(2))
	require.NoError(t, r.UpdateSystemPrompt(ctx, 1, "memory.extract", ""))
	require.Equal(t, types.SystemPromptConfig{"wiki_summary": "原总结"}, read(1))
}
