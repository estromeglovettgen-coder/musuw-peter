package container

import (
	"context"
	"path/filepath"
	"testing"

	"github.com/Tencent/WeKnora/internal/application/repository"
	"github.com/Tencent/WeKnora/internal/config"
	"github.com/Tencent/WeKnora/internal/types"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func TestInitDatabaseDoesNotPassAuthTokenToGORMLogs(t *testing.T) {
	t.Setenv("DB_DRIVER", "sqlite")
	t.Setenv("DB_PATH", filepath.Join(t.TempDir(), "weknora.db"))
	t.Setenv("AUTO_MIGRATE", "false")
	t.Setenv("BUILTIN_MODELS_CONFIG", filepath.Join(t.TempDir(), "missing.yaml"))

	db, err := initDatabase(&config.Config{})
	require.NoError(t, err)
	sqlDB, err := db.DB()
	require.NoError(t, err)
	t.Cleanup(func() { _ = sqlDB.Close() })
	require.NoError(t, db.AutoMigrate(&types.Tenant{}, &types.User{}, &types.AuthToken{}))
	require.NoError(t, db.Create(&types.Tenant{ID: 1, Name: "logger-regression"}).Error)
	require.NoError(t, db.Create(&types.User{
		ID: "user-log-regression", Username: "logger-regression", Email: "logger-regression@example.com",
		PasswordHash: "hashed", TenantID: 1,
	}).Error)

	const jwt = "sensitive-auth-token-regression-test-value"
	require.NoError(t, repository.NewAuthTokenRepository(db).CreateToken(context.Background(), &types.AuthToken{
		ID:        "token-log-regression",
		UserID:    "user-log-regression",
		Token:     jwt,
		TokenType: "access_token",
	}))
	_, err = repository.NewAuthTokenRepository(db).GetTokenByValue(context.Background(), jwt)
	require.NoError(t, err)

	filter, ok := db.Config.Logger.(gorm.ParamsFilter)
	require.True(t, ok, "GORM logger must expose its parameter filtering behavior")
	filteredSQL, params := filter.ParamsFilter(context.Background(), "SELECT * FROM auth_tokens WHERE token = ?", jwt)
	require.NotContains(t, filteredSQL, jwt)
	require.Empty(t, params, "GORM SQL logs must never carry auth token parameters")
}
