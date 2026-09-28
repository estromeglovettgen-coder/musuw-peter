package service

import (
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"

	"github.com/stretchr/testify/require"
)

func faqStorageAccountingSource(t *testing.T, name string) string {
	t.Helper()
	_, current, _, ok := runtime.Caller(0)
	require.True(t, ok)
	data, err := os.ReadFile(filepath.Join(filepath.Dir(current), name))
	require.NoError(t, err)
	return string(data)
}

// TestFAQStorageAccountingUsesPairedMutations locks the FAQ callers to the
// storage contract used by document ingestion: knowledge row and tenant usage
// must be changed through the paired repository operation, never as two
// independent writes. The replacement path must clean external vectors before
// deleting their source chunks so a failed vector cleanup remains retryable.
func TestFAQStorageAccountingUsesPairedMutations(t *testing.T) {
	t.Parallel()

	faqSource := faqStorageAccountingSource(t, "knowledge_faq.go")
	importSource := faqStorageAccountingSource(t, "knowledge_faq_import.go")

	require.NotContains(t, faqSource, "tenantRepo.AdjustStorageUsed(")
	require.NotContains(t, importSource, "tenantRepo.AdjustStorageUsed(")
	require.Contains(t, importSource, "UpdateKnowledgeWithStorage(")

	vectorDelete := strings.Index(importSource, "deleteFAQChunkVectors(ctx, kb, faqKnowledge, chunksToDelete)")
	chunkDelete := strings.Index(importSource, "chunkRepo.DeleteChunks(ctx, tenantID, chunkIDsToDelete)")
	require.GreaterOrEqual(t, vectorDelete, 0)
	require.GreaterOrEqual(t, chunkDelete, 0)
	require.Less(t, vectorDelete, chunkDelete,
		"replace import must delete vectors before deleting source chunks")

	// Re-indexed FAQ content can change its estimated index footprint. All
	// interactive and merge re-indexes therefore opt into storage accounting.
	require.Equal(t, 3, strings.Count(faqSource, "embeddingModel, true, false"),
		"create, edit, and add-similar paths must account indexed bytes")
	require.Contains(t, importSource, "mergedChunks, embeddingModel, true, false")
	require.Contains(t, importSource, "BatchIndex(ctx, embeddingModel, previousInfo)",
		"paired mutation failure must restore overwritten merge vectors")
	require.Contains(t, faqSource, "UpdateChunk(ctx, &oldChunk)",
		"interactive edit failures must restore the source chunk after vector rollback")

	// Separate-question mode must use one canonical source-id function for
	// create, update, estimate and delete. Mixing positional IDs with hashes
	// leaves stale vectors behind when similar questions are reordered.
	require.Contains(t, faqSource, "faqSimilarQuestionSourceID(")
	require.Contains(t, importSource, "faqSimilarQuestionSourceID(")
	require.NotContains(t, faqSource, "fmt.Sprintf(\"%s-%d\", chunk.ID")

	// Cross-system delete and merge paths must compensate a failed later write;
	// otherwise a retry double-charges storage or leaves DB metadata ahead of
	// the retriever.
	require.Contains(t, faqSource, "restoreFAQDeleteState")
	require.Contains(t, importSource, "RestoreChunks(ctx, deletedChunks)")
	require.Contains(t, importSource, "SaveChunks(ctx, previousChunks)")
	require.Contains(t, importSource, "failed to restore merged chunks")
}
