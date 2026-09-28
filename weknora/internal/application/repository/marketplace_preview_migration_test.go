package repository

import (
	"os"
	"testing"

	"github.com/stretchr/testify/require"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

func TestMarketplacePreviewSQLiteMigrationRoundTrip(t *testing.T) {
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	apply := func(name string) {
		raw, err := os.ReadFile("../../../migrations/sqlite/" + name)
		require.NoError(t, err)
		require.NoError(t, db.Transaction(func(tx *gorm.DB) error { return tx.Exec(string(raw)).Error }))
	}
	apply("000024_creator_marketplace.up.sql")
	require.NoError(t, db.Exec(`INSERT INTO marketplace_products
		(id,creator_tenant_id,creator_user_id,title,agent_id,monthly_amount,yearly_amount)
		VALUES ('p',7,'u','Product','a',100,1000)`).Error)
	apply("000026_marketplace_preview_examples.up.sql")
	var examples string
	require.NoError(t, db.Raw("SELECT sample_conversations FROM marketplace_products WHERE id='p'").
		Scan(&examples).Error)
	require.Equal(t, "[]", examples)
	require.NoError(t, db.Exec(`UPDATE marketplace_products
		SET sample_conversations='[{"question":"Q","answer":"A"}]' WHERE id='p'`).Error)
	apply("000026_marketplace_preview_examples.down.sql")
	var title string
	require.NoError(t, db.Raw("SELECT title FROM marketplace_products WHERE id='p'").Scan(&title).Error)
	require.Equal(t, "Product", title)
	apply("000026_marketplace_preview_examples.up.sql")
	require.NoError(t, db.Raw("SELECT sample_conversations FROM marketplace_products WHERE id='p'").
		Scan(&examples).Error)
	require.Equal(t, "[]", examples)
}
