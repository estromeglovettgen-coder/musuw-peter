package service

import (
	"context"
	"errors"
	"strings"
	"time"

	apperrors "github.com/Tencent/WeKnora/internal/errors"
	"github.com/Tencent/WeKnora/internal/models/provider"
	"github.com/Tencent/WeKnora/internal/types"
)

var errLiteModelEntitlementUnavailable = errors.New("lite model entitlement service is unavailable")

func effectivePlanFromContext(ctx context.Context) (types.ConsumerPlan, bool) {
	tenant, ok := types.TenantInfoFromContext(ctx)
	if !ok || tenant == nil || tenant.Plan == "" {
		return types.ConsumerPlanFree, false
	}
	return types.EffectiveConsumerPlanAt(tenant, time.Now().UTC()), true
}

func effectiveStorageQuota(tenant *types.Tenant, at time.Time) int64 {
	return types.EffectiveStorageQuotaAt(tenant, at)
}

func (s *knowledgeBaseService) checkCreateKnowledgeBaseEntitlement(ctx context.Context) error {
	plan, ok := effectivePlanFromContext(ctx)
	if !ok {
		return nil
	}
	limits := types.LimitsForConsumerPlan(plan)
	if limits.MaxKnowledgeBases == 0 {
		return nil
	}
	tenantID := types.MustTenantIDFromContext(ctx)
	rows, err := s.repo.ListKnowledgeBasesByTenantID(ctx, tenantID)
	if err != nil {
		return err
	}
	if int64(len(rows)) >= limits.MaxKnowledgeBases {
		return apperrors.NewForbiddenError("Free plan supports one knowledge base; upgrade to create another")
	}
	return nil
}

func (s *knowledgeService) checkCreateKnowledgeEntitlement(ctx context.Context, kbID, fileType string, fileBytes int64) error {
	tenant, ok := types.TenantInfoFromContext(ctx)
	if !ok || tenant == nil || tenant.Plan == "" {
		return nil
	}
	plan := types.EffectiveConsumerPlanAt(tenant, time.Now().UTC())
	limits := types.LimitsForConsumerPlan(plan)
	if IsVideoType(fileType) && !limits.VideoUpload {
		return apperrors.NewForbiddenError("Free plan does not support video upload")
	}
	if limits.MaxDocumentsPerKB > 0 {
		count, err := s.repo.CountKnowledgeByKnowledgeBaseID(ctx, tenant.ID, kbID)
		if err != nil {
			return err
		}
		if count >= limits.MaxDocumentsPerKB {
			return apperrors.NewForbiddenError("Free plan supports ten documents per knowledge base; upgrade to add more")
		}
	}
	// OpenRouter's provider-managed key is the monthly spend authority. Request
	// byte size is not a reliable price oracle for parser/model calls, so the
	// product no longer rejects uploads using a local file-cost estimate.
	_ = fileBytes
	return nil
}

// IsOpenRouterConsumerModel is the shared runtime invariant for models
// reachable from a Lite consumer request. Provider alone is not sufficient:
// Model.Source controls the factory branch ("local" would instantiate Ollama
// even when Parameters.Provider says "openrouter"), and a platform builtin
// with a modified BaseURL could otherwise send the tenant child key to an
// arbitrary OpenAI-compatible endpoint. Both fields are therefore required;
// accepting an empty BaseURL would let OpenAI-compatible factories silently
// fall back to api.openai.com, bypassing the OpenRouter allowance.
func IsOpenRouterConsumerModel(model *types.Model) bool {
	if model == nil || !model.IsBuiltin ||
		model.Parameters.Provider != string(provider.ProviderOpenRouter) {
		return false
	}
	if model.Source != types.ModelSourceRemote {
		return false
	}
	if baseURL := strings.TrimRight(model.Parameters.BaseURL, "/"); baseURL != strings.TrimRight(provider.OpenRouterBaseURL, "/") {
		return false
	}
	return true
}

func (s *modelService) consumerPlanAllowsModel(ctx context.Context, model *types.Model) (bool, error) {
	// SystemAdmin maintains the shared platform model catalog and therefore
	// bypasses consumer restrictions.
	if types.IsSystemAdminFromContext(ctx) {
		return true, nil
	}

	// Lite consumers never own arbitrary model infrastructure. Regardless of
	// paid plan, runtime inference must resolve to a platform builtin model that
	// is routed through OpenRouter. Standard WeKnora keeps its existing model
	// authority and does not enter the consumer scene policy.
	if !isLiteProductEdition() {
		// Preserve the existing nil-row guard used by ListModels while leaving
		// all non-nil Standard model authorities untouched.
		return model != nil, nil
	}
	if !IsOpenRouterConsumerModel(model) {
		return false, nil
	}
	// The entitlement service is also the OpenRouter Meter injected into every
	// native model factory. Allowing a Lite model without it would fall back to
	// the catalog credential and bypass the tenant child-key allowance.
	if s.entitlement == nil {
		return false, errLiteModelEntitlementUnavailable
	}

	plan, ok := effectivePlanFromContext(ctx)
	if ok {
		if plan == types.ConsumerPlanFree && model != nil && model.Type != types.ModelTypeEmbedding && s.consumerResolver != nil {
			return s.consumerResolver.AllowsFreeConsumerModel(ctx, model)
		}
		return types.ConsumerPlanAllowsModel(plan, model), nil
	}
	current, err := s.entitlement.Current(ctx, time.Now())
	if err != nil {
		return false, err
	}
	plan = types.NormalizeConsumerPlan(current.Plan)
	if plan == types.ConsumerPlanFree && model != nil && model.Type != types.ModelTypeEmbedding && s.consumerResolver != nil {
		return s.consumerResolver.AllowsFreeConsumerModel(ctx, model)
	}
	return types.ConsumerPlanAllowsModel(plan, model), nil
}
