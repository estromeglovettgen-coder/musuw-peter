package container

import (
	"context"
	"errors"
	"fmt"
	stdlog "log"
	"os"
	"time"

	"github.com/Tencent/WeKnora/internal/types"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	gormlogger "gorm.io/gorm/logger"
)

func configuredPostgresDSN() string {
	return fmt.Sprintf("host=%s port=%s user=%s password=%s dbname=%s sslmode=disable TimeZone=UTC",
		os.Getenv("DB_HOST"), os.Getenv("DB_PORT"), os.Getenv("DB_USER"), os.Getenv("DB_PASSWORD"), os.Getenv("DB_NAME"))
}

func configuredGormDBConfig() *gorm.Config {
	return &gorm.Config{
		// Share the server's parameter-redacted logger and UTC timestamps.
		Logger: gormlogger.New(stdlog.New(os.Stdout, "\r\n", stdlog.LstdFlags), gormlogger.Config{
			SlowThreshold: 200 * time.Millisecond, Colorful: true,
			ParameterizedQueries: true, LogLevel: gormlogger.Warn,
		}),
		NowFunc: func() time.Time { return time.Now().UTC() },
	}
}

// OpenExistingDatabaseForMaintenance shares the native server connection
// configuration but does not start the application, run migrations, reconcile
// models, seed records or start background jobs. It only opens an existing
// PostgreSQL deployment with the required clean schema.
func OpenExistingDatabaseForMaintenance(ctx context.Context) (*gorm.DB, error) {
	if os.Getenv("DB_DRIVER") != "postgres" {
		return nil, errors.New("maintenance requires the existing PostgreSQL deployment")
	}
	for _, key := range []string{"DB_HOST", "DB_PORT", "DB_USER", "DB_NAME", "DB_PASSWORD"} {
		if os.Getenv(key) == "" {
			return nil, fmt.Errorf("maintenance requires explicit %s", key)
		}
	}
	db, err := gorm.Open(postgres.Open(configuredPostgresDSN()), configuredGormDBConfig())
	if err != nil {
		return nil, errors.New("could not open the existing database")
	}
	sqlDB, err := db.DB()
	if err != nil {
		return nil, errors.New("could not access the existing database connection")
	}
	sqlDB.SetMaxOpenConns(1)
	sqlDB.SetMaxIdleConns(1)
	sqlDB.SetConnMaxLifetime(10 * time.Minute)
	checkCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	var version int64
	var dirty bool
	if err := db.WithContext(checkCtx).Raw("SELECT version, dirty FROM schema_migrations LIMIT 1").Row().Scan(&version, &dirty); err != nil || dirty {
		_ = sqlDB.Close()
		return nil, errors.New("maintenance requires a clean existing migration state")
	}
	for _, model := range []any{&types.User{}, &types.Tenant{}, &types.KnowledgeBase{}, &types.CustomAgent{}, &types.Model{}, &types.Organization{}, &types.OrganizationTenantMember{}, &types.KnowledgeBaseShare{}, &types.FireWorkspaceAccount{}} {
		if !db.WithContext(checkCtx).Migrator().HasTable(model) {
			_ = sqlDB.Close()
			return nil, errors.New("required Fire deployment tables are unavailable; no migration was run")
		}
	}
	return db, nil
}
