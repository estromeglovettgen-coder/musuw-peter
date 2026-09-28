package service

import (
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"

	"github.com/stretchr/testify/require"
)

func sourceFile(t *testing.T, name string) string {
	t.Helper()
	_, thisFile, _, ok := runtime.Caller(0)
	require.True(t, ok)
	content, err := os.ReadFile(filepath.Join(filepath.Dir(thisFile), name))
	require.NoError(t, err)
	return string(content)
}

func serviceSource(t *testing.T, name string) string {
	return sourceFile(t, name)
}

func TestWikiSceneResolverIsSharedByBothLifecycleEntrypoints(t *testing.T) {
	source := serviceSource(t, "wiki_ingest_batch.go")
	ingestStart := strings.Index(source, "func (s *wikiIngestService) ProcessWikiIngest")
	finalizeStart := strings.Index(source, "func (s *wikiIngestService) ProcessWikiFinalize")
	require.GreaterOrEqual(t, ingestStart, 0)
	require.Greater(t, finalizeStart, ingestStart)

	ingestBody := source[ingestStart:finalizeStart]
	finalizeBody := source[finalizeStart:]
	require.Contains(t, ingestBody, "s.resolveWikiChatModel(ctx, kb)")
	require.Contains(t, finalizeBody, "s.resolveWikiChatModel(ctx, kb)")
	require.Equal(t, 1, strings.Count(ingestBody, "s.resolveWikiChatModel(ctx, kb)"))
	require.Equal(t, 1, strings.Count(finalizeBody, "s.resolveWikiChatModel(ctx, kb)"))
}

func TestConsumerSceneResolverUsageStaysWithinRuntimeAllowlist(t *testing.T) {
	// These are deliberately narrow sentinel files for non-V1 model authorities;
	// a future consumer scene change must not silently capture their bindings.
	for _, name := range []string{
		"knowledgebase_search.go",
		"chunk.go",
		"image_multimodal.go",
		"knowledge_post_process.go",
		"wiki_ingest_taxonomy.go",
		"knowledge_faq.go",
		"evaluation.go",
		"agent_service.go",
		"temporary_document.go",
	} {
		source := serviceSource(t, name)
		require.NotContains(t, source, "ResolveConsumerModel", name)
		require.NotContains(t, source, "consumerModelResolver", name)
	}
	for _, name := range []string{"../../im/service.go", "../../handler/model.go"} {
		source := sourceFile(t, name)
		require.NotContains(t, source, "ResolveConsumerModel", name)
		require.NotContains(t, source, "consumerModelResolver", name)
	}
}
