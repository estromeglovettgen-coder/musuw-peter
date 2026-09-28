package container

import (
	"testing"

	"github.com/Tencent/WeKnora/internal/types"
	"github.com/stretchr/testify/require"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

func TestAuditLegacyFAQRowsIsReadOnly(t *testing.T) {
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, db.Exec(`CREATE TABLE knowledge_bases (id TEXT PRIMARY KEY, type TEXT NOT NULL, name TEXT, deleted_at DATETIME)`).Error)
	require.NoError(t, db.Exec(`INSERT INTO knowledge_bases (id, type, name) VALUES (?, ?, ?), (?, ?, ?)`,
		"faq-1", types.KnowledgeBaseTypeFAQ, "legacy faq", "doc-1", types.KnowledgeBaseTypeDocument, "document").Error)

	count, err := auditLegacyFAQRows(db)
	require.NoError(t, err)
	require.EqualValues(t, 1, count)

	var rows int64
	require.NoError(t, db.Table("knowledge_bases").Count(&rows).Error)
	require.EqualValues(t, 2, rows)
	var name string
	require.NoError(t, db.Table("knowledge_bases").Where("id = ?", "faq-1").Pluck("name", &name).Error)
	require.Equal(t, "legacy faq", name)
}

func TestAuditLegacyFAQRowsEmptyOrMissingTableIsSafe(t *testing.T) {
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	count, err := auditLegacyFAQRows(db)
	require.NoError(t, err)
	require.Zero(t, count)

	require.NoError(t, db.Exec(`CREATE TABLE knowledge_bases (id TEXT PRIMARY KEY, type TEXT NOT NULL, deleted_at DATETIME)`).Error)
	count, err = auditLegacyFAQRows(db)
	require.NoError(t, err)
	require.Zero(t, count)
}
