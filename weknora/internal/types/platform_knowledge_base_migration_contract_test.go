package types

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// The versioned migration is the production contract for workspaces created
// before the server-owned zero-config profile existed. Keep this test outside
// migrations/versioned: release validation intentionally permits only SQL
// migration artifacts in that directory.
func TestPlatformKnowledgeBaseDefaultsMigrationConvergesLiveDocumentKBs(t *testing.T) {
	path := filepath.Join("..", "..", "migrations", "versioned", "000082_platform_knowledge_base_defaults.up.sql")
	raw, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read platform KB defaults migration: %v", err)
	}
	sql := strings.ToLower(string(raw))

	for _, want := range []string{
		"builtin-deepseek-v4-pro",
		"builtin-openrouter-embedding",
		"builtin-openrouter-vlm",
		"builtin-openrouter-asr",
		"embedding_model_id",
		"summary_model_id",
		"image_processing_config",
		"vlm_config",
		"asr_config",
		"wiki_config",
		"extract_config",
		"indexing_strategy",
		"vector_enabled",
		"keyword_enabled",
		"wiki_enabled",
		"graph_enabled",
		"extraction_granularity",
		"where deleted_at is null",
		"type = 'document'",
	} {
		if !strings.Contains(sql, want) {
			t.Errorf("migration must configure %q", want)
		}
	}

	for _, forbidden := range []string{
		"delete from knowledge_bases",
		"drop table knowledge_bases",
	} {
		if strings.Contains(sql, forbidden) {
			t.Errorf("migration must be additive, found %q", forbidden)
		}
	}
}
