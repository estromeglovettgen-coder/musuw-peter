package types

import (
	"fmt"
	"strings"
)

// MaxCustomPromptInstructionsLength bounds user-authored business guidance.
// These fields are intentionally much smaller than full prompt templates.
const MaxCustomPromptInstructionsLength = 4000

// AppendCustomPromptInstructions appends user-authored business guidance to a
// system-owned prompt. Stable output, safety and citation rules always win.
func AppendCustomPromptInstructions(prompt, instructions, label string) string {
	instructions = strings.TrimSpace(instructions)
	if instructions == "" {
		return prompt
	}
	if label == "" {
		label = "custom"
	}
	priority := "执行上述业务要求，同时保留输出格式、引用、真实性和安全规则。"
	if label == "wiki_content" || label == "wiki_extraction" {
		priority = "上述业务要求明确限定内容范围时，优先于默认模板的内容广度和长度建议。只生成要求范围内的内容，不要为凑字数添加范围外的事实、章节、概念或关系；仍须保留输出协议、必要引用和真实性规则。"
	}
	return fmt.Sprintf("%s\n\n<%s_business_instructions>\n%s\n</%s_business_instructions>\n%s",
		strings.TrimSpace(prompt), label, instructions, label, priority)
}

// NormalizeKnowledgeBasePromptInstructions trims whitespace on all KB-scoped
// custom instruction fields before persistence.
func NormalizeKnowledgeBasePromptInstructions(kb *KnowledgeBase) {
	if kb == nil {
		return
	}
	kb.ChunkingConfig.TableMetadataInstructions = strings.TrimSpace(kb.ChunkingConfig.TableMetadataInstructions)
	kb.VLMConfig.CustomInstructions = strings.TrimSpace(kb.VLMConfig.CustomInstructions)
	if kb.WikiConfig != nil {
		kb.WikiConfig.ContentInstructions = strings.TrimSpace(kb.WikiConfig.ContentInstructions)
		kb.WikiConfig.ExtractionInstructions = strings.TrimSpace(kb.WikiConfig.ExtractionInstructions)
	}
	if kb.QuestionGenerationConfig != nil {
		kb.QuestionGenerationConfig.CustomInstructions = strings.TrimSpace(kb.QuestionGenerationConfig.CustomInstructions)
	}
	if kb.ExtractConfig != nil {
		kb.ExtractConfig.CustomInstructions = strings.TrimSpace(kb.ExtractConfig.CustomInstructions)
	}
}

// ValidateKnowledgeBasePromptInstructions checks length limits on KB-scoped
// custom instruction fields.
func ValidateKnowledgeBasePromptInstructions(kb *KnowledgeBase) error {
	if kb == nil {
		return nil
	}
	fields := map[string]string{
		"table metadata instructions": kb.ChunkingConfig.TableMetadataInstructions,
		"image instructions":          kb.VLMConfig.CustomInstructions,
	}
	if kb.WikiConfig != nil {
		fields["wiki content instructions"] = kb.WikiConfig.ContentInstructions
		fields["wiki extraction instructions"] = kb.WikiConfig.ExtractionInstructions
	}
	if kb.QuestionGenerationConfig != nil {
		fields["question generation instructions"] = kb.QuestionGenerationConfig.CustomInstructions
	}
	if kb.ExtractConfig != nil {
		fields["graph extraction instructions"] = kb.ExtractConfig.CustomInstructions
	}
	return validatePromptInstructionFields(fields)
}

// ValidateEffectiveProcessPromptInstructions checks length limits on the
// merged per-upload effective config.
func ValidateEffectiveProcessPromptInstructions(eff EffectiveProcessConfig) error {
	fields := map[string]string{
		"table metadata instructions":      eff.ChunkingConfig.TableMetadataInstructions,
		"image instructions":               eff.VLMConfig.CustomInstructions,
		"question generation instructions": eff.QuestionGenerationConfig.CustomInstructions,
		"graph extraction instructions":    eff.ExtractConfig.CustomInstructions,
	}
	return validatePromptInstructionFields(fields)
}

func validatePromptInstructionFields(fields map[string]string) error {
	for name, value := range fields {
		if len([]rune(value)) > MaxCustomPromptInstructionsLength {
			return fmt.Errorf("%s exceeds %d characters", name, MaxCustomPromptInstructionsLength)
		}
	}
	return nil
}
