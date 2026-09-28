package repository

import (
	"context"
	"testing"

	"github.com/Tencent/WeKnora/internal/types"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestCheckKnowledgeExists_FileHashIsScopedByFileType(t *testing.T) {
	db := setupKnowledgeTestDB(t)
	repo := NewKnowledgeRepository(db)
	ctx := context.Background()
	tenantID := uint64(1)
	kbID := uuid.NewString()
	const fileHash = "same-content-hash"

	require.NoError(t, db.Exec(`
		INSERT INTO knowledges (id, tenant_id, knowledge_base_id, type, title, file_name, file_type, file_hash, parse_status)
		VALUES (?, ?, ?, 'file', 'document.md', 'document.md', 'md', ?, 'completed')
	`, uuid.NewString(), tenantID, kbID, fileHash).Error)

	t.Run("same content with another file type is allowed", func(t *testing.T) {
		exists, knowledge, err := repo.CheckKnowledgeExists(ctx, tenantID, kbID, &types.KnowledgeCheckParams{
			Type:     "file",
			FileHash: fileHash,
			FileType: "txt",
		})

		require.NoError(t, err)
		assert.False(t, exists)
		assert.Nil(t, knowledge)
	})

	t.Run("same content and file type remains a duplicate", func(t *testing.T) {
		exists, knowledge, err := repo.CheckKnowledgeExists(ctx, tenantID, kbID, &types.KnowledgeCheckParams{
			Type:     "file",
			FileHash: fileHash,
			FileType: "md",
		})

		require.NoError(t, err)
		assert.True(t, exists)
		require.NotNil(t, knowledge)
		assert.Equal(t, "md", knowledge.FileType)
	})

	t.Run("file type matching is case-insensitive", func(t *testing.T) {
		exists, knowledge, err := repo.CheckKnowledgeExists(ctx, tenantID, kbID, &types.KnowledgeCheckParams{
			Type:     "file",
			FileHash: fileHash,
			FileType: "MD",
		})

		require.NoError(t, err)
		assert.True(t, exists)
		require.NotNil(t, knowledge)
		assert.Equal(t, "md", knowledge.FileType)
	})
}

func TestCheckKnowledgeExists_SocialFailedRowReusesOnlyMaterializedSource(t *testing.T) {
	db := setupKnowledgeTestDB(t)
	repo := NewKnowledgeRepository(db)
	ctx := context.Background()
	const tenantID = uint64(7)
	kbID := uuid.NewString()
	const fileHash = "normalized-social-link"

	reusableID := uuid.NewString()
	require.NoError(t, db.Exec(`
		INSERT INTO knowledges (
			id, tenant_id, knowledge_base_id, type, title, source,
			file_type, file_hash, file_path, parse_status
		) VALUES (
			?, ?, ?, 'url', 'saved video', 'https://example.test/work',
			'mp4', ?, 'resource://abcdefghijklmnopqrstuv', 'failed'
		)
	`, reusableID, tenantID, kbID, fileHash).Error)

	exists, knowledge, err := repo.CheckKnowledgeExists(ctx, tenantID, kbID, &types.KnowledgeCheckParams{
		Type: "url", FileHash: fileHash, ReuseStoredSource: true,
	})
	require.NoError(t, err)
	require.True(t, exists)
	require.NotNil(t, knowledge)
	assert.Equal(t, reusableID, knowledge.ID)

	exists, knowledge, err = repo.CheckKnowledgeExists(ctx, tenantID, kbID, &types.KnowledgeCheckParams{
		Type: "url", FileHash: fileHash,
	})
	require.NoError(t, err)
	assert.False(t, exists)
	assert.Nil(t, knowledge)

	require.NoError(t, db.Model(&types.Knowledge{}).Where("id = ?", reusableID).Update("file_path", "").Error)
	exists, knowledge, err = repo.CheckKnowledgeExists(ctx, tenantID, kbID, &types.KnowledgeCheckParams{
		Type: "url", FileHash: fileHash, ReuseStoredSource: true,
	})
	require.NoError(t, err)
	assert.False(t, exists)
	assert.Nil(t, knowledge)
}

func TestCreateURLKnowledgeIfAbsentSerializesConcurrentClaims(t *testing.T) {
	db := setupKnowledgeTestDB(t)
	repo := NewKnowledgeRepository(db)
	ctx := context.Background()
	const tenantID = uint64(9)
	kbID := uuid.NewString()
	require.NoError(t, db.Exec(`
		CREATE TABLE knowledge_bases (
			id VARCHAR(36) PRIMARY KEY,
			tenant_id INTEGER NOT NULL,
			deleted_at DATETIME
		)
	`).Error)
	require.NoError(t, db.Exec(
		"INSERT INTO knowledge_bases (id, tenant_id) VALUES (?, ?)", kbID, tenantID,
	).Error)

	type result struct {
		knowledge *types.Knowledge
		created   bool
		err       error
	}
	results := make(chan result, 2)
	for range 2 {
		go func() {
			candidate := &types.Knowledge{
				ID: uuid.NewString(), TenantID: tenantID, KnowledgeBaseID: kbID,
				Type: "url", Source: "https://youtu.be/dQw4w9WgXcQ",
				FileType: "html", FileHash: "social:youtube:dQw4w9WgXcQ",
				ParseStatus: types.ParseStatusPending,
			}
			current, created, err := repo.CreateURLKnowledgeIfAbsent(
				ctx,
				candidate,
				&types.KnowledgeCheckParams{
					Type: "url", URL: candidate.Source, FileHash: candidate.FileHash,
				},
			)
			results <- result{knowledge: current, created: created, err: err}
		}()
	}

	first := <-results
	second := <-results
	require.NoError(t, first.err)
	require.NoError(t, second.err)
	assert.NotEqual(t, first.created, second.created, "exactly one concurrent request must win")
	require.NotNil(t, first.knowledge)
	require.NotNil(t, second.knowledge)
	assert.Equal(t, first.knowledge.ID, second.knowledge.ID)
	var count int64
	require.NoError(t, db.Model(&types.Knowledge{}).
		Where(
			"tenant_id = ? AND knowledge_base_id = ? AND file_hash = ?",
			tenantID, kbID, "social:youtube:dQw4w9WgXcQ",
		).
		Count(&count).Error)
	assert.Equal(t, int64(1), count)
}

func TestAminusB_IgnoresFailedAndInFlightTargetRows(t *testing.T) {
	db := setupKnowledgeTestDB(t)
	repo := NewKnowledgeRepository(db)
	ctx := context.Background()
	const tenantID = uint64(1)
	sourceKB := uuid.NewString()
	targetKB := uuid.NewString()
	const fileHash = "retryable-source-hash"

	for _, row := range []struct {
		id     string
		kbID   string
		status string
	}{
		{id: uuid.NewString(), kbID: sourceKB, status: types.ParseStatusCompleted},
		{id: uuid.NewString(), kbID: targetKB, status: types.ParseStatusFailed},
		{id: uuid.NewString(), kbID: targetKB, status: types.ParseStatusProcessing},
	} {
		require.NoError(t, db.Exec(`
			INSERT INTO knowledges (id, tenant_id, knowledge_base_id, type, title, file_hash, parse_status)
			VALUES (?, ?, ?, 'file', 'retry-test', ?, ?)
		`, row.id, tenantID, row.kbID, fileHash, row.status).Error)
	}

	add, err := repo.AminusB(ctx, tenantID, sourceKB, tenantID, targetKB)
	require.NoError(t, err)
	if assert.Len(t, add, 1) {
		var sourceCount int64
		require.NoError(t, db.Model(&types.Knowledge{}).Where("id = ?", add[0]).Count(&sourceCount).Error)
		assert.Equal(t, int64(1), sourceCount)
	}

	del, err := repo.AminusB(ctx, tenantID, targetKB, tenantID, sourceKB)
	require.NoError(t, err)
	assert.Len(t, del, 2, "failed and processing target rows must both be removed on retry")
}
