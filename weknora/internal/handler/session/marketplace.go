package session

import (
	"context"
	"encoding/json"
	stderrs "errors"
	"strings"
	"time"

	"github.com/Tencent/WeKnora/internal/errors"
	"github.com/Tencent/WeKnora/internal/types"
)

// resolveMarketplaceRequest reauthorizes every turn before any uploads, model
// calls or SSE work. Tenant identity remains the buyer's; only native retrieval
// receives the reviewed source scope.
func (h *Handler) resolveMarketplaceRequest(
	ctx context.Context,
	req *CreateKnowledgeQARequest,
) (context.Context, *types.CustomAgent, error) {
	req.MarketplaceProductID = strings.TrimSpace(req.MarketplaceProductID)
	if req.MarketplaceProductID == "" {
		return ctx, nil, nil
	}
	if h.marketplaceService == nil {
		return ctx, nil, errors.NewServiceUnavailableError("knowledge service is unavailable")
	}
	buyerID := types.MustTenantIDFromContext(ctx)
	access, err := h.marketplaceService.AuthorizeAccess(ctx, buyerID, req.MarketplaceProductID, time.Now().UTC())
	if err != nil {
		if stderrs.Is(err, types.ErrMarketplaceForbidden) || stderrs.Is(err, types.ErrMarketplaceNotFound) {
			return ctx, nil, errors.NewForbiddenError("此知识服务当前不可用，请返回知识市场查看使用权限或订阅状态")
		}
		return ctx, nil, errors.NewServiceUnavailableError("暂时无法验证使用权限，请稍后重试")
	}
	if access == nil || access.Agent == nil || access.SourceTenantID == 0 || len(access.KnowledgeBaseIDs) == 0 {
		return ctx, nil, errors.NewServiceUnavailableError("knowledge service configuration is unavailable")
	}
	ctx = types.WithMarketplaceScope(ctx, buyerID, access)
	scope, ok := types.MarketplaceScopeFromContext(ctx)
	if !ok {
		return ctx, nil, errors.NewServiceUnavailableError("knowledge service scope is unavailable")
	}
	if (req.AgentID != "" && req.AgentID != access.Agent.ID) || req.AgentSourceTenantID != 0 ||
		len(req.KnowledgeIds) > 0 || len(req.TagIDs) > 0 || len(req.MCPServiceIDs) > 0 || len(req.SkillNames) > 0 {
		return ctx, nil, errors.NewForbiddenError("request is outside the approved service")
	}
	for _, id := range req.KnowledgeBaseIDs {
		if !scope.AllowsKnowledgeBase(id, access.SourceTenantID) {
			return ctx, nil, errors.NewForbiddenError("knowledge base is outside the approved service")
		}
	}
	for _, item := range req.MentionedItems {
		if item.Type != "kb" || !scope.AllowsKnowledgeBase(item.ID, access.SourceTenantID) {
			return ctx, nil, errors.NewForbiddenError("mention is outside the approved service")
		}
	}
	// The saved config is an approved snapshot, not the creator's live draft.
	// Deep-copy it so request overrides cannot modify subsequent conversations.
	encoded, err := json.Marshal(access.Agent)
	if err != nil {
		return ctx, nil, errors.NewInternalServerError("invalid knowledge service configuration")
	}
	var agent types.CustomAgent
	if err := json.Unmarshal(encoded, &agent); err != nil {
		return ctx, nil, errors.NewInternalServerError("invalid knowledge service configuration")
	}
	agent.Config.KBSelectionMode = "selected"
	agent.Config.KnowledgeBases = append([]string(nil), access.KnowledgeBaseIDs...)
	agent.Config.RetrieveKBOnlyWhenMentioned = false
	agent.Config.MCPSelectionMode, agent.Config.SkillsSelectionMode = "none", "none"
	agent.Config.MCPServices, agent.Config.SelectedSkills = nil, nil
	agent.Config.SandboxConfigID = ""
	// Native personal memory remains separate from a purchased persona. No
	// creator memories or source-account connector credentials are borrowed.
	disabled := false
	agent.Config.MemoryEnabled = &disabled
	agent.Config.QuestionSuggestions = nil
	req.SummaryModelID = strings.TrimSpace(req.SummaryModelID)
	if req.SummaryModelID == "" {
		req.SummaryModelID = types.MarketplaceDefaultModelID
	}
	// Flash is a default, not a model lock. Keep the request-local answer,
	// query-understanding and title bindings aligned; native ModelService still
	// validates the selected model against the buyer's membership and catalog.
	agent.Config.ModelID = req.SummaryModelID
	agent.Config.QueryUnderstandModelID = req.SummaryModelID
	req.AgentID = agent.ID
	req.AgentEnabled = agent.IsAgentMode()
	req.KnowledgeBaseIDs = append([]string(nil), access.KnowledgeBaseIDs...)
	return ctx, &agent, nil
}
