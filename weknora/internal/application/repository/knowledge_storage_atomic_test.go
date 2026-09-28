package repository

import (
	"context"
	"errors"
	"math"
	"path/filepath"
	"sync"
	"testing"
	"time"

	"github.com/Tencent/WeKnora/internal/types"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

func newStorageAccountingDB(t *testing.T) (*gorm.DB, *types.Tenant) {
	t.Helper()
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	sqlDB, err := db.DB()
	require.NoError(t, err)
	sqlDB.SetMaxOpenConns(1)
	t.Cleanup(func() { _ = sqlDB.Close() })
	require.NoError(t, db.AutoMigrate(&types.Tenant{}, &types.Knowledge{}))

	tenant := &types.Tenant{Name: "storage-test", Business: "test"}
	require.NoError(t, db.Create(tenant).Error)
	// BeforeCreate derives the plan default. Tests intentionally use a small
	// persisted quota so exact-boundary and rejection behavior are observable.
	require.NoError(t, db.Model(&types.Tenant{}).Where("id = ?", tenant.ID).
		Updates(map[string]interface{}{"storage_quota": int64(5), "storage_used": int64(0)}).Error)
	tenant.StorageQuota = 5
	tenant.StorageUsed = 0
	return db, tenant
}

func storageKnowledge(tenantID uint64, id string, fileSize, storageSize int64) *types.Knowledge {
	return &types.Knowledge{
		ID:              id,
		TenantID:        tenantID,
		KnowledgeBaseID: "kb-storage",
		Type:            "file",
		Title:           id,
		Source:          "upload",
		ParseStatus:     types.ParseStatusCompleted,
		EnableStatus:    "enabled",
		FileSize:        fileSize,
		StorageSize:     storageSize,
	}
}

func tenantStorageUsed(t *testing.T, db *gorm.DB, tenantID uint64) int64 {
	t.Helper()
	var tenant types.Tenant
	require.NoError(t, db.First(&tenant, tenantID).Error)
	return tenant.StorageUsed
}

func TestKnowledgeAccountedStorageBytesNormalizesAndSaturates(t *testing.T) {
	t.Parallel()
	assert.Equal(t, int64(7), (&types.Knowledge{FileSize: 3, StorageSize: 4}).AccountedStorageBytes())
	assert.Equal(t, int64(3), (&types.Knowledge{FileSize: -1, StorageSize: 3}).AccountedStorageBytes())
	assert.Equal(t, int64(0), (&types.Knowledge{FileSize: -1, StorageSize: -4}).AccountedStorageBytes())
	assert.Equal(t, int64(math.MaxInt64), (&types.Knowledge{FileSize: math.MaxInt64, StorageSize: 1}).AccountedStorageBytes())
	assert.Equal(t, int64(0), (*types.Knowledge)(nil).AccountedStorageBytes())
}

func TestKnowledgePairedCreateEnforcesExactBoundaryAndRollback(t *testing.T) {
	db, tenant := newStorageAccountingDB(t)
	repo := NewKnowledgeRepository(db)
	ctx := context.Background()

	first := storageKnowledge(tenant.ID, "storage-create-1", 2, 0)
	second := storageKnowledge(tenant.ID, "storage-create-2", 1, 2)
	require.NoError(t, repo.CreateKnowledgeWithStorage(ctx, first, 5))
	require.NoError(t, repo.CreateKnowledgeWithStorage(ctx, second, 5))
	assert.Equal(t, int64(5), tenantStorageUsed(t, db, tenant.ID))

	rejected := storageKnowledge(tenant.ID, "storage-create-rejected", 1, 0)
	err := repo.CreateKnowledgeWithStorage(ctx, rejected, 5)
	var quotaErr *types.StorageQuotaExceededError
	require.ErrorAs(t, err, &quotaErr)
	assert.Equal(t, int64(5), tenantStorageUsed(t, db, tenant.ID))
	var count int64
	require.NoError(t, db.Model(&types.Knowledge{}).Where("id = ?", rejected.ID).Count(&count).Error)
	assert.Zero(t, count, "quota rejection must not leave a row")
}

func TestKnowledgePairedCreateRecomputesExpiredComplimentaryQuotaFromLockedTenant(t *testing.T) {
	db, tenant := newStorageAccountingDB(t)
	repo := NewKnowledgeRepository(db)
	now := time.Now().UTC()
	expiredAt := now.Add(-time.Second)
	require.NoError(t, db.Model(&types.Tenant{}).Where("id = ?", tenant.ID).Updates(map[string]interface{}{
		"storage_used":             int64(5),
		"complimentary_plan":       types.ConsumerPlanPro,
		"complimentary_expires_at": expiredAt,
		"complimentary_grant_id":   "grant-expired-storage",
	}).Error)

	// Simulate the request having cached Pro's quota before it waited for the
	// tenant lock. The transaction must ignore that stale value and reject
	// against the latest persisted Free quota of five bytes.
	err := repo.CreateKnowledgeWithStorage(
		context.Background(),
		storageKnowledge(tenant.ID, "stale-complimentary-quota", 1, 0),
		types.LimitsForConsumerPlan(types.ConsumerPlanPro).StorageBytes,
	)
	var quotaErr *types.StorageQuotaExceededError
	require.ErrorAs(t, err, &quotaErr)
	assert.Equal(t, int64(5), tenantStorageUsed(t, db, tenant.ID))
}

func TestKnowledgePairedCreateRollsBackRowWhenCounterWriteFails(t *testing.T) {
	db, tenant := newStorageAccountingDB(t)
	repo := NewKnowledgeRepository(db)
	ctx := context.Background()
	require.NoError(t, db.Exec(`
		CREATE TRIGGER fail_storage_counter
		BEFORE UPDATE OF storage_used ON tenants
		WHEN NEW.storage_used = 2
		BEGIN
			SELECT RAISE(ABORT, 'storage counter unavailable');
		END;
	`).Error)

	knowledge := storageKnowledge(tenant.ID, "storage-create-counter-failure", 2, 0)
	require.Error(t, repo.CreateKnowledgeWithStorage(ctx, knowledge, 5))
	assert.Equal(t, int64(0), tenantStorageUsed(t, db, tenant.ID))
	var count int64
	require.NoError(t, db.Model(&types.Knowledge{}).Where("id = ?", knowledge.ID).Count(&count).Error)
	assert.Zero(t, count, "counter failure must roll back the knowledge row")
}

func TestKnowledgePairedCreateConcurrentPositiveDeltasNeverOversubscribes(t *testing.T) {
	t.Parallel()
	dsn := "file:" + filepath.Join(t.TempDir(), "storage.db") + "?_busy_timeout=10000&_txlock=immediate"
	db, err := gorm.Open(sqlite.Open(dsn), &gorm.Config{})
	require.NoError(t, err)
	sqlDB, err := db.DB()
	require.NoError(t, err)
	sqlDB.SetMaxOpenConns(4)
	t.Cleanup(func() { _ = sqlDB.Close() })
	require.NoError(t, db.AutoMigrate(&types.Tenant{}, &types.Knowledge{}))
	tenant := &types.Tenant{Name: "concurrent-storage-test", Business: "test"}
	require.NoError(t, db.Create(tenant).Error)
	require.NoError(t, db.Model(&types.Tenant{}).Where("id = ?", tenant.ID).
		Updates(map[string]interface{}{"storage_quota": int64(10), "storage_used": int64(0)}).Error)

	repo := NewKnowledgeRepository(db)
	start := make(chan struct{})
	errs := make(chan error, 2)
	for i := 0; i < 2; i++ {
		i := i
		go func() {
			<-start
			errs <- repo.CreateKnowledgeWithStorage(
				context.Background(),
				storageKnowledge(tenant.ID, []string{"concurrent-storage-a", "concurrent-storage-b"}[i], 6, 0),
				10,
			)
		}()
	}
	close(start)
	var successes int
	var failures []error
	for i := 0; i < 2; i++ {
		if err := <-errs; err == nil {
			successes++
		} else {
			failures = append(failures, err)
		}
	}
	assert.Equal(t, 1, successes, "only one positive delta may fit under the quota")
	require.Len(t, failures, 1)
	assert.LessOrEqual(t, tenantStorageUsed(t, db, tenant.ID), int64(10))
	var rows int64
	require.NoError(t, db.Model(&types.Knowledge{}).Where("tenant_id = ?", tenant.ID).Count(&rows).Error)
	assert.Equal(t, int64(1), rows)
}

func TestClaimKnowledgeSourceWithStorageHasSingleConcurrentWinner(t *testing.T) {
	dsn := "file:" + filepath.Join(t.TempDir(), "claim-source.db") + "?_busy_timeout=10000&_txlock=immediate"
	db, err := gorm.Open(sqlite.Open(dsn), &gorm.Config{})
	require.NoError(t, err)
	sqlDB, err := db.DB()
	require.NoError(t, err)
	sqlDB.SetMaxOpenConns(4)
	t.Cleanup(func() { _ = sqlDB.Close() })
	require.NoError(t, db.AutoMigrate(&types.Tenant{}, &types.Knowledge{}))
	tenant := &types.Tenant{Name: "claim-source-test", Business: "test"}
	require.NoError(t, db.Create(tenant).Error)
	require.NoError(t, db.Model(&types.Tenant{}).Where("id = ?", tenant.ID).
		Updates(map[string]interface{}{"storage_quota": int64(10), "storage_used": int64(0)}).Error)

	repo := NewKnowledgeRepository(db)
	seed := storageKnowledge(tenant.ID, "claim-source", 0, 0)
	require.NoError(t, repo.CreateKnowledgeWithStorage(context.Background(), seed, 10))

	type claimResult struct {
		current *types.Knowledge
		claimed bool
		err     error
	}
	start := make(chan struct{})
	results := make(chan claimResult, 2)
	proposals := []*types.Knowledge{
		func() *types.Knowledge {
			p := *seed
			p.FilePath, p.FileSize = "local://winner-a", 6
			return &p
		}(),
		func() *types.Knowledge {
			p := *seed
			p.FilePath, p.FileSize = "local://winner-b", 6
			return &p
		}(),
	}
	for _, proposal := range proposals {
		proposal := proposal
		go func() {
			<-start
			current, claimed, claimErr := repo.ClaimKnowledgeSourceWithStorage(context.Background(), proposal, 10)
			results <- claimResult{current: current, claimed: claimed, err: claimErr}
		}()
	}
	close(start)
	collected := []claimResult{<-results, <-results}
	var winner, loser *claimResult
	for i := range collected {
		require.NoError(t, collected[i].err)
		if collected[i].claimed {
			winner = &collected[i]
		} else {
			loser = &collected[i]
		}
	}
	require.NotNil(t, winner, "exactly one source materialization may claim the empty checkpoint")
	require.NotNil(t, loser, "the losing worker must observe the committed winner")
	require.NotNil(t, winner.current)
	require.NotNil(t, loser.current)
	assert.Equal(t, winner.current.FilePath, loser.current.FilePath)
	assert.Equal(t, int64(6), tenantStorageUsed(t, db, tenant.ID), "only the winner contributes source bytes")

	var persisted types.Knowledge
	require.NoError(t, db.Where("id = ?", seed.ID).First(&persisted).Error)
	assert.Equal(t, winner.current.FilePath, persisted.FilePath)
	assert.Equal(t, int64(6), persisted.FileSize)
}

func TestClaimKnowledgeSourceWithStorageQuotaAndCounterFailuresRollback(t *testing.T) {
	t.Run("quota", func(t *testing.T) {
		db, tenant := newStorageAccountingDB(t)
		repo := NewKnowledgeRepository(db)
		seed := storageKnowledge(tenant.ID, "claim-quota", 0, 0)
		require.NoError(t, repo.CreateKnowledgeWithStorage(context.Background(), seed, 5))

		emptyPath := *seed
		emptyPath.FileSize = 6
		current, claimed, err := repo.ClaimKnowledgeSourceWithStorage(context.Background(), &emptyPath, 5)
		assert.Error(t, err)
		assert.False(t, claimed)
		assert.Nil(t, current)

		proposed := *seed
		proposed.FilePath, proposed.FileSize = "local://rejected", 6
		current, claimed, err = repo.ClaimKnowledgeSourceWithStorage(context.Background(), &proposed, 5)
		var quotaErr *types.StorageQuotaExceededError
		require.ErrorAs(t, err, &quotaErr)
		assert.False(t, claimed)
		assert.Nil(t, current)
		assert.Zero(t, tenantStorageUsed(t, db, tenant.ID))
		var persisted types.Knowledge
		require.NoError(t, db.Where("id = ?", seed.ID).First(&persisted).Error)
		assert.Empty(t, persisted.FilePath)
		assert.Zero(t, persisted.FileSize)
	})

	t.Run("counter failure", func(t *testing.T) {
		db, tenant := newStorageAccountingDB(t)
		repo := NewKnowledgeRepository(db)
		require.NoError(t, db.Exec(`
			CREATE TRIGGER fail_claim_storage_counter
			BEFORE UPDATE OF storage_used ON tenants
			WHEN NEW.storage_used = 6
			BEGIN
				SELECT RAISE(ABORT, 'storage counter unavailable');
			END;
		`).Error)
		seed := storageKnowledge(tenant.ID, "claim-counter", 0, 0)
		require.NoError(t, repo.CreateKnowledgeWithStorage(context.Background(), seed, 10))

		proposed := *seed
		proposed.FilePath, proposed.FileSize = "local://counter-failure", 6
		current, claimed, err := repo.ClaimKnowledgeSourceWithStorage(context.Background(), &proposed, 10)
		require.Error(t, err)
		assert.False(t, claimed)
		assert.Nil(t, current)
		assert.Zero(t, tenantStorageUsed(t, db, tenant.ID))
		var persisted types.Knowledge
		require.NoError(t, db.Where("id = ?", seed.ID).First(&persisted).Error)
		assert.Empty(t, persisted.FilePath)
		assert.Zero(t, persisted.FileSize)
	})
}

func TestClaimKnowledgeSourceWithStorageRejectsNilAndUnknownRows(t *testing.T) {
	db, tenant := newStorageAccountingDB(t)
	repo := NewKnowledgeRepository(db)
	_, claimed, err := repo.ClaimKnowledgeSourceWithStorage(context.Background(), nil, 5)
	assert.Error(t, err)
	assert.False(t, claimed)

	_, claimed, err = repo.ClaimKnowledgeSourceWithStorage(
		context.Background(), func() *types.Knowledge {
			k := storageKnowledge(tenant.ID, "claim-missing", 1, 0)
			k.FilePath = "local://missing"
			return k
		}(), 5,
	)
	assert.ErrorIs(t, err, ErrKnowledgeNotFound)
	assert.False(t, claimed)

	_, claimed, err = repo.ClaimKnowledgeSourceWithStorage(
		context.Background(), func() *types.Knowledge {
			k := storageKnowledge(tenant.ID+1, "claim-missing", 1, 0)
			k.FilePath = "local://wrong-tenant"
			return k
		}(), 5,
	)
	assert.Error(t, err, "a different tenant must not claim this row")
	assert.False(t, claimed)
}

func TestClaimKnowledgeSourceWithStoragePreservesPersistedState(t *testing.T) {
	db, tenant := newStorageAccountingDB(t)
	repo := NewKnowledgeRepository(db)
	seed := storageKnowledge(tenant.ID, "claim-state", 0, 0)
	require.NoError(t, repo.CreateKnowledgeWithStorage(context.Background(), seed, 5))
	persistedMetadata := types.JSON(`{"owner":"persisted"}`)
	require.NoError(t, db.Model(&types.Knowledge{}).Where("id = ?", seed.ID).Updates(map[string]interface{}{
		"parse_status":    types.ParseStatusCancelled,
		"metadata":        persistedMetadata,
		"custom_metadata": types.JSON(`{"checkpoint":"kept"}`),
	}).Error)

	proposed := *seed
	proposed.FilePath = "local://state-preserved"
	proposed.FileSize = 2
	proposed.ParseStatus = types.ParseStatusCompleted
	proposed.Metadata = types.JSON(`{"owner":"stale-worker"}`)
	proposed.CustomMetadata = types.JSON(`{"checkpoint":"stale-worker"}`)
	current, claimed, err := repo.ClaimKnowledgeSourceWithStorage(context.Background(), &proposed, 5)
	require.NoError(t, err)
	assert.True(t, claimed)
	require.NotNil(t, current)
	assert.Equal(t, types.ParseStatusCancelled, current.ParseStatus)
	assert.JSONEq(t, `{"owner":"persisted"}`, string(current.Metadata))
	assert.JSONEq(t, `{"checkpoint":"kept"}`, string(current.CustomMetadata))
	assert.Equal(t, "local://state-preserved", current.FilePath)
	assert.Equal(t, int64(2), current.FileSize)
	assert.Equal(t, int64(2), tenantStorageUsed(t, db, tenant.ID))
}

func TestClaimKnowledgeSourceWithStoragePreservesURLTitleRenamedDuringFetch(t *testing.T) {
	db, tenant := newStorageAccountingDB(t)
	repo := NewKnowledgeRepository(db)
	ctx := context.Background()
	const source = "https://v.douyin.com/example/"

	seed := storageKnowledge(tenant.ID, "claim-renamed-title", 0, 0)
	seed.Type = "url"
	seed.Source = source
	seed.Title = source
	require.NoError(t, repo.CreateKnowledgeWithStorage(ctx, seed, 5))
	require.NoError(t, db.Model(&types.Knowledge{}).Where("id = ?", seed.ID).
		Update("title", "我手动改的标题").Error)

	proposed := *seed // stale worker snapshot from before the provider fetch
	proposed.FilePath = "local://douyin.md"
	proposed.FileType = "md"
	proposed.FileSize = 2
	proposed.Title = source
	proposed.Description = "provider caption"

	current, claimed, err := repo.ClaimKnowledgeSourceWithStorage(ctx, &proposed, 5)
	require.NoError(t, err)
	require.True(t, claimed)
	require.NotNil(t, current)
	require.Equal(t, "我手动改的标题", current.Title)

	var persisted types.Knowledge
	require.NoError(t, db.Where("id = ?", seed.ID).First(&persisted).Error)
	require.Equal(t, "我手动改的标题", persisted.Title)
}

func TestUpdateKnowledgeWithStoragePreservesURLTitleRenamedDuringAnalysis(t *testing.T) {
	db, tenant := newStorageAccountingDB(t)
	repo := NewKnowledgeRepository(db)
	ctx := context.Background()
	const source = "https://x.com/example/status/1"

	seed := storageKnowledge(tenant.ID, "update-renamed-title", 1, 0)
	seed.Type = "url"
	seed.Source = source
	seed.Title = source
	require.NoError(t, repo.CreateKnowledgeWithStorage(ctx, seed, 5))
	require.NoError(t, db.Model(&types.Knowledge{}).Where("id = ?", seed.ID).
		Update("title", "分析期间的手动标题").Error)

	staleWorker := *seed
	staleWorker.StorageSize = 2
	require.NoError(t, repo.UpdateKnowledgeWithStorage(ctx, &staleWorker, 5))

	var persisted types.Knowledge
	require.NoError(t, db.Where("id = ?", seed.ID).First(&persisted).Error)
	require.Equal(t, "分析期间的手动标题", persisted.Title)
	require.Equal(t, int64(2), persisted.StorageSize)
}

func TestKnowledgePairedUpdateUsesPersistedDelta(t *testing.T) {
	db, tenant := newStorageAccountingDB(t)
	repo := NewKnowledgeRepository(db)
	ctx := context.Background()

	knowledge := storageKnowledge(tenant.ID, "storage-update", 2, 1)
	require.NoError(t, repo.CreateKnowledgeWithStorage(ctx, knowledge, 5))

	knowledge.FileSize = 3
	knowledge.StorageSize = 0
	require.NoError(t, repo.UpdateKnowledgeWithStorage(ctx, knowledge, 5))
	assert.Equal(t, int64(3), tenantStorageUsed(t, db, tenant.ID))

	knowledge.FileSize = 6
	err := repo.UpdateKnowledgeWithStorage(ctx, knowledge, 5)
	var quotaErr *types.StorageQuotaExceededError
	require.ErrorAs(t, err, &quotaErr)
	assert.Equal(t, int64(3), tenantStorageUsed(t, db, tenant.ID))
	var persisted types.Knowledge
	require.NoError(t, db.Where("id = ?", knowledge.ID).First(&persisted).Error)
	assert.Equal(t, int64(3), persisted.FileSize)
	assert.Equal(t, int64(0), persisted.StorageSize)
}

func TestKnowledgeStorageFailureMarkRequiresCurrentProcessingContribution(t *testing.T) {
	db, tenant := newStorageAccountingDB(t)
	repo := NewKnowledgeRepository(db)
	ctx := context.Background()
	knowledge := storageKnowledge(tenant.ID, "storage-failure-mark", 2, 3)
	knowledge.ParseStatus = types.ParseStatusProcessing
	require.NoError(t, repo.CreateKnowledgeWithStorage(ctx, knowledge, 10))
	assert.Equal(t, int64(5), tenantStorageUsed(t, db, tenant.ID))

	marked, err := repo.UpdateKnowledgeStorageFailureIfCurrent(
		ctx, tenant.ID, knowledge.ID, 3, "temporary storage mutation failure",
	)
	require.NoError(t, err)
	assert.True(t, marked)

	var persisted types.Knowledge
	require.NoError(t, db.Where("id = ?", knowledge.ID).First(&persisted).Error)
	assert.Equal(t, types.ParseStatusFailed, persisted.ParseStatus)
	assert.Equal(t, int64(3), persisted.StorageSize, "conditional status update must not alter the contribution")
	assert.Equal(t, int64(5), tenantStorageUsed(t, db, tenant.ID), "status marking must not touch tenant usage")

	require.NoError(t, db.Model(&types.Knowledge{}).Where("id = ?", knowledge.ID).
		Updates(map[string]interface{}{"parse_status": types.ParseStatusProcessing}).Error)
	marked, err = repo.UpdateKnowledgeStorageFailureIfCurrent(
		ctx, tenant.ID, knowledge.ID, 2, "stale worker failure",
	)
	require.NoError(t, err)
	assert.False(t, marked, "a stale storage checkpoint must not overwrite a current processing row")
	require.NoError(t, db.Where("id = ?", knowledge.ID).First(&persisted).Error)
	assert.Equal(t, types.ParseStatusProcessing, persisted.ParseStatus)
}

func TestKnowledgePairedDeletesReleaseFullActiveContribution(t *testing.T) {
	db, tenant := newStorageAccountingDB(t)
	repo := NewKnowledgeRepository(db)
	ctx := context.Background()

	first := storageKnowledge(tenant.ID, "storage-delete-1", 2, 1)
	second := storageKnowledge(tenant.ID, "storage-delete-2", 1, 1)
	require.NoError(t, repo.CreateKnowledgeWithStorage(ctx, first, 5))
	require.NoError(t, repo.CreateKnowledgeWithStorage(ctx, second, 5))
	assert.Equal(t, int64(5), tenantStorageUsed(t, db, tenant.ID))

	require.NoError(t, repo.DeleteKnowledgeWithStorage(ctx, tenant.ID, first.ID))
	assert.Equal(t, int64(2), tenantStorageUsed(t, db, tenant.ID))
	require.NoError(t, repo.DeleteKnowledgeListWithStorage(ctx, tenant.ID, []string{second.ID, "missing"}))
	assert.Equal(t, int64(0), tenantStorageUsed(t, db, tenant.ID))

	var deleted types.Knowledge
	require.NoError(t, db.Unscoped().Where("id = ?", first.ID).First(&deleted).Error)
	assert.True(t, deleted.DeletedAt.Valid)
	assert.NoError(t, repo.DeleteKnowledgeWithStorage(ctx, tenant.ID, first.ID), "deleting an inactive row remains idempotent")
}

func TestPairedUpdateAndClaimRejectSoftDeletedKnowledge(t *testing.T) {
	db, tenant := newStorageAccountingDB(t)
	repo := NewKnowledgeRepository(db)
	ctx := context.Background()

	seed := storageKnowledge(tenant.ID, "storage-soft-deleted", 2, 1)
	require.NoError(t, repo.CreateKnowledgeWithStorage(ctx, seed, 5))
	require.NoError(t, repo.DeleteKnowledgeWithStorage(ctx, tenant.ID, seed.ID))
	assert.Zero(t, tenantStorageUsed(t, db, tenant.ID))

	seed.FileSize = 9
	assert.ErrorIs(t, repo.UpdateKnowledgeWithStorage(ctx, seed, 20), ErrKnowledgeNotFound)
	proposed := *seed
	proposed.FilePath = "local://late-source"
	current, claimed, err := repo.ClaimKnowledgeSourceWithStorage(ctx, &proposed, 20)
	assert.ErrorIs(t, err, ErrKnowledgeNotFound)
	assert.False(t, claimed)
	assert.Nil(t, current)
	assert.Zero(t, tenantStorageUsed(t, db, tenant.ID), "soft-deleted updates must not re-add released usage")

	var persisted types.Knowledge
	require.NoError(t, db.Unscoped().Where("id = ?", seed.ID).First(&persisted).Error)
	assert.True(t, persisted.DeletedAt.Valid)
	assert.Equal(t, int64(2), persisted.FileSize, "late update must not resurrect the row")
}

func TestPairedUpdateAndDeleteSerializeWithoutResurrection(t *testing.T) {
	t.Parallel()
	dsn := "file:" + filepath.Join(t.TempDir(), "update-delete.db") + "?_busy_timeout=10000&_txlock=immediate"
	db, err := gorm.Open(sqlite.Open(dsn), &gorm.Config{})
	require.NoError(t, err)
	sqlDB, err := db.DB()
	require.NoError(t, err)
	sqlDB.SetMaxOpenConns(4)
	t.Cleanup(func() { _ = sqlDB.Close() })
	require.NoError(t, db.AutoMigrate(&types.Tenant{}, &types.Knowledge{}))
	tenant := &types.Tenant{Name: "update-delete-concurrent", Business: "test"}
	require.NoError(t, db.Create(tenant).Error)
	require.NoError(t, db.Model(&types.Tenant{}).Where("id = ?", tenant.ID).
		Updates(map[string]interface{}{"storage_quota": int64(10), "storage_used": int64(0)}).Error)
	repo := NewKnowledgeRepository(db)
	seed := storageKnowledge(tenant.ID, "update-delete-concurrent-row", 2, 1)
	require.NoError(t, repo.CreateKnowledgeWithStorage(context.Background(), seed, 10))

	update := *seed
	update.FileSize = 3
	start := make(chan struct{})
	updateErrs := make(chan error, 1)
	deleteErrs := make(chan error, 1)
	var wg sync.WaitGroup
	wg.Add(2)
	go func() {
		defer wg.Done()
		<-start
		updateErrs <- repo.UpdateKnowledgeWithStorage(context.Background(), &update, 10)
	}()
	go func() {
		defer wg.Done()
		<-start
		deleteErrs <- repo.DeleteKnowledgeWithStorage(context.Background(), tenant.ID, seed.ID)
	}()
	close(start)
	wg.Wait()
	updateErr := <-updateErrs
	require.NoError(t, <-deleteErrs)
	assert.True(t, updateErr == nil || errors.Is(updateErr, ErrKnowledgeNotFound), "update result: %v", updateErr)

	assert.Zero(t, tenantStorageUsed(t, db, tenant.ID))
	var active int64
	require.NoError(t, db.Model(&types.Knowledge{}).
		Where("tenant_id = ? AND id = ? AND deleted_at IS NULL", tenant.ID, seed.ID).
		Count(&active).Error)
	assert.Zero(t, active, "delete must win the final active-row check")
	var persisted types.Knowledge
	require.NoError(t, db.Unscoped().Where("id = ?", seed.ID).First(&persisted).Error)
	assert.True(t, persisted.DeletedAt.Valid)
}

func TestAdjustStorageUsedKeepsLegacyClampBehavior(t *testing.T) {
	db, tenant := newStorageAccountingDB(t)
	repo := NewTenantRepository(db)
	ctx := context.Background()

	require.NoError(t, repo.AdjustStorageUsed(ctx, tenant.ID, 3))
	require.NoError(t, repo.AdjustStorageUsed(ctx, tenant.ID, -99))
	assert.Zero(t, tenantStorageUsed(t, db, tenant.ID))

	// Saturate rather than wrapping when a legacy caller reports a positive
	// delta that would overflow the signed storage aggregate.
	require.NoError(t, db.Model(&types.Tenant{}).
		Where("id = ?", tenant.ID).
		Update("storage_used", int64(math.MaxInt64-1)).Error)
	require.NoError(t, repo.AdjustStorageUsed(ctx, tenant.ID, 2))
	assert.Equal(t, int64(math.MaxInt64), tenantStorageUsed(t, db, tenant.ID))

	// MinInt64 cannot be negated safely; it is still a negative legacy delta
	// and must clamp usage to zero instead of wrapping positive.
	require.NoError(t, db.Model(&types.Tenant{}).
		Where("id = ?", tenant.ID).
		Update("storage_used", int64(123)).Error)
	require.NoError(t, repo.AdjustStorageUsed(ctx, tenant.ID, math.MinInt64))
	assert.Zero(t, tenantStorageUsed(t, db, tenant.ID))
}

func TestPairedMethodsReturnNotFoundOnlyForUpdate(t *testing.T) {
	db, tenant := newStorageAccountingDB(t)
	repo := NewKnowledgeRepository(db)
	ctx := context.Background()

	err := repo.UpdateKnowledgeWithStorage(ctx, storageKnowledge(tenant.ID, "missing", 1, 0), 5)
	assert.True(t, errors.Is(err, ErrKnowledgeNotFound))
	assert.NoError(t, repo.DeleteKnowledgeWithStorage(ctx, tenant.ID, "missing"))
	assert.NoError(t, repo.DeleteKnowledgeListWithStorage(ctx, tenant.ID, nil))
}
