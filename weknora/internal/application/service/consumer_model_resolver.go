package service

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	apperrors "github.com/Tencent/WeKnora/internal/errors"
	"github.com/Tencent/WeKnora/internal/types"
	"github.com/Tencent/WeKnora/internal/types/interfaces"
)

// consumerModelResolver owns the fixed consumer scene policy. It only reads
// the existing settings/catalog/entitlement authorities; provider clients and
// persisted user preferences remain outside this module. Chat is retained as
// a hidden runtime compatibility scene, while ConsumerScenes exposes the five
// user-configurable boundaries.
type consumerModelResolver struct {
	repo        interfaces.ModelRepository
	settings    interfaces.SystemSettingService
	entitlement interfaces.EntitlementService
}

// NewConsumerModelResolver wires the server-authoritative consumer model
// resolver. The returned interface deliberately exposes only scene resolve,
// safe options, and the Free generic-gate predicate.
func NewConsumerModelResolver(
	repo interfaces.ModelRepository,
	settings interfaces.SystemSettingService,
	entitlement interfaces.EntitlementService,
) interfaces.ConsumerModelResolver {
	return &consumerModelResolver{repo: repo, settings: settings, entitlement: entitlement}
}

type consumerScenePolicy struct {
	freeID string
	paid   []string
}

func (s *consumerModelResolver) ResolveConsumerModel(
	ctx context.Context,
	scene types.ConsumerScene,
	requestedID string,
) (*types.Model, error) {
	if !scene.Valid() {
		return nil, apperrors.NewBadRequestError("invalid consumer model scene")
	}
	catalog, err := s.catalog(ctx, scene.ModelType())
	if err != nil {
		return nil, err
	}
	policy, valid := s.policy(ctx, scene, catalog)
	if !valid {
		// A partial/invalid pair cannot authorize a stale or paid candidate.
		// Use only the deterministic pre-scene default.
		return s.compatibilityDefault(scene, catalog)
	}

	plan, err := s.effectivePlan(ctx)
	if err != nil {
		return nil, err
	}
	if plan == types.ConsumerPlanFree {
		if strings.TrimSpace(requestedID) != "" && requestedID != policy.freeID {
			return nil, apperrors.NewForbiddenError("this model requires a paid plan")
		}
		model := catalog[policy.freeID]
		if model == nil {
			return s.compatibilityDefault(scene, catalog)
		}
		return model, nil
	}

	requestedID = strings.TrimSpace(requestedID)
	if requestedID != "" {
		for _, candidate := range policy.paid {
			if candidate == requestedID {
				if model := catalog[candidate]; model != nil {
					return model, nil
				}
				break
			}
		}
		return nil, apperrors.NewForbiddenError("this model is not configured for the consumer scene")
	}
	if len(policy.paid) == 0 {
		return s.compatibilityDefault(scene, catalog)
	}
	return catalog[policy.paid[0]], nil
}

func (s *consumerModelResolver) ListConsumerModelOptions(
	ctx context.Context,
	scene types.ConsumerScene,
) ([]*types.ConsumerModelOption, error) {
	if !scene.Valid() {
		return nil, apperrors.NewBadRequestError("invalid consumer model scene")
	}
	catalog, err := s.catalog(ctx, scene.ModelType())
	if err != nil {
		return nil, err
	}
	policy, valid := s.policy(ctx, scene, catalog)
	plan, err := s.effectivePlan(ctx)
	if err != nil {
		return nil, err
	}
	if !valid {
		model, fallbackErr := s.compatibilityDefault(scene, catalog)
		if fallbackErr != nil {
			return nil, fallbackErr
		}
		return []*types.ConsumerModelOption{consumerOption(model, true, false, "free", true, true)}, nil
	}

	if plan == types.ConsumerPlanFree {
		options := make([]*types.ConsumerModelOption, 0, 1+len(policy.paid))
		free := catalog[policy.freeID]
		if free == nil {
			return nil, fmt.Errorf("consumer scene %q free model is unavailable", scene)
		}
		options = append(options, consumerOption(free, true, false, "free", true, true))
		for _, id := range policy.paid {
			if id == policy.freeID {
				continue
			}
			model := catalog[id]
			if model == nil {
				return nil, fmt.Errorf("consumer scene %q paid model is unavailable", scene)
			}
			options = append(options, consumerOption(model, false, true, "paid", false, false))
		}
		return options, nil
	}

	options := make([]*types.ConsumerModelOption, 0, len(policy.paid))
	for idx, id := range policy.paid {
		model := catalog[id]
		if model == nil {
			return nil, fmt.Errorf("consumer scene %q paid model is unavailable", scene)
		}
		options = append(options, consumerOption(model, true, false, "paid", idx == 0, idx == 0))
	}
	return options, nil
}

func consumerOption(model *types.Model, selectable, locked bool, requiredPlan string, sceneDefault, effective bool) *types.ConsumerModelOption {
	displayName := strings.TrimSpace(model.DisplayName)
	if displayName == "" {
		displayName = model.Name
	}
	return &types.ConsumerModelOption{
		ModelID:      model.ID,
		DisplayName:  displayName,
		ModelType:    model.Type,
		Selectable:   selectable,
		Locked:       locked,
		RequiredPlan: requiredPlan,
		SceneDefault: sceneDefault,
		Effective:    effective,
	}
}

func (s *consumerModelResolver) AllowsFreeConsumerModel(ctx context.Context, model *types.Model) (bool, error) {
	if !validConsumerCatalogModel(model) {
		return false, nil
	}
	catalog, err := s.catalog(ctx, model.Type)
	if err != nil {
		return false, err
	}
	if catalog[model.ID] == nil {
		return false, nil
	}
	// ConsumerScenes deliberately omits the hidden Chat compatibility scene;
	// include it here so the generic Free gate still accepts the existing
	// platform chat default and any operator-configured Chat default.
	scenes := append([]types.ConsumerScene{types.ConsumerSceneChat}, types.ConsumerScenes()...)
	for _, scene := range scenes {
		if scene.ModelType() != model.Type {
			continue
		}
		policy, valid := s.policy(ctx, scene, catalog)
		if valid {
			if policy.freeID == model.ID {
				return true, nil
			}
			continue
		}
		// A missing/invalid policy falls back to this deterministic platform
		// default. Keep the generic model gate aligned with that fallback so a
		// Free runtime call cannot reject the resolver's own safe result.
		if model.ID == scene.CompatibilityDefaultID() {
			return true, nil
		}
	}
	return false, nil
}

func (s *consumerModelResolver) effectivePlan(ctx context.Context) (types.ConsumerPlan, error) {
	if plan, ok := effectivePlanFromContext(ctx); ok {
		return plan, nil
	}
	if s.entitlement == nil {
		return types.ConsumerPlanFree, nil
	}
	current, err := s.entitlement.Current(ctx, time.Now().UTC())
	if err != nil {
		return types.ConsumerPlanFree, err
	}
	if current == nil {
		return types.ConsumerPlanFree, nil
	}
	return types.NormalizeConsumerPlan(current.Plan), nil
}

func (s *consumerModelResolver) catalog(ctx context.Context, modelType types.ModelType) (map[string]*types.Model, error) {
	if s.repo == nil {
		return nil, errors.New("consumer model catalog is unavailable")
	}
	if modelType == "" {
		return nil, apperrors.NewBadRequestError("invalid consumer model type")
	}
	tenantID, _ := types.TenantIDFromContext(ctx)
	models, err := s.repo.List(ctx, tenantID, modelType, "")
	if err != nil {
		return nil, err
	}
	catalog := make(map[string]*types.Model, len(models))
	for _, model := range models {
		if validConsumerCatalogModel(model) && model.Type == modelType {
			catalog[model.ID] = model
		}
	}
	return catalog, nil
}

func validConsumerCatalogModel(model *types.Model) bool {
	return IsOpenRouterConsumerModel(model) &&
		model.Type != "" &&
		model.Status == types.ModelStatusActive
}

func (s *consumerModelResolver) policy(
	ctx context.Context,
	scene types.ConsumerScene,
	catalog map[string]*types.Model,
) (consumerScenePolicy, bool) {
	if s.settings == nil {
		return consumerScenePolicy{}, false
	}
	freeRow, err := s.settings.Get(ctx, scene.FreeDefaultKey())
	if err != nil || freeRow == nil {
		return consumerScenePolicy{}, false
	}
	freeID, err := freeRow.AsString()
	if err != nil {
		return consumerScenePolicy{}, false
	}
	freeID = strings.TrimSpace(freeID)
	// Normalize the stale MiMo video-only default for Free users. Keeping this
	// at policy read-time repairs existing settings without a migration.
	if scene == types.ConsumerSceneVision && freeID == legacyMiMoVideoModelID {
		freeID = types.PlatformKnowledgeBaseVLMModelID
	}
	if freeID == "" || catalog[freeID] == nil {
		return consumerScenePolicy{}, false
	}
	paidRow, err := s.settings.Get(ctx, scene.PaidOptionsKey())
	if err != nil || paidRow == nil {
		return consumerScenePolicy{}, false
	}
	paid, err := paidRow.AsStringList()
	if err != nil || len(paid) == 0 {
		return consumerScenePolicy{}, false
	}
	filtered := make([]string, 0, len(paid))
	seen := make(map[string]struct{}, len(paid))
	for idx := range paid {
		id := strings.TrimSpace(paid[idx])
		// Ignore the MiMo entry that the previous video default persisted into
		// the still-image scene.
		if scene == types.ConsumerSceneVision && id == legacyMiMoVideoModelID {
			continue
		}
		if id == "" || catalog[id] == nil {
			return consumerScenePolicy{}, false
		}
		if _, exists := seen[id]; exists {
			return consumerScenePolicy{}, false
		}
		seen[id] = struct{}{}
		filtered = append(filtered, id)
	}
	if len(filtered) == 0 {
		return consumerScenePolicy{}, false
	}
	return consumerScenePolicy{freeID: freeID, paid: filtered}, true
}

func (s *consumerModelResolver) compatibilityDefault(scene types.ConsumerScene, catalog map[string]*types.Model) (*types.Model, error) {
	model := catalog[scene.CompatibilityDefaultID()]
	if model == nil {
		return nil, ErrModelNotFound
	}
	return model, nil
}
