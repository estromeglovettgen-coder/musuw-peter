package service

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"
	"sort"
	"strings"
	"time"

	apprepo "github.com/Tencent/WeKnora/internal/application/repository"
	"github.com/Tencent/WeKnora/internal/application/service/retriever"
	"github.com/Tencent/WeKnora/internal/datasource"
	apperrors "github.com/Tencent/WeKnora/internal/errors"
	"github.com/Tencent/WeKnora/internal/logger"
	"github.com/Tencent/WeKnora/internal/storageallowlist"
	"github.com/Tencent/WeKnora/internal/storageurl"
	"github.com/Tencent/WeKnora/internal/tracing/langfuse"
	"github.com/Tencent/WeKnora/internal/types"
	"github.com/Tencent/WeKnora/internal/types/interfaces"
	secutils "github.com/Tencent/WeKnora/internal/utils"
	"github.com/google/uuid"
	"github.com/hibiken/asynq"
)

// ErrInvalidTenantID represents an error for invalid tenant ID
var ErrInvalidTenantID = errors.New("invalid tenant ID")

const kbTaskCleanupTimeout = 5 * time.Second

// knowledgeBaseService implements the knowledge base service interface
type knowledgeBaseService struct {
	repo                  interfaces.KnowledgeBaseRepository
	kgRepo                interfaces.KnowledgeRepository
	chunkRepo             interfaces.ChunkRepository
	shareRepo             interfaces.KBShareRepository
	kbShareService        interfaces.KBShareService
	modelService          interfaces.ModelService
	retrieveEngine        interfaces.RetrieveEngineRegistry
	ownership             retriever.TenantStoreOwnership
	tenantRepo            interfaces.TenantRepository
	fileSvc               interfaces.FileService
	storageResolver       interfaces.StorageBackendResolver
	graphEngine           interfaces.RetrieveGraphRepository
	asynqClient           interfaces.TaskEnqueuer
	taskInspector         interfaces.TaskInspector
	taskPendingRepo       interfaces.TaskPendingOpsRepository
	dsRepo                interfaces.DataSourceRepository
	syncLogRepo           interfaces.SyncLogRepository
	dsScheduler           *datasource.Scheduler
	audit                 interfaces.AuditLogService
	consumerModelResolver interfaces.ConsumerModelResolver
	resourceCatalog       interfaces.ResourceCatalog
}

// NewKnowledgeBaseService creates a new knowledge base service
func NewKnowledgeBaseService(repo interfaces.KnowledgeBaseRepository,
	kgRepo interfaces.KnowledgeRepository,
	chunkRepo interfaces.ChunkRepository,
	shareRepo interfaces.KBShareRepository,
	kbShareService interfaces.KBShareService,
	modelService interfaces.ModelService,
	retrieveEngine interfaces.RetrieveEngineRegistry,
	ownership retriever.TenantStoreOwnership,
	tenantRepo interfaces.TenantRepository,
	fileSvc interfaces.FileService,
	storageResolver interfaces.StorageBackendResolver,
	graphEngine interfaces.RetrieveGraphRepository,
	asynqClient interfaces.TaskEnqueuer,
	taskInspector interfaces.TaskInspector,
	taskPendingRepo interfaces.TaskPendingOpsRepository,
	dsRepo interfaces.DataSourceRepository,
	syncLogRepo interfaces.SyncLogRepository,
	dsScheduler *datasource.Scheduler,
	audit interfaces.AuditLogService,
	consumerModelResolver interfaces.ConsumerModelResolver,
	resourceCatalog interfaces.ResourceCatalog,
) interfaces.KnowledgeBaseService {
	return &knowledgeBaseService{
		repo:                  repo,
		kgRepo:                kgRepo,
		chunkRepo:             chunkRepo,
		shareRepo:             shareRepo,
		kbShareService:        kbShareService,
		modelService:          modelService,
		retrieveEngine:        retrieveEngine,
		ownership:             ownership,
		tenantRepo:            tenantRepo,
		fileSvc:               fileSvc,
		storageResolver:       storageResolver,
		graphEngine:           graphEngine,
		asynqClient:           asynqClient,
		taskInspector:         taskInspector,
		taskPendingRepo:       taskPendingRepo,
		dsRepo:                dsRepo,
		syncLogRepo:           syncLogRepo,
		dsScheduler:           dsScheduler,
		audit:                 audit,
		consumerModelResolver: consumerModelResolver,
		resourceCatalog:       resourceCatalog,
	}
}

// GetRepository gets the knowledge base repository
// Parameters:
//   - ctx: Context with authentication and request information
//
// Returns:
//   - interfaces.KnowledgeBaseRepository: Knowledge base repository
func (s *knowledgeBaseService) GetRepository() interfaces.KnowledgeBaseRepository {
	return s.repo
}

// CreateKnowledgeBase creates a new knowledge base.
//
// When VectorStoreID is set, the binding is validated against the caller's
// tenant scope and the engine registry before persisting. A nil or
// empty-string VectorStoreID is normalized to nil ("use the tenant's
// effective engines") to match the retrieve-engine factory's pre-condition.
func (s *knowledgeBaseService) CreateKnowledgeBase(ctx context.Context,
	kb *types.KnowledgeBase,
) (*types.KnowledgeBase, error) {
	if err := rejectLiteFAQKnowledgeBase(kb); err != nil {
		return nil, err
	}
	if err := s.checkCreateKnowledgeBaseEntitlement(ctx); err != nil {
		return nil, err
	}
	// Generate UUID and set creation timestamps
	if kb.ID == "" {
		kb.ID = uuid.New().String()
	}
	kb.CreatedAt = time.Now()
	kb.TenantID = types.MustTenantIDFromContext(ctx)
	kb.UpdatedAt = time.Now()
	// Record the creator so RBAC's RequireOwnershipOrRole can let
	// Contributors edit their own KBs without granting them tenant-wide
	// edit rights. The X-API-Key auth path attaches a synthetic
	// `system-<tenantID>` user; we deliberately skip those so the KB
	// stays tenant-owned (CreatorID == ""), which matches the original
	// API-key semantics (any human Admin can manage it) and prevents a
	// later "list KBs by creator" feature from surfacing rows nobody can
	// re-attribute.
	if uid, ok := types.UserIDFromContext(ctx); ok && !types.IsSyntheticUserID(uid) {
		kb.CreatorID = uid
	}
	consumerCandidates := requestedConsumerModels(kb)
	kb.ApplyPlatformKnowledgeBaseDefaults()
	// Lite exposes only RAG and Wiki as selectable document-library
	// strategies. Graph is an intentionally hidden platform default, so a
	// graph-only request would create a library that accepts and parses files
	// but cannot serve the visible RAG/Wiki product contract. Keep Standard's
	// native graph-only capability unchanged.
	if isLiteProductEdition() && kb.Type == types.KnowledgeBaseTypeDocument &&
		!kb.IndexingStrategy.VectorEnabled && !kb.IndexingStrategy.KeywordEnabled &&
		!kb.IndexingStrategy.WikiEnabled {
		return nil, apperrors.NewBadRequestError("at least one visible indexing strategy (RAG or Wiki) must be enabled")
	}
	kb.EnsureDefaults()
	enforceLiteAutoTagConfig(kb)
	if err := s.applyConsumerKnowledgeBaseModels(ctx, kb, consumerCandidates); err != nil {
		return nil, err
	}
	if err := s.ensurePlatformKnowledgeBaseModels(ctx, kb); err != nil {
		return nil, err
	}
	applyTenantDefaultStorageProvider(ctx, kb)
	if err := s.applyAndValidateStorageBackend(ctx, kb); err != nil {
		return nil, err
	}

	// Fold empty-string vector_store_id into nil so this path and the
	// retrieve-engine factory's pre-condition share a single representation.
	wasEmpty := kb.VectorStoreID != nil && *kb.VectorStoreID == ""
	kb.Normalize()
	if wasEmpty {
		logger.Debugf(ctx,
			"[kb.create] empty vector_store_id normalized to nil for tenant=%d",
			kb.TenantID)
	}

	if kb.HasVectorStore() {
		if err := s.validateVectorStoreBinding(ctx, kb.TenantID, *kb.VectorStoreID); err != nil {
			return nil, err
		}
	}

	logger.Infof(ctx, "Creating knowledge base, ID: %s, tenant ID: %d, name: %s", kb.ID, kb.TenantID, kb.Name)

	if err := s.repo.CreateKnowledgeBase(ctx, kb); err != nil {
		logger.ErrorWithFields(ctx, err, map[string]interface{}{
			"knowledge_base_id": kb.ID,
			"tenant_id":         kb.TenantID,
		})
		return nil, err
	}
	recordKBActivity(ctx, s.audit, kb.TenantID, kb.ID, types.AuditActionKBCreated,
		"knowledge_base", kb.ID, types.AuditOutcomeSuccess, map[string]any{
			"name": kb.Name, "type": kb.Type,
		})

	logger.Infof(ctx, "Knowledge base created successfully, ID: %s, name: %s", kb.ID, kb.Name)
	return kb, nil
}

func rejectLiteFAQKnowledgeBase(kb *types.KnowledgeBase) error {
	if isLiteProductEdition() && kb != nil {
		kbType := strings.TrimSpace(kb.Type)
		// Empty type is the legacy document default and is normalized by
		// ApplyPlatformKnowledgeBaseDefaults. Every explicit non-document type
		// (FAQ, Wiki, or an unknown future value) is outside Lite's create/copy
		// contract and must fail before entitlement/model/storage side effects.
		if kbType != "" && kbType != types.KnowledgeBaseTypeDocument {
			return apperrors.NewBadRequestError("only document knowledge bases are available in Lite")
		}
	}
	return nil
}

func enforceLiteAutoTagConfig(kb *types.KnowledgeBase) {
	if !isLiteProductEdition() || kb == nil || kb.Type != types.KnowledgeBaseTypeDocument || kb.AutoTagConfig == nil {
		return
	}
	kb.AutoTagConfig.ModelID = types.CheapestChatModelID
	kb.AutoTagConfig.MaxTags = types.DefaultAutoTagMaxTags
	skip := true
	kb.AutoTagConfig.SkipIfTagged = &skip
	kb.AutoTagConfig.Normalize()
}

func filterLiteKnowledgeBases(kbs []*types.KnowledgeBase) []*types.KnowledgeBase {
	if !isLiteProductEdition() {
		return kbs
	}
	filtered := make([]*types.KnowledgeBase, 0, len(kbs))
	for _, kb := range kbs {
		if !isLiteKnowledgeBaseVisible(kb) {
			continue
		}
		filtered = append(filtered, kb)
	}
	return filtered
}

// isLiteKnowledgeBaseVisible is the single service-level visibility rule for
// knowledge bases returned to Musuw Lite consumers. FAQ rows can remain in
// storage for Standard/legacy compatibility, but they must not be surfaced by
// any list path (including cross-tenant shared KB lists).
func isLiteKnowledgeBaseVisible(kb *types.KnowledgeBase) bool {
	if kb == nil {
		return false
	}
	return !isLiteProductEdition() || kb.Type != types.KnowledgeBaseTypeFAQ
}

// consumerKnowledgeBaseModels captures only the model candidates supplied by
// a new-KB request. Embedding is intentionally absent: vector identity remains
// platform/KB-owned and is always filled by ApplyPlatformKnowledgeBaseDefaults.
type consumerKnowledgeBaseModels struct {
	rag    string
	wiki   string
	vision string
	asr    string
}

func requestedConsumerModels(kb *types.KnowledgeBase) consumerKnowledgeBaseModels {
	if kb == nil {
		return consumerKnowledgeBaseModels{}
	}
	models := consumerKnowledgeBaseModels{
		rag: strings.TrimSpace(kb.SummaryModelID),
		asr: strings.TrimSpace(kb.ASRConfig.ModelID),
	}
	if kb.WikiConfig != nil {
		models.wiki = strings.TrimSpace(kb.WikiConfig.SynthesisModelID)
	}
	// The editor historically sent the same vision ID in both fields. Prefer
	// VLMConfig (the runtime source of truth) and accept the image-processing
	// field for compatibility with older clients.
	models.vision = strings.TrimSpace(kb.VLMConfig.ModelID)
	if models.vision == "" {
		models.vision = strings.TrimSpace(kb.ImageProcessingConfig.ModelID)
	}
	return models
}

// applyConsumerKnowledgeBaseModels resolves the four model candidates that a
// new knowledge base may carry. Existing model resolver/entitlement rules are
// the only authorization authority. A nil resolver keeps direct legacy/test
// construction on the platform defaults; production wiring always supplies
// the resolver from the container.
func (s *knowledgeBaseService) applyConsumerKnowledgeBaseModels(
	ctx context.Context,
	kb *types.KnowledgeBase,
	candidates consumerKnowledgeBaseModels,
) error {
	// Consumer scene bindings are a Lite product surface. Standard WeKnora
	// callers (including evaluation, web-search compression, and other
	// internal KB creation paths) retain the existing platform/agent model
	// authority even though the shared container wires the resolver globally.
	if s.consumerModelResolver == nil || !isLiteProductEdition() || kb == nil || kb.IsTemporary {
		return nil
	}

	// RAG answer generation and the optional Wiki synthesis stage are the only
	// text-model bindings persisted on a new document KB. A standalone Chat
	// model is never accepted here.
	if kb.Type == types.KnowledgeBaseTypeDocument {
		rag, err := s.resolveNewKnowledgeBaseModel(ctx, types.ConsumerSceneRAG, candidates.rag)
		if err != nil {
			return err
		}
		kb.SummaryModelID = rag.ID
	}

	if kb.Type == types.KnowledgeBaseTypeDocument || kb.Type == types.KnowledgeBaseTypeWiki {
		wiki, err := s.resolveNewKnowledgeBaseModel(ctx, types.ConsumerSceneWiki, candidates.wiki)
		if err != nil {
			return err
		}
		if kb.WikiConfig == nil {
			kb.WikiConfig = &types.WikiConfig{}
		}
		kb.WikiConfig.SynthesisModelID = wiki.ID
	}

	if kb.Type == types.KnowledgeBaseTypeDocument {
		vision, err := s.resolveNewKnowledgeBaseModel(ctx, types.ConsumerSceneVision, candidates.vision)
		if err != nil {
			return err
		}
		kb.ImageProcessingConfig.ModelID = vision.ID
		kb.VLMConfig.ModelID = vision.ID

		asr, err := s.resolveNewKnowledgeBaseModel(ctx, types.ConsumerSceneASR, candidates.asr)
		if err != nil {
			return err
		}
		kb.ASRConfig.ModelID = asr.ID
	}
	return nil
}

func (s *knowledgeBaseService) resolveNewKnowledgeBaseModel(
	ctx context.Context,
	scene types.ConsumerScene,
	candidate string,
) (*types.Model, error) {
	model, err := s.consumerModelResolver.ResolveConsumerModel(ctx, scene, strings.TrimSpace(candidate))
	if err != nil {
		return nil, fmt.Errorf("resolve %s consumer model: %w", scene, err)
	}
	if model == nil || strings.TrimSpace(model.ID) == "" {
		return nil, fmt.Errorf("resolve %s consumer model: resolved no model", scene)
	}
	if model.Type != scene.ModelType() {
		return nil, fmt.Errorf("resolve %s consumer model: model type mismatch", scene)
	}
	return model, nil
}

// ensurePlatformKnowledgeBaseModels prevents a name-only create from
// persisting a knowledge base that cannot ingest or answer documents. The
// browser never chooses these models: their IDs are platform-owned defaults,
// so a missing or stale catalog is a temporary platform readiness failure.
func (s *knowledgeBaseService) ensurePlatformKnowledgeBaseModels(ctx context.Context, kb *types.KnowledgeBase) error {
	if kb == nil || kb.Type != types.KnowledgeBaseTypeDocument {
		return nil
	}
	if s.modelService == nil {
		return apperrors.NewServiceUnavailableError("knowledge base setup is temporarily unavailable")
	}

	requirements := []struct {
		id        string
		modelType types.ModelType
	}{
		{types.PlatformKnowledgeBaseEmbeddingModelID, types.ModelTypeEmbedding},
	}
	// When the consumer resolver is wired, RAG/Wiki/VLLM/ASR IDs have already
	// been checked against their typed catalog and current plan above. Do not
	// probe the legacy fixed IDs through ModelService here: a valid Free policy
	// may intentionally choose a different model, and GetModelByID enforces the
	// same plan gate. The platform-owned embedding identity remains immutable
	// and must still be present for vector indexing.
	if s.consumerModelResolver == nil || !isLiteProductEdition() {
		requirements = append([]struct {
			id        string
			modelType types.ModelType
		}{
			{types.PlatformKnowledgeBaseChatModelID, types.ModelTypeKnowledgeQA},
			{types.PlatformKnowledgeBaseVLMModelID, types.ModelTypeVLLM},
			{types.PlatformKnowledgeBaseASRModelID, types.ModelTypeASR},
		}, requirements...)
	}

	for _, requirement := range requirements {
		model, err := s.modelService.GetModelByID(ctx, requirement.id)
		if err != nil || model == nil || model.ID != requirement.id ||
			model.Type != requirement.modelType || !model.IsBuiltin ||
			model.Status != types.ModelStatusActive {
			logger.Warnf(ctx, "Platform knowledge-base model is unavailable: id=%s type=%s err=%v",
				requirement.id, requirement.modelType, err)
			return apperrors.NewServiceUnavailableError("knowledge base setup is temporarily unavailable")
		}
	}

	return nil
}

func (s *knowledgeBaseService) applyAndValidateStorageBackend(ctx context.Context, kb *types.KnowledgeBase) error {
	if s.storageResolver == nil || kb == nil {
		return nil
	}
	tenant, _ := types.TenantInfoFromContext(ctx)
	if tenant == nil {
		return apperrors.NewBadRequestError("workspace context missing")
	}
	id := ""
	if kb.StorageBackendID != nil {
		id = strings.TrimSpace(*kb.StorageBackendID)
	}
	provider := kb.GetStorageProvider()
	// A newly created KB without an explicit instance follows the concrete
	// tenant default. The legacy provider is only a fallback for workspaces
	// that have not been migrated yet.
	if id == "" && tenant.DefaultStorageBackendID != nil && strings.TrimSpace(*tenant.DefaultStorageBackendID) != "" {
		provider = ""
	}
	backend, err := s.storageResolver.ResolveBackend(ctx, tenant, id, provider)
	if err != nil {
		return apperrors.NewBadRequestError("storage backend is unavailable").WithDetails(err.Error())
	}
	if backend == nil {
		return nil
	}
	kb.StorageBackendID = &backend.ID
	kb.SetStorageProvider(backend.Provider)
	return nil
}

// applyTenantDefaultStorageProvider fills an empty KB storage provider from the
// tenant's global default (Settings → Storage engine). Frontend should send the
// same value; this keeps API clients and legacy UIs consistent.
func applyTenantDefaultStorageProvider(ctx context.Context, kb *types.KnowledgeBase) {
	if kb == nil || strings.TrimSpace(kb.GetStorageProvider()) != "" {
		return
	}
	tenant, _ := ctx.Value(types.TenantInfoContextKey).(*types.Tenant)
	provider := ""
	if tenant != nil && tenant.StorageEngineConfig != nil {
		provider = strings.ToLower(strings.TrimSpace(tenant.StorageEngineConfig.DefaultProvider))
	}
	if provider == "" || !storageallowlist.IsAllowed(provider) {
		provider = storageallowlist.FirstAllowed()
	}
	if provider == "" {
		return
	}
	kb.SetStorageProvider(provider)
}

// validateVectorStoreBinding routes through retriever.VerifyBinding so the
// ownership + registry sentinel hierarchy stays the single source of truth.
// The service layer's responsibility is to:
//
//  1. fast-reject malformed UUIDs (cheap pre-flight that also avoids a DB
//     round trip for type-confusion inputs like "' OR 1=1 --"),
//  2. translate retriever sentinels into user-facing AppErrors with
//     generic messages and the typed error codes.
//
// UUID parse failures map to the same "vector store not found" message as
// cross-tenant attempts to avoid an enumeration oracle that distinguishes
// "malformed input" from "non-existent UUID".
func (s *knowledgeBaseService) validateVectorStoreBinding(
	ctx context.Context, tenantID uint64, storeID string,
) error {
	sanitized := secutils.SanitizeForLog(storeID)

	if _, err := uuid.Parse(storeID); err != nil {
		logger.WarnWithFields(ctx, logger.Fields{
			"tenant_id": tenantID,
			"store_id":  sanitized,
			"reason":    "malformed vector_store_id",
		}, "[kb.create] vector store id is not a valid UUID")
		return apperrors.NewVectorStoreBindingInvalidError("vector store not found")
	}

	switch err := retriever.VerifyBinding(
		ctx, s.retrieveEngine, s.ownership, tenantID, storeID,
	); {
	case err == nil:
		return nil
	case errors.Is(err, retriever.ErrVectorStoreForbidden):
		logger.WarnWithFields(ctx, logger.Fields{
			"tenant_id": tenantID,
			"store_id":  sanitized,
			"reason":    "cross-tenant or unknown store",
		}, "[kb.create] vector store not owned by tenant")
		return apperrors.NewVectorStoreBindingInvalidError("vector store not found")
	case errors.Is(err, retriever.ErrVectorStoreNotFound),
		errors.Is(err, retriever.ErrVectorStoreUnavailable):
		logger.WarnWithFields(ctx, logger.Fields{
			"tenant_id": tenantID,
			"store_id":  sanitized,
			"reason":    "store recorded in DB but no engine could be resolved",
		}, "[kb.create] vector store currently unavailable")
		return apperrors.NewVectorStoreUnavailableError(
			"vector store is currently unavailable; check its connection configuration")
	case errors.Is(err, context.Canceled), errors.Is(err, context.DeadlineExceeded):
		// The caller went away or ran out of time while the binding was being
		// verified, which can now include rebuilding the store's engine. That
		// is not a server fault, so it must not be logged and answered as one.
		return err
	default:
		logger.ErrorWithFields(ctx, err, map[string]interface{}{
			"tenant_id": tenantID,
			"store_id":  sanitized,
			"reason":    "binding verification failed",
		})
		return apperrors.NewInternalServerError("failed to verify vector store binding")
	}
}

// GetKnowledgeBaseByID retrieves a knowledge base by its ID
func (s *knowledgeBaseService) GetKnowledgeBaseByID(ctx context.Context, id string) (*types.KnowledgeBase, error) {
	if id == "" {
		logger.Error(ctx, "Knowledge base ID is empty")
		return nil, errors.New("knowledge base ID cannot be empty")
	}

	kb, err := s.repo.GetKnowledgeBaseByID(ctx, id)
	if err != nil {
		logger.ErrorWithFields(ctx, err, map[string]interface{}{
			"knowledge_base_id": id,
		})
		return nil, err
	}
	if kb == nil || !isLiteKnowledgeBaseVisible(kb) {
		// FAQ rows are retained for migration/audit compatibility, but they are
		// not consumer resources in Lite. Use the repository's normal not-found
		// sentinel so every KB-scoped route (including shared/pin/activity paths)
		// treats a legacy FAQ UUID exactly like a missing row.
		return nil, apprepo.ErrKnowledgeBaseNotFound
	}

	kb.EnsureDefaults()
	return kb, nil
}

// GetKnowledgeBaseByIDOnly retrieves knowledge base by ID without tenant filter
// Used for cross-tenant shared KB access where permission is checked elsewhere
func (s *knowledgeBaseService) GetKnowledgeBaseByIDOnly(ctx context.Context, id string) (*types.KnowledgeBase, error) {
	if id == "" {
		logger.Error(ctx, "Knowledge base ID is empty")
		return nil, errors.New("knowledge base ID cannot be empty")
	}

	kb, err := s.repo.GetKnowledgeBaseByID(ctx, id)
	if err != nil {
		logger.ErrorWithFields(ctx, err, map[string]interface{}{
			"knowledge_base_id": id,
		})
		return nil, err
	}
	if kb == nil || !isLiteKnowledgeBaseVisible(kb) {
		return nil, apprepo.ErrKnowledgeBaseNotFound
	}

	kb.EnsureDefaults()
	return kb, nil
}

// GetKnowledgeBasesByIDsOnly retrieves knowledge bases by IDs without tenant filter (batch).
func (s *knowledgeBaseService) GetKnowledgeBasesByIDsOnly(ctx context.Context, ids []string) ([]*types.KnowledgeBase, error) {
	if len(ids) == 0 {
		return nil, nil
	}
	kbs, err := s.repo.GetKnowledgeBaseByIDs(ctx, ids)
	if err != nil {
		return nil, err
	}
	kbs = filterLiteKnowledgeBases(kbs)
	for _, kb := range kbs {
		if kb != nil {
			kb.EnsureDefaults()
		}
	}
	return kbs, nil
}

// ListKnowledgeBases returns all knowledge bases for a tenant
func (s *knowledgeBaseService) ListKnowledgeBases(ctx context.Context) ([]*types.KnowledgeBase, error) {
	tenantID := types.MustTenantIDFromContext(ctx)

	kbs, err := s.repo.ListKnowledgeBasesByTenantID(ctx, tenantID)
	if err != nil {
		for _, kb := range kbs {
			kb.EnsureDefaults()
		}

		logger.ErrorWithFields(ctx, err, map[string]interface{}{
			"tenant_id": tenantID,
		})
		return nil, err
	}
	kbs = filterLiteKnowledgeBases(kbs)

	// Query knowledge count and chunk count for each knowledge base
	for _, kb := range kbs {
		kb.EnsureDefaults()

		// Get knowledge count
		switch kb.Type {
		case types.KnowledgeBaseTypeDocument:
			knowledgeCount, err := s.kgRepo.CountKnowledgeByKnowledgeBaseID(ctx, tenantID, kb.ID)
			if err != nil {
				logger.Warnf(ctx, "Failed to get knowledge count for knowledge base %s: %v", kb.ID, err)
			} else {
				kb.KnowledgeCount = knowledgeCount
			}
		case types.KnowledgeBaseTypeFAQ:
			// Get chunk count
			chunkCount, err := s.chunkRepo.CountChunksByKnowledgeBaseID(ctx, tenantID, kb.ID)
			if err != nil {
				logger.Warnf(ctx, "Failed to get chunk count for knowledge base %s: %v", kb.ID, err)
			} else {
				kb.ChunkCount = chunkCount
			}
		}

		// Check if there is a processing import task
		processingCount, err := s.kgRepo.CountKnowledgeByStatus(
			ctx,
			tenantID,
			kb.ID,
			[]string{"pending", "processing"},
		)
		if err != nil {
			logger.Warnf(ctx, "Failed to check processing status for knowledge base %s: %v", kb.ID, err)
		} else {
			kb.IsProcessing = processingCount > 0
			kb.ProcessingCount = processingCount
		}
	}

	// Per-user pin stamping + ordering. The "main" list view is the
	// only path that needs to honour the caller's personal pin set;
	// agent/share/IM callers go through ListKnowledgeBasesByTenantID
	// which also enriches but keys off the user in their own context.
	if userID, ok := types.UserIDFromContext(ctx); ok && userID != "" {
		s.applyUserKBPins(ctx, tenantID, userID, kbs)
	}
	return kbs, nil
}

// ListKnowledgeBasesByTenantID returns all knowledge bases for the given tenant (e.g. for shared agent context).
func (s *knowledgeBaseService) ListKnowledgeBasesByTenantID(ctx context.Context, tenantID uint64) ([]*types.KnowledgeBase, error) {
	kbs, err := s.repo.ListKnowledgeBasesByTenantID(ctx, tenantID)
	if err != nil {
		logger.ErrorWithFields(ctx, err, map[string]interface{}{
			"tenant_id": tenantID,
		})
		return nil, err
	}
	kbs = filterLiteKnowledgeBases(kbs)
	for _, kb := range kbs {
		kb.EnsureDefaults()
		switch kb.Type {
		case types.KnowledgeBaseTypeDocument:
			if cnt, err := s.kgRepo.CountKnowledgeByKnowledgeBaseID(ctx, tenantID, kb.ID); err == nil {
				kb.KnowledgeCount = cnt
			}
		case types.KnowledgeBaseTypeFAQ:
			if cnt, err := s.chunkRepo.CountChunksByKnowledgeBaseID(ctx, tenantID, kb.ID); err == nil {
				kb.ChunkCount = cnt
			}
		}
		if processingCount, err := s.kgRepo.CountKnowledgeByStatus(ctx, tenantID, kb.ID, []string{"pending", "processing"}); err == nil {
			kb.IsProcessing = processingCount > 0
			kb.ProcessingCount = processingCount
		}
	}

	// Stamp pin state from the caller's perspective. The tenantID
	// argument may not match the caller's own tenant (this method is
	// also used to list a shared-agent's source-tenant KBs); we still
	// scope user_kb_pins by `tenantID` since a pin tied to one tenant
	// shouldn't surface when browsing another tenant's KBs.
	if userID, ok := types.UserIDFromContext(ctx); ok && userID != "" {
		s.applyUserKBPins(ctx, tenantID, userID, kbs)
	}
	return kbs, nil
}

// FillKnowledgeBaseCounts fills KnowledgeCount, ChunkCount, IsProcessing, ProcessingCount for the given KB using kb.TenantID.
func (s *knowledgeBaseService) FillKnowledgeBaseCounts(ctx context.Context, kb *types.KnowledgeBase) error {
	if kb == nil {
		return nil
	}
	tenantID := kb.TenantID
	kb.EnsureDefaults()
	switch kb.Type {
	case types.KnowledgeBaseTypeDocument:
		if cnt, err := s.kgRepo.CountKnowledgeByKnowledgeBaseID(ctx, tenantID, kb.ID); err == nil {
			kb.KnowledgeCount = cnt
		}
	case types.KnowledgeBaseTypeFAQ:
		if cnt, err := s.chunkRepo.CountChunksByKnowledgeBaseID(ctx, tenantID, kb.ID); err == nil {
			kb.ChunkCount = cnt
		}
	}
	if processingCount, err := s.kgRepo.CountKnowledgeByStatus(ctx, tenantID, kb.ID, []string{"pending", "processing"}); err == nil {
		kb.IsProcessing = processingCount > 0
		kb.ProcessingCount = processingCount
	}
	return nil
}

// UpdateKnowledgeBase updates a knowledge base's mutable properties.
//
// IMPORTANT — vector_store_id immutability contract:
// The vector_store_id binding is deliberately not accepted by this method.
// Two layers enforce immutability:
//
//  1. ORM layer: the GORM tag `<-:create` on KnowledgeBase.VectorStoreID
//     makes every UPDATE path (Save / Updates / Select-Updates) a no-op for
//     that column. Verified by repository/knowledgebase_sqlite_test.go.
//  2. Service layer: this method intentionally omits VectorStoreID from its
//     parameter list, and the matching handler DTO UpdateKnowledgeBaseRequest
//     omits the field as well. A reflection-based regression test
//     (handler/knowledgebase_request_test.go) fails if either DTO field
//     is added back, alerting future maintainers.
//
// Any future cross-store rebind workflow must use raw SQL through a
// dedicated repository method — the only sanctioned write path post-creation.
func (s *knowledgeBaseService) UpdateKnowledgeBase(ctx context.Context,
	id string,
	name string,
	description string,
	config *types.KnowledgeBaseConfig,
) (*types.KnowledgeBase, error) {
	if id == "" {
		logger.Error(ctx, "Knowledge base ID is empty")
		return nil, errors.New("knowledge base ID cannot be empty")
	}

	logger.Infof(ctx, "Updating knowledge base, ID: %s, name: %s", id, name)

	// Get existing knowledge base
	kb, err := s.repo.GetKnowledgeBaseByID(ctx, id)
	if err != nil {
		logger.ErrorWithFields(ctx, err, map[string]interface{}{
			"knowledge_base_id": id,
		})
		return nil, err
	}
	if err := rejectLiteFAQKnowledgeBase(kb); err != nil {
		return nil, err
	}

	changedFields := make([]string, 0, 3)
	if kb.Name != name {
		changedFields = append(changedFields, "name")
	}
	if kb.Description != description {
		changedFields = append(changedFields, "description")
	}
	if config != nil {
		changedFields = append(changedFields, "config")
	}

	// Update the knowledge base properties
	kb.Name = name
	kb.Description = description
	if config != nil {
		if isLiteProductEdition() {
			if err := applyLiteKnowledgeBaseConfigUpdate(kb, config); err != nil {
				return nil, err
			}
		} else {
			kb.ChunkingConfig = config.ChunkingConfig
			kb.ImageProcessingConfig = config.ImageProcessingConfig
			if config.FAQConfig != nil {
				kb.FAQConfig = config.FAQConfig
			}
			if config.WikiConfig != nil {
				kb.WikiConfig = config.WikiConfig
			}
			if config.AutoTagConfig != nil {
				kb.AutoTagConfig = config.AutoTagConfig
				kb.AutoTagConfig.Normalize()
			}
			// Update indexing strategy — syncs to ExtractConfig for backward compat.
			if config.IndexingStrategy != nil {
				if !config.IndexingStrategy.HasAnyIndexing() {
					return nil, errors.New("at least one indexing strategy must be enabled")
				}
				kb.IndexingStrategy = *config.IndexingStrategy
				if kb.WikiConfig == nil && config.IndexingStrategy.WikiEnabled {
					kb.WikiConfig = &types.WikiConfig{}
				}
				// Sync GraphEnabled → ExtractConfig.
				if kb.ExtractConfig != nil {
					kb.ExtractConfig.Enabled = config.IndexingStrategy.GraphEnabled
				} else if config.IndexingStrategy.GraphEnabled {
					kb.ExtractConfig = &types.ExtractConfig{Enabled: true}
				}
			}
		}
	}
	kb.UpdatedAt = time.Now()
	kb.EnsureDefaults()

	logger.Info(ctx, "Saving knowledge base update")
	if err := s.repo.UpdateKnowledgeBase(ctx, kb); err != nil {
		logger.ErrorWithFields(ctx, err, map[string]interface{}{
			"knowledge_base_id": id,
		})
		return nil, err
	}
	recordKBActivity(ctx, s.audit, kb.TenantID, kb.ID, types.AuditActionKBUpdated,
		"knowledge_base", kb.ID, types.AuditOutcomeSuccess, map[string]any{
			"name": kb.Name, "changed_fields": changedFields,
		})

	logger.Infof(ctx, "Knowledge base updated successfully, ID: %s, name: %s", kb.ID, kb.Name)
	return kb, nil
}

// applyLiteKnowledgeBaseConfigUpdate merges only the settings exposed by the
// Musuw consumer editor. Hidden platform configuration stays byte-for-byte
// intact even when a caller bypasses the UI and forges the native DTO.
func applyLiteKnowledgeBaseConfigUpdate(kb *types.KnowledgeBase, config *types.KnowledgeBaseConfig) error {
	if kb == nil || config == nil {
		return nil
	}
	if config.WikiConfig != nil {
		if kb.WikiConfig == nil {
			kb.WikiConfig = &types.WikiConfig{
				SynthesisModelID:      kb.SummaryModelID,
				ExtractionGranularity: types.WikiExtractionStandard,
			}
		}
		kb.WikiConfig.ExtractionGranularity = config.WikiConfig.ExtractionGranularity.Normalize()
		kb.WikiConfig.ContentInstructions = config.WikiConfig.ContentInstructions
		kb.WikiConfig.ExtractionInstructions = config.WikiConfig.ExtractionInstructions
	}
	if config.AutoTagConfig != nil {
		kb.AutoTagConfig = &types.AutoTagConfig{Enabled: config.AutoTagConfig.Enabled}
		enforceLiteAutoTagConfig(kb)
	}
	if config.IndexingStrategy != nil {
		if !config.IndexingStrategy.VectorEnabled && !config.IndexingStrategy.KeywordEnabled &&
			!config.IndexingStrategy.WikiEnabled {
			return errors.New("at least one visible indexing strategy (RAG or Wiki) must be enabled")
		}
		graphEnabled := kb.IndexingStrategy.GraphEnabled
		kb.IndexingStrategy = types.IndexingStrategy{
			VectorEnabled:  config.IndexingStrategy.VectorEnabled,
			KeywordEnabled: config.IndexingStrategy.KeywordEnabled,
			WikiEnabled:    config.IndexingStrategy.WikiEnabled,
			GraphEnabled:   graphEnabled,
		}
		if kb.WikiConfig == nil && kb.IndexingStrategy.WikiEnabled {
			kb.WikiConfig = &types.WikiConfig{
				SynthesisModelID:      kb.SummaryModelID,
				ExtractionGranularity: types.WikiExtractionStandard,
			}
		}
	}
	return nil
}

// TogglePinKnowledgeBase toggles whether the calling user has pinned
// this knowledge base. Pin state is per-(user, kb) as of migration
// 000050; previously this method flipped a tenant-wide column on the
// KB row which broke down under RBAC (only Admin/creator could pin,
// and the pin reordered the list for everyone in the tenant). The
// public signature is unchanged so the HTTP handler / CLI / SDK don't
// move.
//
// The KB still has to belong to the caller's tenant — the route is
// already gated behind KBAccessRead, but we re-check via
// GetKnowledgeBaseByIDAndTenant so a stale param survives a tenant
// switch cleanly.
func (s *knowledgeBaseService) TogglePinKnowledgeBase(
	ctx context.Context, id string,
) (*types.KnowledgeBase, error) {
	if id == "" {
		return nil, errors.New("knowledge base ID cannot be empty")
	}
	tenantID := types.MustTenantIDFromContext(ctx)
	userID, ok := types.UserIDFromContext(ctx)
	if !ok || userID == "" {
		// API-key callers without a user identity can't have a personal
		// pin set. We surface this rather than silently flipping a
		// shared-tenant flag like the old behaviour.
		return nil, errors.New("pin requires an authenticated user")
	}

	// Look the KB up without a tenant filter: the route's KBAccessRead
	// guard already validated that this caller can see this KB (own,
	// org-shared, or agent-shared). Filtering by the caller's tenant
	// here would 404 every legitimate pin against a shared KB whose
	// owning tenant differs from the caller's active tenant.
	kb, err := s.repo.GetKnowledgeBaseByID(ctx, id)
	if err != nil {
		logger.ErrorWithFields(ctx, err, map[string]interface{}{
			"knowledge_base_id": id,
			"tenant_id":         tenantID,
		})
		return nil, err
	}

	// Read current pin state to decide direction. ListUserKBPinIDs is
	// already optimised for the "many KBs at once" path; for a single-id
	// check the round-trip is acceptable and avoids leaking a second
	// repository method just for this.
	pins, err := s.repo.ListUserKBPinIDs(ctx, tenantID, userID)
	if err != nil {
		logger.ErrorWithFields(ctx, err, map[string]interface{}{
			"knowledge_base_id": id,
			"tenant_id":         tenantID,
			"user_id":           userID,
		})
		return nil, err
	}
	_, currentlyPinned := pins[id]

	pinnedAt, err := s.repo.SetUserKBPin(ctx, tenantID, userID, id, !currentlyPinned)
	if err != nil {
		logger.ErrorWithFields(ctx, err, map[string]interface{}{
			"knowledge_base_id": id,
			"tenant_id":         tenantID,
			"user_id":           userID,
			"target_pinned":     !currentlyPinned,
		})
		return nil, err
	}

	kb.EnsureDefaults()
	kb.IsPinned = !currentlyPinned
	kb.PinnedAt = pinnedAt
	logger.Infof(ctx, "Knowledge base pin toggled, ID: %s, user: %s, is_pinned: %v",
		id, userID, kb.IsPinned)
	return kb, nil
}

// applyUserKBPins stamps IsPinned / PinnedAt onto each KB in the slice
// from the caller's perspective and sorts the slice so pinned rows
// float to the top (newest pin first, ties broken by created_at desc).
// Safe to call with an empty userID (no-op stamp; default sort by
// created_at preserved).
func (s *knowledgeBaseService) applyUserKBPins(
	ctx context.Context, tenantID uint64, userID string, kbs []*types.KnowledgeBase,
) {
	if len(kbs) == 0 || userID == "" {
		return
	}
	pins, err := s.repo.ListUserKBPinIDs(ctx, tenantID, userID)
	if err != nil {
		// Pin enrichment is best-effort: a transient DB blip here
		// should not break listing KBs. Log and bail without altering
		// the slice — caller still gets a valid list, just unsorted by
		// pin.
		logger.Warnf(ctx, "applyUserKBPins: failed to load pins for tenant=%d user=%s: %v",
			tenantID, userID, err)
		return
	}
	if len(pins) == 0 {
		return
	}
	for _, kb := range kbs {
		if ts, ok := pins[kb.ID]; ok {
			kb.IsPinned = true
			t := ts
			kb.PinnedAt = &t
		}
	}
	sort.SliceStable(kbs, func(i, j int) bool {
		a, b := kbs[i], kbs[j]
		if a.IsPinned != b.IsPinned {
			return a.IsPinned
		}
		if a.IsPinned && b.IsPinned {
			at, bt := a.PinnedAt, b.PinnedAt
			if at != nil && bt != nil && !at.Equal(*bt) {
				return at.After(*bt)
			}
		}
		return a.CreatedAt.After(b.CreatedAt)
	})
}

// DeleteKnowledgeBase deletes a knowledge base by its ID.
//
// The ordinary product path intentionally retains its historical
// best-effort semantics. Account erasure uses the optional
// DeleteKnowledgeBaseForAccountErasure extension below, which turns the same
// existing lifecycle into a fail-closed, retryable cleanup.
func (s *knowledgeBaseService) DeleteKnowledgeBase(ctx context.Context, id string) error {
	return s.deleteKnowledgeBase(ctx, id, false)
}

// DeleteKnowledgeBaseForAccountErasure is the strict account-lifecycle seam.
// It reuses this service's existing queue, storage, vector and graph cleanup
// rather than introducing a second deletion state machine.
func (s *knowledgeBaseService) DeleteKnowledgeBaseForAccountErasure(ctx context.Context, id string) error {
	return s.deleteKnowledgeBase(ctx, id, true)
}

func (s *knowledgeBaseService) deleteKnowledgeBase(ctx context.Context, id string, strict bool) error {
	if id == "" {
		logger.Error(ctx, "Knowledge base ID is empty")
		return errors.New("knowledge base ID cannot be empty")
	}

	logger.Infof(ctx, "Deleting knowledge base, ID: %s", id)

	// Get tenant ID from context
	tenantID := types.MustTenantIDFromContext(ctx)
	tenantInfo, _ := types.TenantInfoFromContext(ctx)
	if strict && tenantInfo == nil {
		return errors.New("tenant info is required for strict knowledge-base deletion")
	}

	// Load the KB before soft-delete so we can snapshot its VectorStoreID
	// into the async cleanup payload. GORM's soft-delete filter hides the
	// row from subsequent reads, so this read must happen first.
	kb, err := s.repo.GetKnowledgeBaseByID(ctx, id)
	if err != nil {
		logger.ErrorWithFields(ctx, err, map[string]interface{}{
			"knowledge_base_id": id,
		})
		return err
	}
	var vectorStoreIDSnapshot *string
	if kb != nil {
		vectorStoreIDSnapshot = kb.VectorStoreID
	}

	// Strict account erasure already runs inside the durable account-erasure
	// worker. Reuse the existing cleanup implementation directly instead of
	// nesting a second queue/state machine; a failure leaves the KB active so
	// the outer task has all metadata required for an idempotent retry.
	var dataSourceIDs []string
	if strict {
		if err := s.cleanupTasksForKnowledgeBaseStrict(ctx, id, nil, nil); err != nil {
			return fmt.Errorf("prepare knowledge-base task cleanup: %w", err)
		}
		if s.shareRepo != nil {
			if err := s.shareRepo.DeleteByKnowledgeBaseID(ctx, id); err != nil {
				return fmt.Errorf("delete knowledge-base shares: %w", err)
			}
		}
		var dsErr error
		dataSourceIDs, dsErr = s.deleteDataSourcesForKnowledgeBaseStrict(ctx, id)
		if dsErr != nil {
			return fmt.Errorf("delete knowledge-base data sources: %w", dsErr)
		}
	}

	if strict {
		payload := types.KBDeletePayload{
			TenantID:         tenantID,
			KnowledgeBaseID:  id,
			DataSourceIDs:    dataSourceIDs,
			EffectiveEngines: tenantInfo.GetEffectiveEngines(),
			VectorStoreID:    vectorStoreIDSnapshot,
			Strict:           true,
		}
		langfuse.InjectTracing(ctx, &payload)
		if err := s.processKBDeleteStrict(ctx, payload); err != nil {
			return fmt.Errorf("strict knowledge-base cleanup: %w", err)
		}
	}

	// Step 1: Delete the knowledge base record first (mark as deleted)
	logger.Infof(ctx, "Deleting knowledge base from database")
	err = s.repo.DeleteKnowledgeBase(ctx, id)
	if err != nil {
		logger.ErrorWithFields(ctx, err, map[string]interface{}{
			"knowledge_base_id": id,
		})
		return err
	}
	deletedName := ""
	if kb != nil {
		deletedName = kb.Name
	}
	recordKBActivity(ctx, s.audit, tenantID, id, types.AuditActionKBDeleted,
		"knowledge_base", id, types.AuditOutcomeSuccess, map[string]any{"name": deletedName})

	// Stop both ephemeral queue work and durable wiki operations that target
	// the now-deleted KB. ProcessKBDelete repeats this with document IDs and
	// performs one final scrub after heavy cleanup to close enqueue races.
	//
	// Run detached with a bounded timeout so a disconnecting API client cannot
	// truncate this best-effort scrub mid-scan, matching ProcessKBDelete's
	// cleanup semantics. The KB row is already soft-deleted, so the async
	// delete task remains the durable backstop even if this pass is cut short.
	kbCleanupCtx, cancelKBCleanup := context.WithTimeout(
		context.WithoutCancel(ctx), kbTaskCleanupTimeout,
	)
	s.cleanupTasksForKnowledgeBase(kbCleanupCtx, id, nil, nil)
	cancelKBCleanup()

	// Step 1b: Remove all organization shares for this KB so org settings no longer show them.
	// The strict path already completed this before enqueueing its durable task;
	// keep the ordinary path's best-effort behaviour unchanged.
	if !strict && s.shareRepo != nil {
		if delErr := s.shareRepo.DeleteByKnowledgeBaseID(ctx, id); delErr != nil {
			logger.Warnf(ctx, "Failed to delete KB shares for knowledge base %s: %v", id, delErr)
		}
	}

	// Step 1c: Stop and soft-delete all data sources bound to this KB so cron
	// schedules and in-flight sync logs do not keep running against a deleted KB.
	if !strict {
		dataSourceIDs = s.deleteDataSourcesForKnowledgeBase(ctx, id)
	}
	if len(dataSourceIDs) > 0 {
		dsCancelCtx, cancelDSCancel := context.WithTimeout(
			context.WithoutCancel(ctx), kbTaskCleanupTimeout,
		)
		s.cancelTasksForKnowledgeBase(dsCancelCtx, id, nil, dataSourceIDs)
		cancelDSCancel()
	}

	// Step 2: Enqueue async task for heavy cleanup operations. Strict account
	// deletion already completed the same cleanup inside its outer durable
	// worker; this ordinary branch preserves the historical best-effort path.
	if strict {
		logger.Infof(ctx, "Strict knowledge base cleanup completed, ID: %s", id)
		return nil
	}
	payload := types.KBDeletePayload{
		TenantID:         tenantID,
		KnowledgeBaseID:  id,
		DataSourceIDs:    dataSourceIDs,
		EffectiveEngines: tenantInfo.GetEffectiveEngines(),
		VectorStoreID:    vectorStoreIDSnapshot, // snapshot taken before soft-delete
	}
	langfuse.InjectTracing(ctx, &payload)

	payloadBytes, err := json.Marshal(payload)
	if err != nil {
		logger.Warnf(ctx, "Failed to marshal KB delete payload: %v", err)
		// Don't fail the request, the KB record is already deleted
		return nil
	}

	task := asynq.NewTask(types.TypeKBDelete, payloadBytes,
		asynq.Queue(types.QueueMaintenance), asynq.MaxRetry(3), asynq.Timeout(2*time.Hour))
	info, err := s.asynqClient.Enqueue(task)
	if err != nil {
		logger.Warnf(ctx, "Failed to enqueue KB delete task: %v", err)
		// Don't fail the request, the KB record is already deleted
		return nil
	}

	logger.Infof(ctx, "KB delete task enqueued: %s, knowledge base ID: %s", info.ID, id)
	logger.Infof(ctx, "Knowledge base deleted successfully, ID: %s", id)
	return nil
}

// ProcessKBDelete handles async knowledge base deletion task
// This method performs heavy cleanup operations: deleting embeddings, chunks, files, and graph data
func (s *knowledgeBaseService) ProcessKBDelete(ctx context.Context, t *asynq.Task) error {
	var payload types.KBDeletePayload
	if err := json.Unmarshal(t.Payload(), &payload); err != nil {
		logger.Errorf(ctx, "Failed to unmarshal KB delete payload: %v", err)
		return err
	}
	if payload.Strict {
		return s.processKBDeleteStrict(ctx, payload)
	}

	tenantID := payload.TenantID
	kbID := payload.KnowledgeBaseID
	var knowledgeIDs []string

	// Set tenant context for downstream services
	ctx = context.WithValue(ctx, types.TenantIDContextKey, tenantID)
	defer func() {
		// Workers may enqueue downstream work while the delete task performs
		// heavy storage cleanup. A detached, bounded final scrub runs on every
		// return path, including retryable failures and cancellation.
		cleanupCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), kbTaskCleanupTimeout)
		defer cancel()
		s.cleanupTasksForKnowledgeBase(cleanupCtx, kbID, knowledgeIDs, payload.DataSourceIDs)
	}()

	logger.Infof(ctx, "Processing KB delete task for knowledge base: %s", kbID)

	// Step 1: Get all knowledge entries in this knowledge base
	logger.Infof(ctx, "Fetching all knowledge entries in knowledge base, ID: %s", kbID)
	knowledgeList, err := s.kgRepo.ListKnowledgeByKnowledgeBaseID(ctx, tenantID, kbID)
	if err != nil {
		logger.ErrorWithFields(ctx, err, map[string]interface{}{
			"knowledge_base_id": kbID,
		})
		return err
	}
	logger.Infof(ctx, "Found %d knowledge entries to delete", len(knowledgeList))
	knowledgeIDs = make([]string, 0, len(knowledgeList))
	for _, knowledge := range knowledgeList {
		knowledgeIDs = append(knowledgeIDs, knowledge.ID)
	}

	// Repeat the best-effort queue scrub with document IDs. Some batch tasks
	// only carry knowledge_id(s), and active work from the first pass may have
	// enqueued another downstream task before cancellation reached it.
	s.cleanupTasksForKnowledgeBase(ctx, kbID, knowledgeIDs, payload.DataSourceIDs)

	// Step 2: Delete all knowledge entries and their resources
	if len(knowledgeList) > 0 {
		logger.Infof(ctx, "Deleting all knowledge entries and their resources")

		// Delete embeddings from vector store.
		// Resolve the engine via the factory, using the VectorStoreID captured
		// at enqueue time (may be nil → falls back to payload.EffectiveEngines).
		// If the payload references a store no longer owned/registered
		// (e.g. tampered queue entry or a store that was deleted while the
		// task sat in the queue), the factory returns a sentinel and we
		// SkipRetry to avoid burning retries on an unrecoverable situation.
		logger.Infof(ctx, "Deleting embeddings from vector store")
		retrieveEngine, err := retriever.CreateRetrieveEngineFromPayload(
			ctx,
			s.retrieveEngine,
			s.ownership,
			payload.TenantID,
			payload.EffectiveEngines,
			payload.VectorStoreID,
		)
		if errors.Is(err, retriever.ErrVectorStoreForbidden) ||
			errors.Is(err, retriever.ErrVectorStoreNotFound) {
			logger.Errorf(ctx, "KB delete task aborted: %v (tenant=%d, kb=%s)", err, payload.TenantID, payload.KnowledgeBaseID)
			return asynq.SkipRetry
		}
		if err != nil {
			// Transient failures — store temporarily unavailable, request
			// cancellation during resolution, or other retryable errors —
			// must not fall through and report success while embeddings remain.
			logger.Errorf(ctx, "KB delete task deferred: %v (tenant=%d, kb=%s)", err, payload.TenantID, payload.KnowledgeBaseID)
			return err
		} else {
			// Group knowledge by embedding model and type
			type groupKey struct {
				EmbeddingModelID string
				Type             string
			}
			embeddingGroups := make(map[groupKey][]string)
			for _, knowledge := range knowledgeList {
				key := groupKey{EmbeddingModelID: knowledge.EmbeddingModelID, Type: knowledge.Type}
				embeddingGroups[key] = append(embeddingGroups[key], knowledge.ID)
			}

			for key, knowledgeGroup := range embeddingGroups {
				embeddingModel, err := s.modelService.GetEmbeddingModel(ctx, key.EmbeddingModelID)
				if err != nil {
					logger.Errorf(ctx, "Failed to get embedding model %s: %v", key.EmbeddingModelID, err)
					return err
				}
				if err := retrieveEngine.DeleteByKnowledgeIDList(ctx, knowledgeGroup, embeddingModel.GetDimensions(), key.Type); err != nil {
					logger.Errorf(ctx, "Failed to delete embeddings for model %s: %v", key.EmbeddingModelID, err)
					return err
				}
			}
		}

		// Collect image URLs before chunks are deleted
		chunkImageInfos, imgErr := s.chunkRepo.ListImageInfoByKnowledgeIDs(ctx, tenantID, knowledgeIDs)
		if imgErr != nil {
			logger.Errorf(ctx, "Failed to collect image URLs for KB delete: %v", imgErr)
			return imgErr
		}
		var imageInfoStrs []string
		for _, ci := range chunkImageInfos {
			imageInfoStrs = append(imageInfoStrs, ci.ImageInfo)
		}
		imageURLs, imageParseErr := collectImageURLsStrict(imageInfoStrs)
		if imageParseErr != nil {
			logger.Errorf(ctx, "Failed to parse image URLs for KB delete: %v", imageParseErr)
			return imageParseErr
		}

		// Physical objects are removed before the knowledge rows. Any provider/R2
		// failure remains retryable while the rows still retain the references
		// needed to finish cleanup; image metadata must also remain available if
		// its provider delete fails, so this block intentionally precedes chunk
		// deletion. Successful row deletion must never hide an object-delete
		// failure.
		logger.Infof(ctx, "Deleting physical files and extracted images")
		for _, knowledge := range knowledgeList {
			if knowledge.FilePath != "" {
				if err := deleteFileIdempotent(ctx, s.fileSvc, knowledge.FilePath); err != nil {
					logger.Errorf(ctx, "Failed to delete file %s: %v", knowledge.FilePath, err)
					return err
				}
			}
		}
		if err := deleteExtractedImagesStrict(ctx, s.fileSvc,
			knowledgeResourceOwners(s.resourceCatalog, knowledgeIDs...), imageURLs); err != nil {
			logger.Errorf(ctx, "Failed to delete extracted images for KB %s: %v", kbID, err)
			return err
		}

		// Delete all chunks after physical object cleanup succeeds. Retaining
		// chunk/image metadata until then makes ordinary-task retries complete
		// rather than silently orphaning an extracted object.
		logger.Infof(ctx, "Deleting all chunks in knowledge base")
		for _, knowledgeID := range knowledgeIDs {
			if err := s.chunkRepo.DeleteChunksByKnowledgeID(ctx, tenantID, knowledgeID); err != nil {
				logger.Errorf(ctx, "Failed to delete chunks for knowledge %s: %v", knowledgeID, err)
				return err
			}
		}

		// Delete knowledge graph data
		logger.Infof(ctx, "Deleting knowledge graph data")
		namespaces := make([]types.NameSpace, 0, len(knowledgeList))
		for _, knowledge := range knowledgeList {
			namespaces = append(namespaces, types.NameSpace{
				KnowledgeBase: knowledge.KnowledgeBaseID,
				Knowledge:     knowledge.ID,
			})
		}
		if s.graphEngine != nil && len(namespaces) > 0 {
			if err := s.graphEngine.DelGraph(ctx, namespaces); err != nil {
				logger.Errorf(ctx, "Failed to delete knowledge graph: %v", err)
				return err
			}
		}

		// Delete all knowledge entries from database only after every external
		// cleanup step has succeeded. The paired repository mutation releases
		// source/index storage accounting atomically with row deletion.
		logger.Infof(ctx, "Deleting knowledge entries from database")
		if err := s.kgRepo.DeleteKnowledgeListWithStorage(ctx, tenantID, knowledgeIDs); err != nil {
			logger.ErrorWithFields(ctx, err, map[string]interface{}{
				"knowledge_base_id": kbID,
			})
			return err
		}
	}

	logger.Infof(ctx, "KB delete task completed successfully, knowledge base ID: %s", kbID)
	return nil
}

// processKBDeleteStrict is the account-erasure variant of ProcessKBDelete.
// It deliberately keeps the same queue payload and service dependencies, but
// changes the failure contract: no knowledge row is soft-deleted until every
// vector, physical file/image, chunk, graph and accounting step that can
// affect the product's active state has either succeeded or been proven
// already absent. A retry therefore still has the row (and image metadata)
// needed to finish cleanup.
func (s *knowledgeBaseService) processKBDeleteStrict(
	ctx context.Context,
	payload types.KBDeletePayload,
) (retErr error) {
	if strings.TrimSpace(payload.KnowledgeBaseID) == "" || payload.TenantID == 0 {
		return errors.New("strict KB delete payload is missing tenant or knowledge base")
	}
	ctx = context.WithValue(ctx, types.TenantIDContextKey, payload.TenantID)
	kbID := payload.KnowledgeBaseID
	var knowledgeIDs []string
	defer func() {
		cleanupCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), kbTaskCleanupTimeout)
		defer cancel()
		if err := s.cleanupTasksForKnowledgeBaseStrict(cleanupCtx, kbID, knowledgeIDs, payload.DataSourceIDs); err != nil {
			if retErr == nil {
				retErr = err
			} else {
				retErr = errors.Join(retErr, err)
			}
		}
	}()

	if s.kgRepo == nil {
		return errors.New("strict KB delete knowledge repository is unavailable")
	}
	knowledgeList, err := s.kgRepo.ListKnowledgeByKnowledgeBaseID(ctx, payload.TenantID, kbID)
	if err != nil {
		return fmt.Errorf("list knowledge for strict KB delete: %w", err)
	}
	knowledgeIDs = make([]string, 0, len(knowledgeList))
	for _, knowledge := range knowledgeList {
		if knowledge != nil && strings.TrimSpace(knowledge.ID) != "" {
			knowledgeIDs = append(knowledgeIDs, knowledge.ID)
		}
	}
	if err := s.cleanupTasksForKnowledgeBaseStrict(ctx, kbID, knowledgeIDs, payload.DataSourceIDs); err != nil {
		return fmt.Errorf("clean queued work for strict KB delete: %w", err)
	}
	if len(knowledgeList) == 0 {
		return nil
	}

	type groupKey struct {
		embeddingModelID string
		typeName         string
	}
	embeddingGroups := make(map[groupKey][]string)
	for _, knowledge := range knowledgeList {
		if knowledge == nil || strings.TrimSpace(knowledge.ID) == "" {
			continue
		}
		// Wiki-only rows legitimately have no embedding model and therefore no
		// vector material to delete.
		if strings.TrimSpace(knowledge.EmbeddingModelID) == "" {
			continue
		}
		key := groupKey{embeddingModelID: knowledge.EmbeddingModelID, typeName: knowledge.Type}
		embeddingGroups[key] = append(embeddingGroups[key], knowledge.ID)
	}
	if len(embeddingGroups) > 0 {
		// An unbound store with no captured effective engine would otherwise
		// create an empty composite engine whose delete is a silent no-op. In
		// strict account erasure that is indistinguishable from orphaning the
		// user's vectors, so retain the rows and let the outer task retry.
		hasBoundStore := payload.VectorStoreID != nil && strings.TrimSpace(*payload.VectorStoreID) != ""
		if !hasBoundStore && len(payload.EffectiveEngines) == 0 {
			return errors.New("strict KB delete vector cleanup engine configuration is unavailable")
		}
		// Resolve and delete vectors first. The factory enforces the bound
		// store's tenant ownership; unknown/unavailable engines remain retryable.
		if s.retrieveEngine == nil {
			return errors.New("strict KB delete retrieve engine is unavailable")
		}
		retrieveEngine, err := retriever.CreateRetrieveEngineFromPayload(
			ctx,
			s.retrieveEngine,
			s.ownership,
			payload.TenantID,
			payload.EffectiveEngines,
			payload.VectorStoreID,
		)
		if err != nil {
			return fmt.Errorf("resolve vector cleanup engine: %w", err)
		}
		for key, ids := range embeddingGroups {
			if s.modelService == nil {
				return errors.New("strict KB delete model service is unavailable")
			}
			embeddingModel, err := s.modelService.GetEmbeddingModel(ctx, key.embeddingModelID)
			if err != nil {
				return fmt.Errorf("resolve embedding model for strict KB delete: %w", err)
			}
			if embeddingModel == nil {
				return errors.New("strict KB delete embedding model is unavailable")
			}
			if err := retrieveEngine.DeleteByKnowledgeIDList(ctx, ids, embeddingModel.GetDimensions(), key.typeName); err != nil {
				return fmt.Errorf("delete vectors for strict KB delete: %w", err)
			}
		}
	}

	// Capture image references before touching chunks. Invalid metadata is a
	// hard error in strict mode: silently dropping it would make a successful
	// local purge impossible to distinguish from an orphaned object.
	if s.chunkRepo == nil {
		return errors.New("strict KB delete chunk repository is unavailable")
	}
	chunkImageInfos, err := s.chunkRepo.ListImageInfoByKnowledgeIDs(ctx, payload.TenantID, knowledgeIDs)
	if err != nil {
		return fmt.Errorf("list image metadata for strict KB delete: %w", err)
	}
	imageInfoStrs := make([]string, 0, len(chunkImageInfos))
	for _, info := range chunkImageInfos {
		imageInfoStrs = append(imageInfoStrs, info.ImageInfo)
	}
	imageURLs, err := collectImageURLsStrict(imageInfoStrs)
	if err != nil {
		return fmt.Errorf("parse image_info for strict KB delete: %w", err)
	}

	// Delete physical files and extracted images before chunks. Keeping chunk
	// metadata until these calls succeed makes retries safe even for local file
	// drivers that do not expose an object-exists probe.
	for _, knowledge := range knowledgeList {
		if knowledge == nil || strings.TrimSpace(knowledge.FilePath) == "" {
			continue
		}
		fileSvc, deletePath, err := s.resolveFileServiceForPersistedPath(ctx, payload.TenantID, knowledge.FilePath)
		if err != nil {
			return fmt.Errorf("resolve source file for strict KB delete: %w", err)
		}
		if err := deleteFileIdempotent(ctx, fileSvc, deletePath); err != nil {
			return fmt.Errorf("delete source file for strict KB delete: %w", err)
		}
	}
	for _, imageURL := range imageURLs {
		fileSvc, deletePath, err := s.resolveFileServiceForPersistedPath(ctx, payload.TenantID, imageURL)
		if err != nil {
			return fmt.Errorf("resolve extracted image for strict KB delete: %w", err)
		}
		if err := deleteFileIdempotent(ctx, fileSvc, deletePath); err != nil {
			return fmt.Errorf("delete extracted image for strict KB delete: %w", err)
		}
	}

	for _, knowledgeID := range knowledgeIDs {
		if err := s.chunkRepo.DeleteChunksByKnowledgeID(ctx, payload.TenantID, knowledgeID); err != nil {
			return fmt.Errorf("delete chunks for strict KB delete: %w", err)
		}
	}

	if s.graphEngine == nil {
		return errors.New("strict KB delete graph repository is unavailable")
	}
	namespaces := make([]types.NameSpace, 0, len(knowledgeList))
	for _, knowledge := range knowledgeList {
		if knowledge == nil {
			continue
		}
		namespaces = append(namespaces, types.NameSpace{
			KnowledgeBase: knowledge.KnowledgeBaseID,
			Knowledge:     knowledge.ID,
		})
	}
	if len(namespaces) > 0 {
		if err := s.graphEngine.DelGraph(ctx, namespaces); err != nil {
			return fmt.Errorf("delete graph for strict KB delete: %w", err)
		}
	}

	// Account erasure hard-deletes the tenant after this worker completes, so
	// updating its storage counter would be wasted work and, on a retry between
	// the counter update and row deletion, could be applied twice.
	if err := s.kgRepo.DeleteKnowledgeList(ctx, payload.TenantID, knowledgeIDs); err != nil {
		return fmt.Errorf("delete knowledge rows for strict KB delete: %w", err)
	}
	return nil
}

// collectImageURLsStrict is the fail-closed counterpart of the ordinary
// best-effort parser. It treats malformed JSON and nil image entries as
// retryable errors rather than silently losing the only reference to an
// extracted object.
func collectImageURLsStrict(imageInfos []string) ([]string, error) {
	seen := make(map[string]struct{})
	urls := make([]string, 0)
	for _, info := range imageInfos {
		if strings.TrimSpace(info) == "" {
			continue
		}
		var images []*types.ImageInfo
		if err := json.Unmarshal([]byte(info), &images); err != nil {
			return nil, err
		}
		for _, image := range images {
			if image == nil {
				return nil, errors.New("image_info contains a null image entry")
			}
			if image.URL == "" {
				continue
			}
			if _, ok := seen[image.URL]; ok {
				continue
			}
			seen[image.URL] = struct{}{}
			urls = append(urls, image.URL)
		}
	}
	return urls, nil
}

// resolveFileServiceForPersistedPath returns both the concrete storage
// instance encoded in a persisted path and the provider path that instance
// must receive. Catalog handles need resolving before backend selection:
// resource:// records deliberately hide their physical storage:// path.
// Strict account erasure leaves the catalog row intact until the final tenant
// purge so a retry can still resolve an object deleted by an earlier attempt.
func (s *knowledgeBaseService) resolveFileServiceForPersistedPath(
	ctx context.Context,
	tenantID uint64,
	path string,
) (interfaces.FileService, string, error) {
	persistedPath := strings.TrimSpace(path)
	physicalPath := persistedPath
	resourceBackendID := ""
	resourceProvider := ""
	isResource := false
	if _, ok := types.ParseResourcePath(persistedPath); ok {
		isResource = true
		if s.resourceCatalog == nil {
			return nil, "", errors.New("resource catalog is unavailable for storage cleanup")
		}
		resource, err := s.resourceCatalog.Resolve(ctx, persistedPath)
		if err != nil {
			return nil, "", fmt.Errorf("resolve catalog resource: %w", err)
		}
		if resource == nil {
			return nil, "", errors.New("resolve catalog resource: resource is unavailable")
		}
		if resource.TenantID != tenantID {
			return nil, "", fmt.Errorf("catalog resource tenant mismatch: got %d, want %d", resource.TenantID, tenantID)
		}
		physicalPath = strings.TrimSpace(resource.PhysicalPath)
		if physicalPath == "" {
			return nil, "", errors.New("catalog resource physical path is empty")
		}
		resourceBackendID = strings.TrimSpace(resource.StorageBackendID)
		resourceProvider = strings.ToLower(strings.TrimSpace(resource.Provider))
	}

	backendID, inner, scoped := types.ParseStorageBackendPath(physicalPath)
	providerPath := physicalPath
	if scoped {
		providerPath = inner
		if resourceBackendID != "" && resourceBackendID != backendID {
			return nil, "", errors.New("catalog resource storage backend mismatch")
		}
	} else if resourceBackendID != "" {
		backendID = resourceBackendID
	}
	provider := types.ParseProviderScheme(providerPath)
	if resourceProvider != "" && provider != "" && resourceProvider != provider {
		return nil, "", errors.New("catalog resource storage provider mismatch")
	}
	if provider == "" {
		provider = resourceProvider
	}

	if !isResource && !scoped {
		if s.fileSvc == nil {
			return nil, "", errors.New("file service is unavailable")
		}
		return s.fileSvc, persistedPath, nil
	}
	if s.storageResolver == nil {
		return nil, "", errors.New("storage backend resolver is unavailable")
	}
	tenant, _ := ctx.Value(types.TenantInfoContextKey).(*types.Tenant)
	if tenant == nil || tenant.ID != tenantID {
		if s.tenantRepo == nil {
			return nil, "", errors.New("tenant repository is unavailable for storage cleanup")
		}
		var err error
		tenant, err = s.tenantRepo.GetTenantByID(ctx, tenantID)
		if err != nil {
			return nil, "", fmt.Errorf("load storage cleanup tenant: %w", err)
		}
	}
	if tenant == nil {
		return nil, "", errors.New("storage cleanup tenant is unavailable")
	}
	fileSvc, _, err := s.storageResolver.ResolveFileService(
		ctx,
		tenant,
		backendID,
		provider,
		storageurl.LocalStorageBaseDir(),
	)
	if err != nil {
		return nil, "", fmt.Errorf("resolve storage backend %s: %w", backendID, err)
	}
	if fileSvc == nil {
		return nil, "", fmt.Errorf("resolve storage backend %s: file service is unavailable", backendID)
	}
	return fileSvc, providerPath, nil
}

func (s *knowledgeBaseService) deleteFileForAccountErasure(
	ctx context.Context,
	tenantID uint64,
	reference string,
) error {
	fileSvc, deletePath, err := s.resolveFileServiceForPersistedPath(ctx, tenantID, reference)
	if err != nil {
		return err
	}
	return deleteFileIdempotent(ctx, fileSvc, deletePath)
}

// deleteFileIdempotent treats an object that is already gone as success. This
// is required for strict retries after a worker crashed between deleting a
// physical object and deleting the corresponding knowledge row. Provider
// drivers vary in their not-found wording, so only well-known absence errors
// are normalized; all other failures remain retryable.
func deleteFileIdempotent(ctx context.Context, fileSvc interfaces.FileService, path string) error {
	if fileSvc == nil {
		return errors.New("file service is unavailable")
	}
	err := fileSvc.DeleteFile(ctx, path)
	if err == nil {
		return nil
	}
	if errors.Is(err, fs.ErrNotExist) {
		return nil
	}
	lower := strings.ToLower(err.Error())
	if strings.Contains(lower, "file not found") ||
		strings.Contains(lower, "resource not found") ||
		strings.Contains(lower, "object not found") ||
		strings.Contains(lower, "no such file") {
		return nil
	}
	return err
}

// cancelTasksForKnowledgeBase removes queue work for a deleted KB when the
// configured task backend supports knowledge-base-wide inspection. Queue
// cleanup is an optimization: the soft-deleted database row remains the
// durable source of truth, so backend failures must not fail KB deletion.
func (s *knowledgeBaseService) cancelTasksForKnowledgeBase(
	ctx context.Context,
	kbID string,
	knowledgeIDs []string,
	dataSourceIDs []string,
) {
	canceller, ok := s.taskInspector.(interfaces.KnowledgeBaseTaskCanceller)
	if !ok || kbID == "" {
		return
	}
	if _, _, err := canceller.CancelTasksForKnowledgeBase(ctx, kbID, knowledgeIDs, dataSourceIDs); err != nil {
		logger.Warnf(ctx, "Failed to cancel queued tasks for deleted KB %s: %v", kbID, err)
	}
}

// cleanupTasksForKnowledgeBase removes both asynq records and durable wiki
// operations. The latter must be cleared as well or startup recovery can
// recreate Redis triggers for a KB that no longer exists.
func (s *knowledgeBaseService) cleanupTasksForKnowledgeBase(
	ctx context.Context,
	kbID string,
	knowledgeIDs []string,
	dataSourceIDs []string,
) {
	if kbID == "" {
		return
	}
	cleaner, ok := s.taskPendingRepo.(interfaces.TaskPendingOpsScopeCleaner)
	if ok {
		// Clear durable work before scanning Redis. A large or degraded queue
		// must not consume the caller's entire deadline and starve the database
		// fence that prevents startup recovery from reviving this KB.
		if err := cleaner.DeleteByScope(ctx, types.TaskScopeKnowledgeBase, kbID); err != nil {
			logger.Warnf(ctx, "Failed to clear durable tasks for deleted KB %s: %v", kbID, err)
		}
	}
	s.cancelTasksForKnowledgeBase(ctx, kbID, knowledgeIDs, dataSourceIDs)
}

// cleanupTasksForKnowledgeBaseStrict is the fail-closed counterpart used by
// account erasure. The durable task-pending repository is authoritative when
// present; the Redis inspector is an optimization in Lite mode, so its
// absence is acceptable, but an implementation error is not.
func (s *knowledgeBaseService) cleanupTasksForKnowledgeBaseStrict(
	ctx context.Context,
	kbID string,
	knowledgeIDs []string,
	dataSourceIDs []string,
) error {
	if strings.TrimSpace(kbID) == "" {
		return errors.New("knowledge base ID is required for strict task cleanup")
	}
	if cleaner, ok := s.taskPendingRepo.(interfaces.TaskPendingOpsScopeCleaner); ok {
		if err := cleaner.DeleteByScope(ctx, types.TaskScopeKnowledgeBase, kbID); err != nil {
			return err
		}
	}
	if canceller, ok := s.taskInspector.(interfaces.KnowledgeBaseTaskCanceller); ok {
		if _, _, err := canceller.CancelTasksForKnowledgeBase(ctx, kbID, knowledgeIDs, dataSourceIDs); err != nil {
			return err
		}
	}
	return nil
}

// deleteDataSourcesForKnowledgeBase mirrors DataSourceService.DeleteDataSource for
// every data source attached to the KB. Errors on individual sources are logged
// but do not fail KB deletion — the KB record is already soft-deleted.
func (s *knowledgeBaseService) deleteDataSourcesForKnowledgeBase(ctx context.Context, kbID string) []string {
	if s.dsRepo == nil {
		return nil
	}

	dataSources, err := s.dsRepo.FindByKnowledgeBase(ctx, kbID)
	if err != nil {
		logger.Warnf(ctx, "Failed to list data sources for deleted KB %s: %v", kbID, err)
		return nil
	}
	dataSourceIDs := make([]string, 0, len(dataSources))
	for _, ds := range dataSources {
		if ds == nil || ds.ID == "" {
			continue
		}
		dataSourceIDs = append(dataSourceIDs, ds.ID)
		if err := s.dsRepo.Delete(ctx, ds.ID); err != nil {
			logger.Warnf(ctx, "Failed to delete data source %s for KB %s: %v", ds.ID, kbID, err)
			continue
		}
		if s.dsScheduler != nil {
			s.dsScheduler.Remove(ds.ID)
		}
		if s.syncLogRepo != nil {
			if err := s.syncLogRepo.CancelPendingByDataSource(ctx, ds.ID); err != nil {
				logger.Warnf(ctx, "Failed to cancel pending sync logs for ds=%s (kb=%s): %v", ds.ID, kbID, err)
			}
		}
		logger.Infof(ctx, "Data source deleted with knowledge base: ds=%s kb=%s", ds.ID, kbID)
	}
	return dataSourceIDs
}

// deleteDataSourcesForKnowledgeBaseStrict performs the same existing
// datasource lifecycle as ordinary KB deletion, but propagates every failure
// so account erasure cannot purge a tenant while a datasource or its pending
// sync work is still live. Already-soft-deleted rows are naturally absent on
// a retry, making the operation idempotent.
func (s *knowledgeBaseService) deleteDataSourcesForKnowledgeBaseStrict(
	ctx context.Context,
	kbID string,
) ([]string, error) {
	if s.dsRepo == nil {
		return nil, nil
	}
	dataSources, err := s.dsRepo.FindByKnowledgeBase(ctx, kbID)
	if err != nil {
		return nil, err
	}
	dataSourceIDs := make([]string, 0, len(dataSources))
	for _, ds := range dataSources {
		if ds == nil || strings.TrimSpace(ds.ID) == "" {
			continue
		}
		dataSourceIDs = append(dataSourceIDs, ds.ID)
		// Cancel sync logs before soft-deleting the datasource. If cancellation
		// fails, the active row and its ID remain discoverable on the next
		// strict retry; deleting first would lose the only durable reference
		// needed to stop an in-flight sync.
		if s.syncLogRepo != nil {
			if err := s.syncLogRepo.CancelPendingByDataSource(ctx, ds.ID); err != nil {
				return dataSourceIDs, err
			}
		}
		if err := s.dsRepo.Delete(ctx, ds.ID); err != nil {
			return dataSourceIDs, err
		}
		if s.dsScheduler != nil {
			s.dsScheduler.Remove(ds.ID)
		}
	}
	return dataSourceIDs, nil
}

// SetEmbeddingModel sets the embedding model for a knowledge base
func (s *knowledgeBaseService) SetEmbeddingModel(ctx context.Context, id string, modelID string) error {
	if id == "" {
		logger.Error(ctx, "Knowledge base ID is empty")
		return errors.New("knowledge base ID cannot be empty")
	}

	if modelID == "" {
		logger.Error(ctx, "Model ID is empty")
		return errors.New("model ID cannot be empty")
	}

	logger.Infof(ctx, "Setting embedding model for knowledge base, knowledge base ID: %s, model ID: %s", id, modelID)

	// Get the knowledge base
	kb, err := s.repo.GetKnowledgeBaseByID(ctx, id)
	if err != nil {
		logger.ErrorWithFields(ctx, err, map[string]interface{}{
			"knowledge_base_id": id,
		})
		return err
	}

	// Update the knowledge base's embedding model
	kb.EmbeddingModelID = modelID
	kb.UpdatedAt = time.Now()

	logger.Info(ctx, "Saving knowledge base embedding model update")
	err = s.repo.UpdateKnowledgeBase(ctx, kb)
	if err != nil {
		logger.ErrorWithFields(ctx, err, map[string]interface{}{
			"knowledge_base_id":  id,
			"embedding_model_id": modelID,
		})
		return err
	}

	logger.Infof(
		ctx,
		"Knowledge base embedding model set successfully, knowledge base ID: %s, model ID: %s",
		id,
		modelID,
	)
	return nil
}

// CopyKnowledgeBase copies a knowledge base to a new knowledge base (shallow copy).
// Source and target must belong to the tenant in context; cross-tenant access is rejected.
//
// Defensive checks:
//
//   - When dstKB != "" (clone into an existing target), the source's
//     EmbeddingModelID and VectorStoreID must match the target's. Mismatched
//     embedding models would silently mix incompatible vector spaces;
//     mismatched vector stores would require copying physical vector data
//     between stores, which is not yet supported.
//   - When dstKB == "" (create a new target), VectorStoreID is copied from
//     the source so the new KB shares the same physical vector index. GORM
//     `<-:create` allows INSERT, so the new row is well-formed.
//
// The handler's CopyKnowledgeBase endpoint runs the same checks synchronously
// before enqueueing the async clone task, so the 400 errors here are
// defense-in-depth for the worker entry point.
func (s *knowledgeBaseService) CopyKnowledgeBase(ctx context.Context,
	srcKB string, dstKB string,
) (*types.KnowledgeBase, *types.KnowledgeBase, error) {
	tenantID := types.MustTenantIDFromContext(ctx)
	// Load source KB with tenant scope to prevent cross-tenant cloning
	sourceKB, err := s.repo.GetKnowledgeBaseByIDAndTenant(ctx, srcKB, tenantID)
	if err != nil {
		logger.Errorf(ctx, "Get source knowledge base failed: %v", err)
		return nil, nil, err
	}
	sourceKB.EnsureDefaults()
	if err := rejectLiteFAQKnowledgeBase(sourceKB); err != nil {
		return nil, nil, err
	}
	if dstKB == "" {
		if err := s.checkCreateKnowledgeBaseEntitlement(ctx); err != nil {
			return nil, nil, err
		}
	}
	var targetKB *types.KnowledgeBase
	if dstKB != "" {
		// Load target KB with tenant scope so we only clone into the caller's tenant
		targetKB, err = s.repo.GetKnowledgeBaseByIDAndTenant(ctx, dstKB, tenantID)
		if err != nil {
			return nil, nil, err
		}
		if err := rejectLiteFAQKnowledgeBase(targetKB); err != nil {
			return nil, nil, err
		}

		// Defense 1: embedding model must match. Mixing incompatible
		// vector spaces would produce semantically broken search results.
		if sourceKB.EmbeddingModelID != targetKB.EmbeddingModelID {
			return nil, nil, apperrors.NewBadRequestError(
				"source and target knowledge bases use different embedding models; " +
					"clone into a target with the same embedding model")
		}

		// Defense 2: vector store binding must match. Cross-store cloning
		// would require copying physical vector data between stores.
		// (both nil → equal; both same UUID → equal; otherwise → rejected)
		if !sourceKB.SharesStoreWith(targetKB) {
			return nil, nil, apperrors.NewBadRequestError(
				"source and target knowledge bases are bound to different vector stores; " +
					"cross-store cloning is not yet supported")
		}

		// Defense 3: the concrete storage instance must match. Comparing only
		// provider names would incorrectly allow COS-A -> COS-B clones.
		if tenant, _ := ctx.Value(types.TenantInfoContextKey).(*types.Tenant); tenant != nil {
			defaultID, defaultProvider := "", ""
			if tenant.DefaultStorageBackendID != nil {
				defaultID = *tenant.DefaultStorageBackendID
			}
			if tenant.StorageEngineConfig != nil {
				defaultProvider = tenant.StorageEngineConfig.DefaultProvider
			}
			if !sourceKB.SharesStorageBackendWith(targetKB, defaultID, defaultProvider) {
				return nil, nil, apperrors.NewBadRequestError(
					"source and target knowledge bases use different storage instances; cross-storage-backend cloning is not supported")
			}
		}
	} else {
		targetKB, err = s.buildKnowledgeBaseCopyTarget(ctx, sourceKB, tenantID)
		if err != nil {
			return nil, nil, err
		}
		if err := s.repo.CreateKnowledgeBase(ctx, targetKB); err != nil {
			return nil, nil, err
		}
	}
	return sourceKB, targetKB, nil
}

// DuplicateKnowledgeBase creates a new KB from the source KB's settings only.
// Runtime/content state is deliberately reset so this path never copies
// knowledge entries, chunks, FAQ content, wiki pages, indexes, shares or pins.
func (s *knowledgeBaseService) DuplicateKnowledgeBase(
	ctx context.Context,
	srcKB string,
) (*types.KnowledgeBase, error) {
	srcKB = strings.TrimSpace(srcKB)
	if srcKB == "" {
		return nil, apperrors.NewBadRequestError("source knowledge base ID cannot be empty")
	}

	tenantID := types.MustTenantIDFromContext(ctx)
	sourceKB, err := s.repo.GetKnowledgeBaseByIDAndTenant(ctx, srcKB, tenantID)
	if err != nil {
		logger.Errorf(ctx, "Get source knowledge base failed: %v", err)
		return nil, err
	}
	sourceKB.EnsureDefaults()
	if err := rejectLiteFAQKnowledgeBase(sourceKB); err != nil {
		return nil, err
	}

	targetKB, err := s.buildKnowledgeBaseCopyTarget(ctx, sourceKB, tenantID)
	if err != nil {
		return nil, err
	}

	if targetKB.HasVectorStore() {
		if err := s.validateVectorStoreBinding(ctx, tenantID, *targetKB.VectorStoreID); err != nil {
			return nil, err
		}
	}

	if err := s.checkCreateKnowledgeBaseEntitlement(ctx); err != nil {
		return nil, err
	}
	if err := s.repo.CreateKnowledgeBase(ctx, targetKB); err != nil {
		return nil, err
	}
	recordKBActivity(ctx, s.audit, tenantID, targetKB.ID, types.AuditActionKBDuplicated,
		"knowledge_base", targetKB.ID, types.AuditOutcomeSuccess, map[string]any{
			"source_kb_id": sourceKB.ID, "name": targetKB.Name,
		})
	return targetKB, nil
}

// buildKnowledgeBaseCopyTarget deep-copies every user-facing KB setting while
// assigning a fresh identity and clearing runtime/projection state. Both the
// settings-only duplicate and the full content-copy path use this constructor
// so their target KBs cannot drift as new configuration fields are added.
func (s *knowledgeBaseService) buildKnowledgeBaseCopyTarget(
	ctx context.Context,
	sourceKB *types.KnowledgeBase,
	tenantID uint64,
) (*types.KnowledgeBase, error) {
	targetKB, err := cloneKnowledgeBaseConfiguration(sourceKB)
	if err != nil {
		return nil, err
	}
	targetKB.ID = uuid.New().String()
	targetKB.TenantID = tenantID
	targetKB.Name = s.buildDuplicateKnowledgeBaseName(ctx, tenantID, sourceKB.Name)
	targetKB.CreatorID = ""
	if uid, ok := types.UserIDFromContext(ctx); ok && !types.IsSyntheticUserID(uid) {
		targetKB.CreatorID = uid
	}
	now := time.Now()
	targetKB.CreatedAt = now
	targetKB.UpdatedAt = now
	targetKB.DeletedAt.Valid = false
	targetKB.DeletedAt.Time = time.Time{}
	targetKB.IsTemporary = false
	targetKB.IsPinned = false
	targetKB.PinnedAt = nil
	targetKB.KnowledgeCount = 0
	targetKB.ChunkCount = 0
	targetKB.IsProcessing = false
	targetKB.ProcessingCount = 0
	targetKB.ShareCount = 0
	targetKB.CreatorName = ""
	targetKB.EnsureDefaults()
	targetKB.Normalize()
	return targetKB, nil
}

func duplicateKBCopySuffix(locale string) string {
	locale = strings.ToLower(locale)
	switch {
	case strings.HasPrefix(locale, "zh"):
		return " 副本"
	case strings.HasPrefix(locale, "ko"):
		return " 사본"
	case strings.HasPrefix(locale, "ru"):
		return " копия"
	default:
		return " Copy"
	}
}

func duplicateKBDefaultName(locale string) string {
	locale = strings.ToLower(locale)
	switch {
	case strings.HasPrefix(locale, "zh"):
		return "知识库"
	case strings.HasPrefix(locale, "ko"):
		return "지식베이스"
	case strings.HasPrefix(locale, "ru"):
		return "База знаний"
	default:
		return "Knowledge Base"
	}
}

func (s *knowledgeBaseService) buildDuplicateKnowledgeBaseName(
	ctx context.Context,
	tenantID uint64,
	sourceName string,
) string {
	locale := types.LanguageFromContextOrDefault(ctx)
	suffix := duplicateKBCopySuffix(locale)

	baseName := strings.TrimSpace(sourceName)
	if baseName == "" {
		baseName = duplicateKBDefaultName(locale)
	}

	kbs, err := s.repo.ListKnowledgeBasesByTenantID(ctx, tenantID)
	if err != nil {
		logger.Warnf(ctx, "List tenant knowledge bases failed while building duplicate name: %v", err)
		return baseName + suffix
	}

	existing := make(map[string]struct{}, len(kbs))
	for _, kb := range kbs {
		if kb == nil {
			continue
		}
		existing[kb.Name] = struct{}{}
	}

	candidate := baseName + suffix
	if _, ok := existing[candidate]; !ok {
		return candidate
	}
	for i := 2; ; i++ {
		candidate = fmt.Sprintf("%s%s %d", baseName, suffix, i)
		if _, ok := existing[candidate]; !ok {
			return candidate
		}
	}
}

func cloneKnowledgeBaseConfiguration(sourceKB *types.KnowledgeBase) (*types.KnowledgeBase, error) {
	if sourceKB == nil {
		return nil, apperrors.NewBadRequestError("source knowledge base cannot be empty")
	}
	data, err := json.Marshal(sourceKB)
	if err != nil {
		return nil, err
	}
	var targetKB types.KnowledgeBase
	if err := json.Unmarshal(data, &targetKB); err != nil {
		return nil, err
	}
	return &targetKB, nil
}
