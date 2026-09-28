package repository

import (
	"context"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

func TestUpdateURLKnowledgeTitleIfAutomaticPreservesManualRename(t *testing.T) {
	db := setupKnowledgeTestDB(t)
	repo := NewKnowledgeRepository(db)
	ctx := context.Background()
	id := uuid.NewString()
	source := "https://x.com/example/status/1"

	require.NoError(t, db.Exec(`
		INSERT INTO knowledges (id, tenant_id, knowledge_base_id, type, title, source)
		VALUES (?, 1, ?, 'url', ?, ?)
	`, id, uuid.NewString(), source, source).Error)

	updated, err := repo.UpdateURLKnowledgeTitleIfAutomatic(ctx, 1, id, source, "AI video title")
	require.NoError(t, err)
	require.True(t, updated)

	var title string
	require.NoError(t, db.Raw(`SELECT title FROM knowledges WHERE id = ?`, id).Scan(&title).Error)
	require.Equal(t, "AI video title", title)

	require.NoError(t, db.Exec(`UPDATE knowledges SET title = 'My manual title' WHERE id = ?`, id).Error)
	updated, err = repo.UpdateURLKnowledgeTitleIfAutomatic(ctx, 1, id, source, "Late AI title")
	require.NoError(t, err)
	require.False(t, updated)
	require.NoError(t, db.Raw(`SELECT title FROM knowledges WHERE id = ?`, id).Scan(&title).Error)
	require.Equal(t, "My manual title", title)
}
