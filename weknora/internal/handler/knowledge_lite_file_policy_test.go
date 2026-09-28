package handler

import (
	"testing"

	"github.com/stretchr/testify/require"
)

func TestLiteKnowledgeFilePolicyRejectsXMindFromEveryImportHint(t *testing.T) {
	originalEdition := Edition
	Edition = "lite"
	t.Cleanup(func() { Edition = originalEdition })

	for name, input := range map[string][]string{
		"upload filename": {"planning.XMIND", "", "", ""},
		"custom filename": {"upload.bin", "planning.xmind", "", ""},
		"declared type":   {"", "", ".xmind", ""},
		"url path":        {"", "", "", "https://files.example.test/roadmap.xmind?token=redacted"},
	} {
		t.Run(name, func(t *testing.T) {
			require.True(t, liteKnowledgeImportUsesXMind(input[0], input[1], input[2], input[3]))
		})
	}
	require.False(t, liteKnowledgeImportUsesXMind("notes.md", "folder/notes.md", "md", "https://files.example.test/notes.md"))
}

func TestStandardKnowledgeFilePolicyKeepsNativeXMindSupport(t *testing.T) {
	originalEdition := Edition
	Edition = "standard"
	t.Cleanup(func() { Edition = originalEdition })

	require.False(t, liteKnowledgeImportUsesXMind("planning.xmind", "", "", ""))
}
