package service

// DefaultServiceSystemPrompts returns built-in processing templates for the workspace prompt editor.
// Formatting placeholders are kept in the templates because callers supply their runtime values.
func DefaultServiceSystemPrompts() map[string]string {
	return map[string]string{
		"table.description":   tableDescriptionPromptTemplate,
		"table.columns":       columnDescriptionsPromptTemplate,
		"image.ocr":           vlmOCRPrompt,
		"image.scanned_pdf":   vlmOCRScannedPDFPrompt,
		"image.caption":       vlmCaptionPrompt,
		"video.understanding": videoUnderstandingPrompt,
		"chat.suggestions":    messageSuggestionSystemPrompt,
	}
}
