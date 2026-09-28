package repository

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/stretchr/testify/require"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

func TestMarketplaceFreeSQLiteMigrationPreservesPaidRowsAndConstraints(t *testing.T) {
	dbPath := filepath.Join(t.TempDir(), "marketplace.db")
	db, err := gorm.Open(sqlite.Open(dbPath), &gorm.Config{})
	require.NoError(t, err)
	sqlDB, err := db.DB()
	require.NoError(t, err)
	sqlDB.SetMaxOpenConns(1)
	require.NoError(t, db.Exec("PRAGMA foreign_keys=ON").Error)
	apply := func(name string) error {
		raw, readErr := os.ReadFile("../../../migrations/sqlite/" + name)
		if readErr != nil {
			return readErr
		}
		return db.Transaction(func(tx *gorm.DB) error { return tx.Exec(string(raw)).Error })
	}
	require.NoError(t, apply("000024_creator_marketplace.up.sql"))
	insertProduct := `INSERT INTO marketplace_products
		(id,creator_tenant_id,creator_user_id,title,agent_id,monthly_amount,yearly_amount)
		VALUES (?,7,'creator','Example','agent',?,?)`
	require.NoError(t, db.Exec(insertProduct, "paid", 100, 1000).Error)
	require.NoError(t, db.Exec(`INSERT INTO marketplace_subscriptions
		(id,tenant_id,user_id,product_id,product_title,operation_key,billing_period,price_id,currency,amount,status)
		VALUES ('sub',8,'buyer','paid','Paid','operation','monthly','pri_paid','USD',100,'active')`).Error)
	require.NoError(t, db.Exec(`INSERT INTO marketplace_transactions
		(id,tenant_id,subscription_id,product_id,status,billing_period,occurred_at,last_event_at)
		VALUES ('txn',8,'sub','paid','completed','monthly',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`).Error)
	require.NoError(t, db.Exec(`INSERT INTO marketplace_processed_events(event_id,subscription_id)
		VALUES ('evt','sub')`).Error)
	reader, err := gorm.Open(sqlite.Open(dbPath), &gorm.Config{})
	require.NoError(t, err)
	var cachedCount int64
	require.NoError(t, reader.Table("marketplace_products").Count(&cachedCount).Error)
	require.Equal(t, int64(1), cachedCount)
	require.NoError(t, apply("000025_free_marketplace_products.up.sql"))
	require.NoError(t, reader.Exec(insertProduct, "free", 0, 0).Error,
		"the migration must invalidate another connection's cached schema")
	for _, table := range []string{
		"marketplace_subscriptions", "marketplace_transactions", "marketplace_processed_events",
	} {
		var count int64
		require.NoError(t, db.Table(table).Count(&count).Error)
		require.Equal(t, int64(1), count, table)
	}
	var violations []map[string]any
	require.NoError(t, db.Raw("PRAGMA foreign_key_check").Scan(&violations).Error)
	require.Empty(t, violations)
	require.Error(t, db.Exec(insertProduct, "negative", -1, -10).Error)
	require.Error(t, db.Exec(insertProduct, "invalid-year", 1, 9).Error)
	require.Error(t, db.Exec("UPDATE marketplace_subscriptions SET amount=0 WHERE id='sub'").Error)
	require.Error(t, apply("000025_free_marketplace_products.down.sql"), "rollback must not erase free products")
	var count int64
	require.NoError(t, db.Table("marketplace_products").Count(&count).Error)
	require.Equal(t, int64(2), count)
	require.NoError(t, db.Exec("DELETE FROM marketplace_products WHERE id='free'").Error)
	require.NoError(t, apply("000025_free_marketplace_products.down.sql"))
	require.Error(t, db.Exec(insertProduct, "free-again", 0, 0).Error)
	require.NoError(t, db.Raw("PRAGMA foreign_key_check").Scan(&violations).Error)
	require.Empty(t, violations)
}
