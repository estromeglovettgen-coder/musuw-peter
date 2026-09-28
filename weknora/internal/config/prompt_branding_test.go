package config

import (
	"path/filepath"
	"strings"
	"testing"
)

func TestPromptTemplatesUseMusuwBranding(t *testing.T) {
	templates, err := loadPromptTemplates(filepath.Join("..", "..", "config"))
	if err != nil {
		t.Fatalf("load prompt templates: %v", err)
	}

	groups := [][]PromptTemplate{
		templates.SystemPrompt,
		templates.ContextTemplate,
		templates.Rewrite,
		templates.Fallback,
		templates.GenerateSessionTitle,
		templates.GenerateSummary,
		templates.KeywordsExtraction,
		templates.AgentSystemPrompt,
		templates.GraphExtraction,
		templates.GenerateQuestions,
		templates.IntentPrompts,
	}

	foundMusuw, foundDidiRen := false, false
	for _, group := range groups {
		for _, template := range group {
			// `.weknora/requirements.json` is a stable sandbox wire path, not
			// user-facing product branding. Preserve that compatibility token
			// while rejecting legacy names everywhere else in prompt prose.
			brandingText := strings.ReplaceAll(strings.ToLower(template.Content), ".weknora", "")
			if strings.Contains(brandingText, "weknora") || strings.Contains(brandingText, "tencent") || strings.Contains(template.Content, "腾讯") {
				t.Fatalf("template %q still contains legacy branding", template.ID)
			}
			foundMusuw = foundMusuw || strings.Contains(template.Content, "Musuw")
			foundDidiRen = foundDidiRen || strings.Contains(template.Content, "地底人")
		}
	}
	if !foundMusuw || !foundDidiRen {
		t.Fatalf("prompt templates must identify the product as Musuw by 地底人; foundMusuw=%v foundDidiRen=%v", foundMusuw, foundDidiRen)
	}
}

func TestSessionTitlePromptRequiresPlainTextWithoutLinks(t *testing.T) {
	templates, err := loadPromptTemplates(filepath.Join("..", "..", "config"))
	if err != nil {
		t.Fatalf("load prompt templates: %v", err)
	}

	template := FindTemplateByID(templates, "default_session_title")
	if template == nil {
		t.Fatal("default_session_title prompt is missing")
	}
	for _, requirement := range []string{
		"one line of plain text",
		"Do not include Markdown, URLs, citations",
	} {
		if !strings.Contains(template.Content, requirement) {
			t.Fatalf("default_session_title prompt must contain %q", requirement)
		}
	}
}
