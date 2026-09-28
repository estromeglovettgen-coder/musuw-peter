package service

import (
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"

	"github.com/stretchr/testify/require"
)

func storageAccountingServiceSource(t *testing.T, name string) string {
	t.Helper()
	_, current, _, ok := runtime.Caller(0)
	require.True(t, ok)
	data, err := os.ReadFile(filepath.Join(filepath.Dir(current), name))
	require.NoError(t, err)
	return string(data)
}

func TestKnowledgeStorageAccountingUsesPairedRepositoryMutations(t *testing.T) {
	t.Parallel()

	createSource := storageAccountingServiceSource(t, "knowledge_create.go")
	processSource := storageAccountingServiceSource(t, "knowledge_process.go")
	tikHubSource := storageAccountingServiceSource(t, "knowledge_tikhub.go")
	deleteSource := storageAccountingServiceSource(t, "knowledge_delete.go")
	kbSource := storageAccountingServiceSource(t, "knowledgebase.go")

	require.Contains(t, createSource, "CreateKnowledgeWithStorage(ctx, knowledge, storageQuota)")
	require.Contains(t, processSource, "CreateKnowledgeWithStorage(ctx, dst, storageQuota)")
	require.Contains(t, processSource, "UpdateKnowledgeWithStorage(ctx, knowledge, storageQuota)")
	require.Contains(t, tikHubSource, "ClaimKnowledgeSourceWithStorage(ctx, updatedKnowledge, storageQuota)")
	require.Contains(t, deleteSource, "DeleteKnowledgeWithStorage(ctx, tenantID, id)")
	require.Contains(t, deleteSource, "DeleteKnowledgeListWithStorage(ctx, tenantInfo.ID, ids)")
	require.Contains(t, kbSource, "DeleteKnowledgeListWithStorage(ctx, tenantID, knowledgeIDs)")

	for fileName, source := range map[string]string{
		"knowledge_create.go":  createSource,
		"knowledge_process.go": processSource,
		"knowledge_tikhub.go":  tikHubSource,
		"knowledge_delete.go":  deleteSource,
	} {
		require.NotContains(t, source, "tenantRepo.AdjustStorageUsed(",
			"%s must not split a knowledge mutation from its usage delta", fileName)
	}

	// Ordinary KB deletion participates in paired accounting. Strict account
	// erasure intentionally uses the legacy row-only delete because the tenant
	// itself is hard-deleted after the worker completes.
	require.Equal(t, 1, strings.Count(kbSource, "kgRepo.DeleteKnowledgeList(ctx, payload.TenantID, knowledgeIDs)"))
}

func TestStorageConsumersKeepTenantUsageAsTheirAuthority(t *testing.T) {
	t.Parallel()

	_, current, _, ok := runtime.Caller(0)
	require.True(t, ok)
	weknoraRoot := filepath.Clean(filepath.Join(filepath.Dir(current), "../../.."))

	read := func(path string) string {
		t.Helper()
		data, err := os.ReadFile(filepath.Join(weknoraRoot, path))
		require.NoError(t, err)
		return string(data)
	}

	entitlementSource := read("internal/application/service/entitlement.go")
	require.Contains(t, entitlementSource, "StorageUsed:")
	require.Contains(t, entitlementSource, "tenant.StorageUsed")
	require.Contains(t, read("frontend/src/views/settings/UsageBillingSettings.vue"), "data.storage_used")
	require.Contains(t, read("../scripts/musuw-admin-server.mjs"), "t.storage_used AS storage_used_bytes")
	require.Contains(t, read("../scripts/musuw-admin-server.mjs"), "SUM(k.file_size)")
	require.Contains(t, read("../scripts/musuw-admin-server.mjs"), "SUM(k.storage_size)")
}

func TestDirectFileURLMaterializationIsDurableAndRetrySafe(t *testing.T) {
	t.Parallel()

	processSource := storageAccountingServiceSource(t, "knowledge_process.go")
	tikHubSource := storageAccountingServiceSource(t, "knowledge_tikhub.go")
	require.Contains(t, processSource, `strings.TrimSpace(knowledge.FilePath) != ""`)
	require.Contains(t, processSource, "payload.FilePath = knowledge.FilePath")
	require.Contains(t, processSource, "payload.FileURL = \"\"")
	require.Contains(t, processSource, "SaveBytes(ctx, contentBytes, payload.TenantID, resolvedFileName, false)")
	require.Contains(t, processSource, "proposedKnowledge.FileSize = int64(len(contentBytes))")
	require.Contains(t, processSource, "ClaimKnowledgeSourceWithStorage(ctx, proposedKnowledge, storageQuota)")
	require.Contains(t, processSource, "!claimed && filePath != currentKnowledge.FilePath")
	require.Contains(t, processSource, "currentKnowledge.ParseStatus == types.ParseStatusCancelled || currentKnowledge.ParseStatus == types.ParseStatusDeleting")
	require.Contains(t, processSource, "UpdateKnowledgeColumns(ctx, knowledge.ID")
	require.Contains(t, processSource, "fileSvc.DeleteFile(ctx, filePath)")
	require.Contains(t, tikHubSource, "ClaimKnowledgeSourceWithStorage(ctx, updatedKnowledge, storageQuota)")
	require.Contains(t, tikHubSource, "!claimed && filePath != currentKnowledge.FilePath")
	require.Contains(t, tikHubSource, "currentKnowledge.ParseStatus == types.ParseStatusCancelled || currentKnowledge.ParseStatus == types.ParseStatusDeleting")
	require.Contains(t, tikHubSource, "cleanupResolvedImages()")
}
