package service

import (
	"context"
	"errors"
	"strings"

	"github.com/Tencent/WeKnora/internal/types"
)

const maxCompactKnowledgeTitleRunes = 40

// conciseAnalysisTitle normalizes a title that came from an existing parser or
// model analysis result. Video analysis already emits a Markdown heading, so
// this helper only extracts and bounds that heading; it never calls an LLM.
func conciseAnalysisTitle(raw string) string {
	title := strings.TrimSpace(raw)
	if title == "" {
		return ""
	}
	if strings.ContainsAny(title, "\r\n") {
		title = firstMarkdownTitle(title)
	}
	title = strings.Join(strings.Fields(title), " ")
	title = strings.TrimSpace(strings.Trim(title, "\"'#*`“”‘’"))
	if title == "" {
		return ""
	}
	clean, rejected := sanitizeGeneratedTitle(title)
	if rejected || strings.Contains(clean, "#") {
		return ""
	}
	words := strings.Fields(clean)
	if len(words) > 10 {
		return ""
	}
	// Languages without word separators need a compact rune bound instead of
	// the 4-10 word contract used for space-delimited titles.
	if len(words) <= 2 && len([]rune(clean)) > maxCompactKnowledgeTitleRunes {
		return ""
	}
	return clean
}

func automaticURLKnowledgeTitle(knowledge *types.Knowledge) bool {
	if knowledge == nil || !strings.EqualFold(strings.TrimSpace(knowledge.Type), "url") {
		return false
	}
	source := strings.TrimSpace(knowledge.Source)
	if source == "" {
		return false
	}
	title := strings.TrimSpace(knowledge.Title)
	return title == "" || title == source
}

// updateKnowledgeTitleFromAnalysis converges an automatically titled URL
// knowledge row onto an explicit model/parser title. A Markdown heading alone
// is not title metadata: social-document Markdown starts with the provider's
// full caption, which is content rather than a concise title. The repository
// evaluates the source/title guard in the UPDATE itself so a manual rename that
// landed while parsing is preserved.
func (s *knowledgeService) updateKnowledgeTitleFromAnalysis(
	ctx context.Context,
	knowledge *types.Knowledge,
	result *types.ReadResult,
) error {
	if !automaticURLKnowledgeTitle(knowledge) || result == nil {
		return nil
	}
	candidate := ""
	if result.Metadata != nil {
		candidate = result.Metadata["title"]
	}
	candidate = conciseAnalysisTitle(candidate)
	if candidate == "" ||
		candidate == strings.TrimSpace(knowledge.Title) ||
		candidate == strings.TrimSpace(knowledge.Source) {
		return nil
	}
	if s == nil || s.repo == nil {
		return errors.New("knowledge title repository is not configured")
	}
	updated, err := s.repo.UpdateURLKnowledgeTitleIfAutomatic(
		ctx,
		knowledge.TenantID,
		knowledge.ID,
		knowledge.Source,
		candidate,
	)
	if err != nil {
		return err
	}
	if updated {
		knowledge.Title = candidate
	}
	return nil
}
