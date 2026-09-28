package types

// ConsumerScene identifies one of the fixed platform-owned consumer model
// call paths. Keep this closed set small: callers must not be able to invent
// policy namespaces by sending arbitrary strings.
type ConsumerScene string

const (
	ConsumerSceneChat ConsumerScene = "chat"
	ConsumerSceneRAG  ConsumerScene = "rag"
	ConsumerSceneWiki ConsumerScene = "wiki"
	// Rerank, vision, and ASR are exposed as separate consumer boundaries.
	// Embedding remains a platform-owned KB binding and intentionally has no
	// consumer scene or settings entry.
	ConsumerSceneRerank ConsumerScene = "rerank"
	ConsumerSceneVision ConsumerScene = "vision"
	ConsumerSceneASR    ConsumerScene = "asr"
)

// ConsumerScenes returns the five fixed user-facing boundaries in the order
// used by settings and options responses. Chat remains a valid compatibility
// scene for the existing runtime path but is not a consumer settings row.
// A fresh slice prevents callers from mutating package state.
func ConsumerScenes() []ConsumerScene {
	return []ConsumerScene{
		ConsumerSceneRAG,
		ConsumerSceneRerank,
		ConsumerSceneWiki,
		ConsumerSceneVision,
		ConsumerSceneASR,
	}
}

// Valid reports whether the scene is one of the supported consumer paths.
// Chat is retained for existing platform chat/RAG runtime callers; Embedding
// deliberately has no scene because its identity is bound to each KB.
func (s ConsumerScene) Valid() bool {
	switch s {
	case ConsumerSceneChat, ConsumerSceneRAG, ConsumerSceneWiki,
		ConsumerSceneRerank, ConsumerSceneVision, ConsumerSceneASR:
		return true
	default:
		return false
	}
}

// ModelType returns the native WeKnora model interface backing this consumer
// boundary. An empty value means the scene is unknown.
func (s ConsumerScene) ModelType() ModelType {
	switch s {
	case ConsumerSceneChat, ConsumerSceneRAG, ConsumerSceneWiki:
		return ModelTypeKnowledgeQA
	case ConsumerSceneRerank:
		return ModelTypeRerank
	case ConsumerSceneVision:
		return ModelTypeVLLM
	case ConsumerSceneASR:
		return ModelTypeASR
	default:
		return ""
	}
}

// CompatibilityDefaultID returns the existing deterministic platform model
// for this boundary. It is used only when a policy is missing or invalid; it
// never chooses an arbitrary repository row.
func (s ConsumerScene) CompatibilityDefaultID() string {
	switch s {
	case ConsumerSceneChat, ConsumerSceneRAG, ConsumerSceneWiki:
		return PlatformKnowledgeBaseChatModelID
	case ConsumerSceneRerank:
		return CheapestRerankModelID
	case ConsumerSceneVision:
		return PlatformKnowledgeBaseVLMModelID
	case ConsumerSceneASR:
		return PlatformKnowledgeBaseASRModelID
	default:
		return ""
	}
}

func (s ConsumerScene) FreeDefaultKey() string {
	return "consumer_models." + string(s) + ".free_default"
}

func (s ConsumerScene) PaidOptionsKey() string {
	return "consumer_models." + string(s) + ".paid_options"
}

// ConsumerModelOption is the intentionally narrow scene-options response.
// It contains display/capability state only; provider configuration and
// credentials remain behind the existing model service.
type ConsumerModelOption struct {
	ModelID     string `json:"model_id"`
	DisplayName string `json:"display_name"`
	// ModelType is the native WeKnora interface for this fixed boundary. It
	// is capability metadata only; provider parameters and credentials remain
	// server-side and are intentionally absent from this DTO.
	ModelType    ModelType `json:"model_type"`
	Selectable   bool      `json:"selectable"`
	Locked       bool      `json:"locked"`
	RequiredPlan string    `json:"required_plan"`
	SceneDefault bool      `json:"is_scene_default"`
	Effective    bool      `json:"is_effective"`
}
