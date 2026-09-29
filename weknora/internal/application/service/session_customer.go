package service

import (
	"context"
	apperrors "github.com/Tencent/WeKnora/internal/errors"
	"github.com/Tencent/WeKnora/internal/types"
)

// Customer binding is authoritative even if an agent is configured for all KBs.
// Shared methodology KBs are references, never copies of another customer's data.
func (s *sessionService) resolveCustomerKnowledge(ctx context.Context, req *types.QARequest) ([]string, []string, error) {
	id := req.Session.CustomerKnowledgeBaseID
	kb, err := s.knowledgeBaseService.GetKnowledgeBaseByID(ctx, id)
	if err != nil || kb == nil || kb.CustomerProfile == nil || kb.TenantID != req.Session.TenantID {
		return nil, nil, apperrors.NewNotFoundError("Customer not found")
	}
	ids := []string{id}
	allowed := map[string]bool{id: true}
	candidates := append([]string{}, kb.CustomerProfile.SharedKnowledgeBaseIDs...)
	if req.CustomAgent != nil {
		candidates = append(candidates, req.CustomAgent.Config.KnowledgeBases...)
	}
	for _, sharedID := range candidates {
		if allowed[sharedID] {
			continue
		}
		shared, e := s.knowledgeBaseService.GetKnowledgeBaseByID(ctx, sharedID)
		if e == nil && shared != nil && shared.CustomerProfile == nil && !shared.IsTemporary && shared.TenantID == req.Session.TenantID {
			allowed[sharedID] = true
			ids = append(ids, sharedID)
		}
	}
	for _, requestedID := range req.KnowledgeBaseIDs {
		if !allowed[requestedID] {
			return nil, nil, apperrors.NewBadRequestError("此会话已绑定客户，请切换客户会话或先关联公共知识库")
		}
	}
	for _, scope := range req.TagScopes {
		if !allowed[scope.KnowledgeBaseID] {
			return nil, nil, apperrors.NewForbiddenError("标签不属于当前客户资料范围")
		}
	}
	for _, docID := range req.KnowledgeIDs {
		doc, e := s.knowledgeService.GetKnowledgeByID(ctx, docID)
		if e != nil || doc == nil || !allowed[doc.KnowledgeBaseID] {
			return nil, nil, apperrors.NewForbiddenError("文档不属于当前客户资料范围")
		}
	}
	if err := types.AuthorizeTenantAPIKeyKnowledgeTargets(ctx, ids, req.KnowledgeIDs); err != nil {
		return nil, nil, err
	}
	return ids, req.KnowledgeIDs, nil
}
