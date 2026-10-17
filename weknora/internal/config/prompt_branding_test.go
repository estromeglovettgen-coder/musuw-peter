package config

import (
	"path/filepath"
	"strings"
	"testing"
)

func TestPromptTemplatesUseTaylorBranding(t *testing.T) {
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

	foundTaylor := false
	for _, group := range groups {
		for _, template := range group {
			// `.weknora/requirements.json` is a stable sandbox wire path, not
			// user-facing product branding. Preserve that compatibility token
			// while rejecting legacy names everywhere else in prompt prose.
			brandingText := strings.ReplaceAll(strings.ToLower(template.Content), ".weknora", "")
			if strings.Contains(brandingText, "weknora") || strings.Contains(brandingText, "tencent") || strings.Contains(template.Content, "腾讯") {
				t.Fatalf("template %q still contains legacy branding", template.ID)
			}
			if strings.Contains(strings.ToLower(template.Content), "peter") {
				t.Fatalf("template %q still contains the previous assistant identity", template.ID)
			}
			if strings.Contains(template.Content, "Musuw") || strings.Contains(template.Content, "地底人") {
				t.Fatalf("template %q still contains the original product identity", template.ID)
			}
			foundTaylor = foundTaylor || strings.Contains(template.Content, "Taylor")
		}
	}
	if !foundTaylor {
		t.Fatal("prompt templates must identify the assistant as Taylor")
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
		"一行纯文本",
		"不要包含 Markdown、URL、引用",
	} {
		if !strings.Contains(template.Content, requirement) {
			t.Fatalf("default_session_title prompt must contain %q", requirement)
		}
	}
}
