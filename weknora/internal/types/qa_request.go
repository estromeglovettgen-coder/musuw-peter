package types

// QARequest consolidates all parameters for KnowledgeQA and AgentQA service calls,
// replacing the previous 14-parameter method signatures.
// EventBus is passed separately to avoid circular dependency with the event package.
type QARequest struct {
	Session             *Session           // The conversation session
	Query               string             // User query text
	AssistantMessageID  string             // Pre-created assistant message ID
	SummaryModelID      string             // Optional model override; empty = use agent/KB default
	Thinking            *bool              // Optional request override; nil = use agent/default configuration
	ReasoningEffort     string             // OpenRouter native reasoning effort
	CustomAgent         *CustomAgent       // Optional custom agent for config override
	SharedAgentReadOnly bool               // True only when access came from an agent share; source-workspace writes are forbidden
	KnowledgeBaseIDs    []string           // Knowledge base IDs to search (from request + @mentions)
	KnowledgeIDs        []string           // Specific knowledge (file) IDs to search
	TagScopes           []TagScope         // Tag-constrained KB scopes from @mentions
	MCPServiceIDs       []string           // Per-request MCP service IDs from @mentions
	SkillNames          []string           // Per-request preloaded skill names from @mentions
	ImageURLs           []string           // Image URLs for multimodal input
	ImageDescription    string             // VLM-generated image description (fallback for non-vision models)
	UserMessageID       string             // Created user message ID
	WebSearchEnabled    bool               // Whether web search is enabled for this request
	QuotedContext       string             // Quoted message content from IM quote-reply (appended at LLM prompt stage, not used for retrieval)
	Attachments         MessageAttachments // File attachments (processed and ready for prompt injection)
	// GenerateTitle is an internal runtime hint. The handler keeps title
	// generation on the same event bus but lets platform services wait until
	// the effective scene model has been resolved.
	GenerateTitle bool `json:"-"`
}
