package memory

// DefaultSystemPrompts returns the built-in templates used by the workspace prompt editor.
func DefaultSystemPrompts() map[string]string {
	return map[string]string{
		"memory.extract":            extractionSystemPrompt,
		"memory.consolidate":        consolidationSystemPrompt,
		"memory.topic_adjudication": topicAdjudicationPrompt,
	}
}
