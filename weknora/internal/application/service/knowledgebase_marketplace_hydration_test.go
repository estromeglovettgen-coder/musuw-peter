package service

import (
	"context"
	"testing"

	"github.com/stretchr/testify/require"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"

	"github.com/Tencent/WeKnora/internal/application/repository"
	"github.com/Tencent/WeKnora/internal/types"
)

// Exercise the real hydration stage after vector retrieval with real tenant-
// filtered repositories. A valid source hit must survive into a cited result,
// while unrelated source KBs and buyer-owned rows cannot enter that service.
func TestMarketplaceSearchHydratesOnlyGrantedSourceKnowledge(t *testing.T) {
	t.Setenv("MUSUW_PRODUCT_EDITION", "lite")
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, db.AutoMigrate(&types.Knowledge{}, &types.Chunk{}))
	for _, row := range []struct {
		id     string
		kb     string
		tenant uint64
	}{
		{id: "approved", kb: "published-kb", tenant: 99},
		{id: "other-source", kb: "unpublished-kb", tenant: 99},
		{id: "buyer", kb: "buyer-kb", tenant: 7},
	} {
		require.NoError(t, db.Create(&types.Knowledge{
			ID: row.id, TenantID: row.tenant, KnowledgeBaseID: row.kb, Title: row.id,
		}).Error)
		require.NoError(t, db.Create(&types.Chunk{
			ID: row.id, TenantID: row.tenant, KnowledgeID: row.id, KnowledgeBaseID: row.kb,
			Content: row.id + " fixture text", ChunkType: types.ChunkTypeText, IsEnabled: true,
			ImageInfo: "[]",
		}).Error)
	}
	svc := &knowledgeBaseService{
		kgRepo: repository.NewKnowledgeRepository(db), chunkRepo: repository.NewChunkRepository(db),
	}
	ctx := context.WithValue(context.Background(), types.TenantIDContextKey, uint64(7))
	scope := types.WithMarketplaceScope(ctx, 7, &types.MarketplaceAccess{
		ProductID: "product", SourceTenantID: 99,
		Agent:            &types.CustomAgent{ID: "published-agent", TenantID: 99},
		KnowledgeBaseIDs: []string{"published-kb"},
	})
	hits := []*types.IndexWithScore{
		{ChunkID: "approved", KnowledgeID: "approved", Score: 0.9},
		{ChunkID: "other-source", KnowledgeID: "other-source", Score: 0.99},
		{ChunkID: "buyer", KnowledgeID: "buyer", Score: 0.98},
	}
	results, err := svc.processSearchResults(scope, hits, true)
	require.NoError(t, err)
	require.Len(t, results, 1)
	require.Equal(t, "approved", results[0].KnowledgeID)
	require.Equal(t, "approved fixture text", results[0].Content)
	require.Equal(t, uint64(7), types.MustTenantIDFromContext(scope), "model billing remains with the buyer")
	_, valid := types.MarketplaceScopeFromContext(scope)
	require.True(t, valid)
	// Each hydration boundary must enforce the grant independently: safe
	// document metadata must not conceal an unsafe chunk-enrichment fallback.
	ids := []string{"approved", "other-source", "buyer"}
	knowledges, err := svc.fetchKnowledgeDataWithShared(scope, 7, ids)
	require.NoError(t, err)
	require.Len(t, knowledges, 1)
	require.Contains(t, knowledges, "approved")
	chunks, err := svc.listChunksByIDWithShared(scope, 7, ids)
	require.NoError(t, err)
	require.Len(t, chunks, 1)
	require.Equal(t, "approved", chunks[0].ID)

	// Direct Lite calls still see only their own rows, even if a retrieve engine
	// supplies source-tenant IDs. The paid scope is the sole cross-tenant grant.
	results, err = svc.processSearchResults(ctx, hits, true)
	require.NoError(t, err)
	require.Len(t, results, 1)
	require.Equal(t, "buyer", results[0].KnowledgeID)

	stale := context.WithValue(scope, types.TenantIDContextKey, uint64(8))
	_, err = svc.processSearchResults(stale, hits, true)
	require.Error(t, err)
	_, err = svc.listChunksByIDWithShared(stale, 8, ids)
	require.Error(t, err)
	_, err = svc.fetchKnowledgeDataWithShared(scope, 99, ids)
	require.Error(t, err)
	_, err = svc.listChunksByIDWithShared(scope, 99, ids)
	require.Error(t, err)
}
