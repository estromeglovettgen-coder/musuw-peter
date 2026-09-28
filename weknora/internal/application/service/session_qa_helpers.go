package service

import (
	"context"
	"fmt"
	"strings"

	apperrors "github.com/Tencent/WeKnora/internal/errors"
	"github.com/Tencent/WeKnora/internal/logger"
	"github.com/Tencent/WeKnora/internal/types"
)

// effectiveWebSearchEnabled keeps Standard's per-request behavior and makes
// Lite's platform-managed web search mandatory for every service caller.
func effectiveWebSearchEnabled(requested bool) bool {
	return isLiteProductEdition() || requested
}

// rejectLiteForeignAgent keeps the authenticated session tenant as the
// permission root for both QA entry points. The HTTP handler normally hides
// shared-agent selectors in Lite, but service callers can still carry a stale
// source-tenant context or invoke the service directly. Rejecting a foreign
// agent before model, KB, tool, or context-overlay consumption closes that
// lower-level seam without changing Standard's native sharing behavior.
func rejectLiteForeignAgent(ctx context.Context, req *types.QARequest) error {
	if ctx.Value(types.MarketplaceScopeContextKey) != nil {
		scope, ok := types.MarketplaceScopeFromContext(ctx)
		if !ok || req == nil || req.Session == nil || !scope.AllowsAgent(req.CustomAgent, req.Session.TenantID) ||
			!req.SharedAgentReadOnly || len(req.KnowledgeIDs) != 0 || len(req.TagScopes) != 0 ||
			len(req.MCPServiceIDs) != 0 || len(req.SkillNames) != 0 {
			return apperrors.NewForbiddenError("purchased service scope is invalid")
		}
		for _, ids := range [][]string{req.KnowledgeBaseIDs, req.CustomAgent.Config.KnowledgeBases} {
			for _, id := range ids {
				if !scope.AllowsKnowledgeBase(id, req.CustomAgent.TenantID) {
					return apperrors.NewForbiddenError("knowledge base is outside the purchased service")
				}
			}
		}
		return nil
	}
	if !isLiteProductEdition() || req == nil || req.Session == nil {
		return nil
	}
	if callerTenantID, ok := types.TenantIDFromContext(ctx); ok && callerTenantID != 0 &&
		callerTenantID != req.Session.TenantID {
		return apperrors.NewNotFoundError("agent not found")
	}
	if req.CustomAgent != nil &&
		!isPlatformManagedBuiltinAgentID(req.CustomAgent.ID) && req.CustomAgent.TenantID != 0 &&
		req.CustomAgent.TenantID != req.Session.TenantID {
		return apperrors.NewNotFoundError("agent not found")
	}
	return nil
}

// ---------------------------------------------------------------------------
// Shared QA helpers: KB resolution, model resolution, retrieval tenant
// ---------------------------------------------------------------------------

// resolveKnowledgeBases resolves the effective knowledge base IDs and knowledge IDs
// for a QA request. Priority:
//  1. Explicit @mentions (request-specified kbIDs / knowledgeIDs)
//  2. RetrieveKBOnlyWhenMentioned -> disable KB if no mention
//  3. Agent's configured knowledge bases (via KBSelectionMode)
func (s *sessionService) resolveKnowledgeBases(
	ctx context.Context,
	req *types.QARequest,
) (kbIDs []string, knowledgeIDs []string, err error) {
	kbIDs = req.KnowledgeBaseIDs
	knowledgeIDs = req.KnowledgeIDs
	requestedKBIDs := append([]string(nil), req.KnowledgeBaseIDs...)
	customAgent := req.CustomAgent

	hasExplicitMention := len(kbIDs) > 0 || len(knowledgeIDs) > 0 || len(req.TagScopes) > 0
	if customAgent != nil {
		logger.Infof(ctx, "KB resolution: hasExplicitMention=%v, RetrieveKBOnlyWhenMentioned=%v, KBSelectionMode=%s",
			hasExplicitMention, customAgent.Config.RetrieveKBOnlyWhenMentioned, customAgent.Config.KBSelectionMode)
	}

	if hasExplicitMention {
		logger.Infof(ctx, "Using request-specified targets: kbs=%v, docs=%v", kbIDs, knowledgeIDs)
		// When using a shared agent, restrict @mentions to the agent's allowed KB scope
		// to prevent users from injecting KB/knowledge IDs outside the agent's configured range.
		if customAgent != nil && req.Session != nil && req.Session.TenantID != customAgent.TenantID {
			kbIDs, knowledgeIDs = s.restrictMentionsToAgentScope(ctx, customAgent, req.Session.TenantID, kbIDs, knowledgeIDs)
			req.TagScopes = s.restrictTagScopesToAgentScope(ctx, customAgent, req.Session.TenantID, req.TagScopes)
		}
	} else if customAgent != nil && customAgent.Config.RetrieveKBOnlyWhenMentioned {
		kbIDs = nil
		knowledgeIDs = nil
		logger.Infof(ctx, "RetrieveKBOnlyWhenMentioned is enabled and no @ mention found, KB retrieval disabled for this request")
	} else if customAgent != nil {
		kbIDs = s.resolveKnowledgeBasesFromAgent(ctx, customAgent, req.Session.TenantID)
	}

	if err := types.AuthorizeTenantAPIKeyKnowledgeTargets(ctx, requestedKBIDs, req.KnowledgeIDs); err != nil {
		return nil, nil, err
	}
	kbIDs, err = types.FilterKnowledgeBasesForTenantAPIKeyScope(ctx, requestedKBIDs, kbIDs)
	if err != nil {
		return nil, nil, err
	}
	return kbIDs, knowledgeIDs, nil
}

func (s *sessionService) restrictTagScopesToAgentScope(
	ctx context.Context,
	agent *types.CustomAgent,
	sessionTenantID uint64,
	tagScopes []types.TagScope,
) []types.TagScope {
	if len(tagScopes) == 0 {
		return nil
	}
	allowedKBIDs := s.resolveKnowledgeBasesFromAgent(ctx, agent, sessionTenantID)
	allowedSet := make(map[string]bool, len(allowedKBIDs))
	for _, id := range allowedKBIDs {
		allowedSet[id] = true
	}
	filtered := make([]types.TagScope, 0, len(tagScopes))
	for _, scope := range tagScopes {
		if allowedSet[scope.KnowledgeBaseID] {
			filtered = append(filtered, scope)
			continue
		}
		logger.Warnf(ctx, "Blocking @mentioned tag scope for KB %s: not in shared agent's allowed scope", scope.KnowledgeBaseID)
	}
	return filtered
}

// resolveChatModelID resolves the effective chat model ID for a QA request.
//
// Standard agents require complete model configuration. Platform answer modes
// and Lite agents owned by the caller may bind a request model first, validated
// by ModelService against the caller's plan and catalog. Prompts, tools and
// knowledge scopes remain unchanged; only the runtime model binding follows
// the user's allowed dropdown selection.
//
// Without an agent, the legacy KB / session / system fallback remains
// available for non-agent callers.
func (s *sessionService) resolveChatModelID(
	ctx context.Context,
	req *types.QARequest,
	knowledgeBaseIDs []string,
	knowledgeIDs []string,
) (string, error) {
	summaryModelID := req.SummaryModelID
	customAgent := req.CustomAgent
	session := req.Session
	configuredAgentModelID := ""

	if customAgent != nil {
		callerTenantID, _ := types.TenantIDFromContext(ctx)
		principal, _ := types.PrincipalFromContext(ctx)
		liteOwnedAgent := isLiteProductEdition() && callerTenantID != 0 && session != nil &&
			session.TenantID == callerTenantID && customAgent.TenantID == callerTenantID &&
			!req.SharedAgentReadOnly && principal.Type != types.PrincipalIMUser
		if isPlatformManagedBuiltinAgentID(customAgent.ID) || liteOwnedAgent {
			runtimeModelID := strings.TrimSpace(summaryModelID)
			if runtimeModelID != "" {
				model, err := s.modelService.GetModelByID(ctx, runtimeModelID)
				if err != nil || model == nil || model.Type != types.ModelTypeKnowledgeQA {
					return "", fmt.Errorf(
						"selected chat model %s is unavailable for agent %s", runtimeModelID, customAgent.ID,
					)
				}
				// This agent object is request-scoped. Keep downstream query
				// understanding and AgentQA on the same policy-approved model so a
				// Free request never falls back to the paid YAML default.
				customAgent.Config.ModelID = runtimeModelID
				customAgent.Config.QueryUnderstandModelID = runtimeModelID
				logger.Infof(ctx, "Using selected catalog model_id %s for agent %s", runtimeModelID, customAgent.ID)
				return runtimeModelID, nil
			}
		}

		configuredAgentModelID = strings.TrimSpace(customAgent.Config.ModelID)
		if configuredAgentModelID == "" && customAgent.ID != types.BuiltinWikiFixerID {
			return "", fmt.Errorf("chat model is not configured: please set model_id on agent %s", customAgent.ID)
		}
		if configuredAgentModelID != "" {
			model, err := s.modelService.GetModelByID(ctx, configuredAgentModelID)
			if err != nil || model == nil || model.Type != types.ModelTypeKnowledgeQA {
				return "", fmt.Errorf("configured chat model %s is unavailable for agent %s", configuredAgentModelID, customAgent.ID)
			}
		} else {
			// The wiki fixer is an internal agent and is intentionally omitted
			// from the agent-management list. It therefore cannot receive a
			// user-configured model_id; resolve it from the current Wiki KB or
			// the normal system KnowledgeQA fallback below instead.
			logger.Infof(ctx, "No model_id configured for internal wiki fixer %s, using KB/system fallback", customAgent.ID)
		}
		if isPlatformManagedBuiltinAgentID(customAgent.ID) {
			logger.Infof(ctx, "Using platform answer mode model_id: %s", configuredAgentModelID)
			return configuredAgentModelID, nil
		}
	}

	summaryModelID = strings.TrimSpace(summaryModelID)
	if summaryModelID != "" {
		if model, err := s.modelService.GetModelByID(ctx, summaryModelID); err == nil && model != nil &&
			model.Type == types.ModelTypeKnowledgeQA {
			logger.Infof(ctx, "Using request's summary model override: %s", summaryModelID)
			return summaryModelID, nil
		}
		logger.Warnf(ctx, "Request provided invalid summary model ID %s, falling back", summaryModelID)
	}
	if configuredAgentModelID != "" {
		logger.Infof(ctx, "Using custom agent's model_id: %s", configuredAgentModelID)
		return configuredAgentModelID, nil
	}
	return s.selectChatModelID(ctx, session, knowledgeBaseIDs, knowledgeIDs)
}

// consumerSceneForSearchScope classifies only the effective retrieval scope
// that has already been resolved by the session setup. It deliberately does
// not inspect prompts or agent intent: tags and web search are RAG even when
// the raw KB/document slices are empty.
func consumerSceneForSearchScope(
	searchTargets types.SearchTargets,
	knowledgeBaseIDs []string,
	knowledgeIDs []string,
	webSearchEnabled bool,
) types.ConsumerScene {
	if webSearchEnabled || types.HasKnowledgeRetrievalScope(searchTargets, knowledgeBaseIDs, knowledgeIDs) {
		return types.ConsumerSceneRAG
	}
	return types.ConsumerSceneChat
}

// resolveConsumerChatModel applies the scene policy only to platform-owned
// answer modes. Standard/custom agents keep resolveChatModelID as their model
// authority. The nil resolver branch is intentionally retained for rollout
// compatibility and for callers/tests that construct the service directly.
// Call-site checklist: KnowledgeQA (chat/rag), AgentQA (platform smart), and
// Wiki ingest/finalize use the resolver; embedding/rerank/VLM/ASR and hidden
// or custom-agent calls do not.
func (s *sessionService) resolveConsumerChatModel(
	ctx context.Context,
	req *types.QARequest,
	scene types.ConsumerScene,
	knowledgeBaseIDs []string,
	knowledgeIDs []string,
) (string, error) {
	// IM is an existing non-consumer channel. Its KnowledgeQA/AgentQA calls
	// share this service but must retain their legacy model authority; the
	// resolver's lexical call-site allowlist cannot detect this indirect path.
	if principal, ok := types.PrincipalFromContext(ctx); ok && principal.Type == types.PrincipalIMUser {
		return s.resolveChatModelID(ctx, req, knowledgeBaseIDs, knowledgeIDs)
	}
	if req.CustomAgent != nil && !isPlatformManagedBuiltinAgentID(req.CustomAgent.ID) {
		return s.resolveChatModelID(ctx, req, knowledgeBaseIDs, knowledgeIDs)
	}
	if s.consumerModelResolver == nil || !isLiteProductEdition() {
		return s.resolveChatModelID(ctx, req, knowledgeBaseIDs, knowledgeIDs)
	}

	// Lite exposes one platform agent, so its KnowledgeQA answer model is the
	// same policy candidate for both retrieval and non-retrieval requests. Keep
	// consumerSceneForSearchScope's classification for pipeline behavior, but
	// do not let an empty retrieval scope select a separate Chat policy.
	resolverScene := types.ConsumerSceneRAG
	model, err := s.consumerModelResolver.ResolveConsumerModel(ctx, resolverScene, req.SummaryModelID)
	if err != nil {
		return "", err
	}
	if model == nil || strings.TrimSpace(model.ID) == "" {
		return "", fmt.Errorf("consumer scene %s resolved no chat model", scene)
	}

	// The effective ID is request-scoped and becomes the sole downstream
	// authority for answer generation, query-understanding, and title calls.
	req.SummaryModelID = model.ID
	if req.CustomAgent != nil {
		req.CustomAgent.Config.ModelID = model.ID
		req.CustomAgent.Config.QueryUnderstandModelID = model.ID
	}
	logger.Infof(ctx, "Resolved platform consumer scene %s to model_id %s", resolverScene, model.ID)
	return model.ID, nil
}

// resolveConsumerRerankModelID applies the consumer scene policy only to the
// platform-owned RAG path. Custom agents retain their own rerank authority and
// do not call this helper. The resolver validates the native type and plan
// before the retrieval pipeline can invoke a provider.
func (s *sessionService) resolveConsumerRerankModelID(ctx context.Context, candidate string) (string, error) {
	if s.consumerModelResolver == nil || !isLiteProductEdition() {
		return strings.TrimSpace(candidate), nil
	}
	model, err := s.consumerModelResolver.ResolveConsumerModel(ctx, types.ConsumerSceneRerank, strings.TrimSpace(candidate))
	if err != nil {
		return "", err
	}
	if model == nil || strings.TrimSpace(model.ID) == "" {
		return "", fmt.Errorf("consumer rerank scene resolved no model")
	}
	if model.Type != types.ModelTypeRerank {
		return "", fmt.Errorf("consumer rerank scene resolved a non-rerank model")
	}
	return model.ID, nil
}

// resolveAgentRerankModelID selects the reranker for AgentQA. Platform-owned
// builtin agents on Lite use the current consumer tenant's retrieval setting
// as the resolver candidate; custom agents, IM, and Standard keep the agent's
// configured rerank model as their authority.
func (s *sessionService) resolveAgentRerankModelID(ctx context.Context, req *types.QARequest) (string, error) {
	if req == nil || req.CustomAgent == nil {
		return "", nil
	}
	configuredID := strings.TrimSpace(req.CustomAgent.Config.RerankModelID)
	if !isLiteProductEdition() || !consumerRerankAllowedForRequest(ctx, req.CustomAgent) {
		return configuredID, nil
	}

	candidate := ""
	if tenant, ok := types.TenantInfoFromContext(ctx); ok && tenant.RetrievalConfig != nil {
		candidate = tenant.RetrievalConfig.RerankModelID
	} else if tenantID, ok := types.TenantIDFromContext(ctx); ok && tenantID != 0 && s.tenantService != nil {
		// AgentQA may receive only the tenant ID in lightweight/API contexts.
		// Resolve that ID explicitly; never use the builtin agent's source tenant.
		if tenant, err := s.tenantService.GetTenantByID(ctx, tenantID); err == nil && tenant != nil && tenant.RetrievalConfig != nil {
			candidate = tenant.RetrievalConfig.RerankModelID
		} else if err != nil {
			logger.Warnf(ctx, "Failed to load consumer tenant retrieval config: %v", err)
		}
	}
	return s.resolveConsumerRerankModelID(ctx, candidate)
}

// consumerRerankAllowedForRequest identifies the platform-owned browser/API
// retrieval path. IM is an existing integration channel and keeps its own
// retrieval model authority, just like custom agents do.
func consumerRerankAllowedForRequest(ctx context.Context, customAgent *types.CustomAgent) bool {
	if principal, ok := types.PrincipalFromContext(ctx); ok && principal.Type == types.PrincipalIMUser {
		return false
	}
	return customAgent == nil || isPlatformManagedBuiltinAgentID(customAgent.ID)
}

// resolveRetrievalTenantID determines the tenant ID to use for retrieval scope.
// Priority: agent's tenant > context tenant > session tenant.
func (s *sessionService) resolveRetrievalTenantID(
	ctx context.Context,
	req *types.QARequest,
) uint64 {
	session := req.Session
	customAgent := req.CustomAgent
	if scope, ok := types.MarketplaceScopeFromContext(ctx); ok && session != nil &&
		scope.AllowsAgent(customAgent, session.TenantID) {
		return scope.SourceTenantID()
	}

	// Lite is a single-workspace product. A shared/custom agent object may
	// still be present in a stale internal request, but its source tenant must
	// never become the retrieval authority. Keep the session owner's tenant as
	// the hard boundary before applying the native Standard precedence below.
	if isLiteProductEdition() && session != nil && session.TenantID != 0 {
		return session.TenantID
	}

	retrievalTenantID := session.TenantID
	if customAgent != nil && customAgent.TenantID != 0 {
		retrievalTenantID = customAgent.TenantID
		logger.Infof(ctx, "Using agent tenant %d for retrieval scope", retrievalTenantID)
	} else if v := ctx.Value(types.TenantIDContextKey); v != nil {
		if tid, ok := v.(uint64); ok && tid != 0 {
			retrievalTenantID = tid
			logger.Infof(ctx, "Using effective tenant %d for retrieval from context", retrievalTenantID)
		}
	}
	return retrievalTenantID
}

// applyAgentOverridesToChatManage applies custom agent configuration overrides
// to a ChatManage object that was initialized with system defaults.
// This covers: system prompt, context template, temperature, max tokens, thinking,
// citation output, retrieval thresholds, rewrite settings, fallback settings, FAQ strategy,
// and history turns.
func (s *sessionService) applyAgentOverridesToChatManage(
	ctx context.Context,
	customAgent *types.CustomAgent,
	cm *types.ChatManage,
) {
	if customAgent == nil {
		return
	}

	// Ensure defaults are set
	customAgent.EnsureDefaults()

	// Override summary config fields
	if customAgent.Config.SystemPrompt != "" {
		cm.SummaryConfig.Prompt = customAgent.Config.SystemPrompt
		logger.Infof(ctx, "Using custom agent's system_prompt")
	}
	if customAgent.Config.ContextTemplate != "" {
		cm.SummaryConfig.ContextTemplate = customAgent.Config.ContextTemplate
		logger.Infof(ctx, "Using custom agent's context_template")
	}
	if customAgent.Config.Temperature >= 0 {
		cm.SummaryConfig.Temperature = customAgent.Config.Temperature
		logger.Infof(ctx, "Using custom agent's temperature: %f", customAgent.Config.Temperature)
	}
	if customAgent.Config.MaxCompletionTokens > 0 {
		cm.SummaryConfig.MaxCompletionTokens = customAgent.Config.MaxCompletionTokens
		logger.Infof(ctx, "Using custom agent's max_completion_tokens: %d", customAgent.Config.MaxCompletionTokens)
	}
	// Agent-level thinking setting takes full control (no global fallback).
	// EnsureDefaults pins nil to explicit false so thinking_control wire formats
	// always receive a value.
	cm.SummaryConfig.Thinking = customAgent.Config.Thinking
	cm.CitationEnabled = customAgent.Config.CitationEnabled
	if customAgent.Config.Thinking != nil {
		logger.Infof(ctx, "Using custom agent's thinking: %v", *customAgent.Config.Thinking)
	} else {
		logger.Warnf(ctx, "Custom agent thinking is unset after EnsureDefaults; model thinking param will be omitted")
	}

	// Override retrieval strategy settings
	if customAgent.Config.EmbeddingTopK > 0 {
		cm.EmbeddingTopK = customAgent.Config.EmbeddingTopK
	}
	if customAgent.Config.KeywordThreshold > 0 {
		cm.KeywordThreshold = customAgent.Config.KeywordThreshold
	}
	if customAgent.Config.VectorThreshold > 0 {
		cm.VectorThreshold = customAgent.Config.VectorThreshold
	}
	if customAgent.Config.RerankTopK > 0 {
		cm.RerankTopK = customAgent.Config.RerankTopK
	}
	cm.RerankThreshold = customAgent.Config.RerankThreshold
	if customAgent.Config.RerankModelID != "" {
		cm.RerankModelID = customAgent.Config.RerankModelID
	}

	// Override rewrite settings
	cm.EnableRewrite = customAgent.Config.EnableRewrite
	cm.EnableQueryExpansion = customAgent.Config.EnableQueryExpansion
	if customAgent.Config.RewritePromptSystem != "" {
		cm.RewritePromptSystem = customAgent.Config.RewritePromptSystem
	}
	if customAgent.Config.RewritePromptUser != "" {
		cm.RewritePromptUser = customAgent.Config.RewritePromptUser
	}
	if customAgent.Config.QueryUnderstandModelID != "" {
		cm.QueryUnderstandModelID = customAgent.Config.QueryUnderstandModelID
		logger.Infof(ctx, "Using custom agent's query_understand_model_id: %s",
			customAgent.Config.QueryUnderstandModelID)
	}

	// Override fallback settings
	if customAgent.Config.FallbackStrategy != "" {
		cm.FallbackStrategy = types.FallbackStrategy(customAgent.Config.FallbackStrategy)
	}
	if customAgent.Config.FallbackResponse != "" {
		cm.FallbackResponse = customAgent.Config.FallbackResponse
	}
	if customAgent.Config.FallbackPrompt != "" {
		cm.FallbackPrompt = customAgent.Config.FallbackPrompt
	}

	// Override web search settings
	if customAgent.Config.WebSearchMaxResults > 0 {
		cm.WebSearchMaxResults = customAgent.Config.WebSearchMaxResults
	}

	// Override history turns
	if customAgent.Config.HistoryTurns > 0 {
		cm.MaxRounds = customAgent.Config.HistoryTurns
		logger.Infof(ctx, "Using custom agent's history_turns: %d", cm.MaxRounds)
	}
	if !customAgent.Config.MultiTurnEnabled {
		cm.MaxRounds = 0
		logger.Infof(ctx, "Multi-turn disabled by custom agent, clearing history")
	}

	// FAQ strategy settings
	cm.FAQPriorityEnabled = customAgent.Config.FAQPriorityEnabled
	cm.FAQDirectAnswerThreshold = customAgent.Config.FAQDirectAnswerThreshold
	cm.FAQScoreBoost = customAgent.Config.FAQScoreBoost
	if cm.FAQPriorityEnabled {
		logger.Infof(ctx, "FAQ priority enabled: threshold=%.2f, boost=%.2f",
			cm.FAQDirectAnswerThreshold, cm.FAQScoreBoost)
	}

	// Data-analysis pipeline stage (opt-in, default off).
	cm.DataAnalysisEnabled = customAgent.Config.DataAnalysisEnabled
	if cm.DataAnalysisEnabled {
		logger.Infof(ctx, "Data analysis pipeline stage enabled by custom agent")
	}

	if len(customAgent.Config.IntentPrompts) > 0 {
		cm.IntentPromptOverrides = customAgent.Config.IntentPrompts
		logger.Infof(ctx, "Using custom agent's intent_prompts (%d overrides)", len(cm.IntentPromptOverrides))
	}
}

// restrictMentionsToAgentScope filters user-provided @mention targets (KB IDs
// and knowledge IDs) so that only those within the shared agent's allowed KB
// scope are retained. This prevents users from bypassing the agent's
// KBSelectionMode by injecting arbitrary KB/knowledge IDs into the request.
func (s *sessionService) restrictMentionsToAgentScope(
	ctx context.Context,
	agent *types.CustomAgent,
	sessionTenantID uint64,
	kbIDs []string,
	knowledgeIDs []string,
) ([]string, []string) {
	allowedKBIDs := s.resolveKnowledgeBasesFromAgent(ctx, agent, sessionTenantID)
	if len(allowedKBIDs) == 0 {
		logger.Warnf(ctx, "Shared agent has no allowed KBs, blocking all @mentions")
		return nil, nil
	}

	allowedSet := make(map[string]bool, len(allowedKBIDs))
	for _, id := range allowedKBIDs {
		allowedSet[id] = true
	}

	filteredKBs := make([]string, 0, len(kbIDs))
	for _, id := range kbIDs {
		if allowedSet[id] {
			filteredKBs = append(filteredKBs, id)
		} else {
			logger.Warnf(ctx, "Blocking @mentioned KB %s: not in shared agent's allowed scope", id)
		}
	}

	filteredKnowledge := knowledgeIDs
	if len(knowledgeIDs) > 0 {
		knowledgeList, err := s.knowledgeService.GetKnowledgeBatch(ctx, agent.TenantID, knowledgeIDs)
		if err != nil {
			logger.Warnf(ctx, "Failed to validate knowledge IDs against agent scope: %v, blocking all", err)
			filteredKnowledge = nil
		} else {
			filteredKnowledge = make([]string, 0, len(knowledgeList))
			for _, k := range knowledgeList {
				if k != nil && allowedSet[k.KnowledgeBaseID] {
					filteredKnowledge = append(filteredKnowledge, k.ID)
				} else if k != nil {
					logger.Warnf(ctx, "Blocking @mentioned knowledge %s (KB %s): not in shared agent's allowed scope",
						k.ID, k.KnowledgeBaseID)
				}
			}
		}
	}

	logger.Infof(ctx, "Restricted @mentions to agent scope: kbs %d->%d, knowledge %d->%d",
		len(kbIDs), len(filteredKBs), len(knowledgeIDs), len(filteredKnowledge))

	return filteredKBs, filteredKnowledge
}

// resolveRequestThinking preserves an explicit false request value. A nil
// request inherits the Agent or platform default.
func resolveRequestThinking(request, fallback *bool) *bool {
	if request == nil {
		return fallback
	}
	value := *request
	return &value
}
