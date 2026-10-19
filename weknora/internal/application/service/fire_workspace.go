package service

import (
	"context"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"math/big"
	"net/mail"
	"os"
	"slices"
	"strconv"
	"strings"
	"sync"
	"time"
	"unicode/utf8"

	"github.com/Tencent/WeKnora/internal/application/repository"
	"github.com/Tencent/WeKnora/internal/types"
	"github.com/google/uuid"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

var ErrFireCreateConflict = errors.New("account operation or identity already exists with different inputs")
var ErrFireInvalidRequest = errors.New("invalid Fire account request")
var ErrFireProvisionForbidden = errors.New("system administrator required for Fire account provisioning")

// FireWorkspaceConfig has one explicit owner/resource binding. A receiver is
// never made a member of SourceTenantID and never inherits its credentials.
type FireWorkspaceConfig struct {
	SourceTenantID        uint64
	CourseKnowledgeBaseID string
	AgentID               string
}

type FireWorkspaceService struct {
	db     *gorm.DB
	config FireWorkspaceConfig
	mu     sync.Mutex
}

func NewFireWorkspaceService(db *gorm.DB) (*FireWorkspaceService, error) {
	cfg := FireWorkspaceConfig{CourseKnowledgeBaseID: strings.TrimSpace(os.Getenv("FIRE_COURSE_KB_ID")), AgentID: strings.TrimSpace(os.Getenv("FIRE_TAYLOR_AGENT_ID"))}
	raw := strings.TrimSpace(os.Getenv("FIRE_SOURCE_TENANT_ID"))
	if raw != "" {
		var err error
		cfg.SourceTenantID, err = strconv.ParseUint(raw, 10, 64)
		if err != nil {
			return nil, errors.New("invalid FIRE_SOURCE_TENANT_ID")
		}
	}
	if raw != "" || cfg.CourseKnowledgeBaseID != "" || cfg.AgentID != "" {
		if cfg.SourceTenantID == 0 || cfg.CourseKnowledgeBaseID == "" || cfg.AgentID == "" {
			return nil, errors.New("all Fire source resource settings are required")
		}
	}
	return &FireWorkspaceService{db: db, config: cfg}, nil
}

func (s *FireWorkspaceService) Enabled() bool {
	return s != nil && s.db != nil && s.config.SourceTenantID != 0
}

type FireCreateAccountResult struct {
	User              *types.User
	GeneratedPassword string
	Existing          bool
}

type FireExistingAccountResult struct {
	UserID   string `json:"user_id"`
	TenantID uint64 `json:"tenant_id"`
	Existing bool   `json:"existing"`
}

// ProvisionExistingAccount is an explicit operator action, never a read-path
// bootstrap. It changes only managed default resources, not identity or plans.
func (s *FireWorkspaceService) ProvisionExistingAccount(ctx context.Context, actorUserID, targetUserID string) (*FireExistingAccountResult, error) {
	if !s.Enabled() {
		return nil, errors.New("Fire workspace provisioning is not configured")
	}
	actorID, authenticated := types.UserIDFromContext(ctx)
	if !authenticated || actorID != actorUserID || !types.IsSystemAdminFromContext(ctx) {
		return nil, ErrFireProvisionForbidden
	}
	if _, apiKey := types.TenantAPIKeyScopeFromContext(ctx); apiKey {
		return nil, ErrFireProvisionForbidden
	}
	if strings.TrimSpace(targetUserID) == "" || len(actorUserID) > 36 || len(targetUserID) > 36 {
		return nil, ErrFireInvalidRequest
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	var result FireExistingAccountResult
	err := s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if tx.Dialector.Name() == "postgres" {
			if err := tx.Exec("SELECT pg_advisory_xact_lock(?)", int64(706406741)).Error; err != nil {
				return err
			}
		}
		// Lock and re-check the real identities inside the write transaction. A
		// caller-supplied context flag or an API key cannot impersonate an admin.
		users := repository.NewUserRepository(tx.Clauses(clause.Locking{Strength: "UPDATE"}))
		actor, err := users.GetUserByID(ctx, actorUserID)
		if err != nil || actor == nil || !actor.IsSystemAdmin || !actor.IsActive || actor.DeletionRequestedAt != nil {
			return ErrFireProvisionForbidden
		}
		target, err := users.GetUserByID(ctx, targetUserID)
		if err != nil || target == nil || !target.IsActive || target.DeletionRequestedAt != nil || target.TenantID == 0 || target.TenantID == s.config.SourceTenantID {
			return fmt.Errorf("%w: an active existing non-source account is required", ErrFireInvalidRequest)
		}
		var tenant types.Tenant
		if err := tx.Where("id = ?", target.TenantID).First(&tenant).Error; err != nil {
			return fmt.Errorf("%w: target workspace is unavailable", ErrFireInvalidRequest)
		}
		var existing types.FireWorkspaceAccount
		err = tx.Where("user_id = ? OR tenant_id = ?", target.ID, target.TenantID).First(&existing).Error
		if err == nil {
			if existing.TenantID != target.TenantID || existing.SourceTenantID != s.config.SourceTenantID ||
				existing.CourseKnowledgeBaseID != s.config.CourseKnowledgeBaseID || existing.SourceAgentID != s.config.AgentID ||
				existing.DefaultAgentID != types.FireDefaultAgentID {
				return ErrFireCreateConflict
			}
			result = FireExistingAccountResult{UserID: target.ID, TenantID: target.TenantID, Existing: true}
			return nil
		}
		if !errors.Is(err, gorm.ErrRecordNotFound) {
			return err
		}
		grant, err := s.ensureAccountResources(ctx, tx, target)
		if err != nil {
			return err
		}
		grant.OperationID = "existing:" + target.ID
		fingerprint := sha256.Sum256([]byte(fmt.Sprintf("%s:%d:%s:%s", grant.OperationID, grant.SourceTenantID, grant.CourseKnowledgeBaseID, grant.SourceAgentID)))
		grant.RequestFingerprint = hex.EncodeToString(fingerprint[:])
		if err := tx.Create(grant).Error; err != nil {
			return err
		}
		result = FireExistingAccountResult{UserID: target.ID, TenantID: target.TenantID}
		return nil
	})
	if err != nil {
		return nil, err
	}
	return &result, nil
}

// CreateAccount keeps native identity creation, reference grants and the
// caller's membership grant in one transaction. Failed setup returns no
// credentials and leaves no half-created identity. An operation replay cannot
// reset a password or grant quota twice.
func (s *FireWorkspaceService) CreateAccount(ctx context.Context, req *types.AdminCreateUserRequest, afterCreate func(*gorm.DB, *types.User) error) (*FireCreateAccountResult, error) {
	admin := types.IsSystemAdminFromContext(ctx)
	if scope, ok := types.TenantAPIKeyScopeFromContext(ctx); ok {
		admin = scope.IsPlatform() && scope.HasCapability(types.APIKeyCapabilitySystemTenantsManage)
	}
	if !admin {
		return nil, ErrFireProvisionForbidden
	}
	if !s.Enabled() {
		return nil, errors.New("Fire workspace provisioning is not configured")
	}
	if req == nil || strings.TrimSpace(req.OperationID) == "" || len(req.OperationID) > 100 {
		return nil, fmt.Errorf("%w: operation_id is required and must be at most 100 characters", ErrFireInvalidRequest)
	}
	// A keyed fingerprint can include password bytes without introducing an
	// unsalted password digest alongside bcrypt in the database.
	input, err := json.Marshal(req)
	if err != nil {
		return nil, err
	}
	mac := hmac.New(sha256.New, []byte(getJwtSecret()))
	_, _ = mac.Write(input)
	fingerprint := hex.EncodeToString(mac.Sum(nil))
	s.mu.Lock()
	defer s.mu.Unlock()
	var result FireCreateAccountResult
	err = s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if tx.Dialector.Name() == "postgres" {
			// Serialize allocation and operation replay across server processes.
			if err := tx.Exec("SELECT pg_advisory_xact_lock(?)", int64(706406741)).Error; err != nil {
				return err
			}
		}
		var existing types.FireWorkspaceAccount
		lookup := tx.Where("operation_id = ?", req.OperationID).First(&existing).Error
		if lookup == nil {
			if existing.RequestFingerprint != fingerprint {
				return ErrFireCreateConflict
			}
			user, err := repository.NewUserRepository(tx).GetUserByID(ctx, existing.UserID)
			if err != nil {
				return err
			}
			result.User, result.Existing = user, true
			return nil
		}
		if !errors.Is(lookup, gorm.ErrRecordNotFound) {
			return lookup
		}
		prepared := *req
		if strings.TrimSpace(prepared.Username) == "" {
			var usernames []string
			if err := tx.Unscoped().Model(&types.User{}).Where("username LIKE ?", "taylor%").Pluck("username", &usernames).Error; err != nil {
				return err
			}
			next := 1
			for _, username := range usernames {
				n, err := strconv.Atoi(strings.TrimPrefix(username, "taylor"))
				if err == nil && n >= next {
					next = n + 1
				}
			}
			prepared.Username = fmt.Sprintf("taylor%03d", next)
		}
		if strings.ContainsAny(prepared.Username, "@\r\n\t ") || utf8.RuneCountInString(prepared.Username) < 2 || utf8.RuneCountInString(prepared.Username) > 50 {
			return fmt.Errorf("%w: username must be 2-50 characters without whitespace or @", ErrFireInvalidRequest)
		}
		if prepared.Email == "" {
			prepared.Email = strings.ToLower(prepared.Username) + "@fire.localhost.test"
		}
		prepared.Email = strings.ToLower(strings.TrimSpace(prepared.Email))
		address, err := mail.ParseAddress(prepared.Email)
		if err != nil || address.Address != prepared.Email {
			return fmt.Errorf("%w: invalid account email", ErrFireInvalidRequest)
		}
		generated := ""
		if prepared.Password == nil {
			n, err := rand.Int(rand.Reader, big.NewInt(1_000_000))
			if err != nil {
				return err
			}
			generated = fmt.Sprintf("Ty%06d", n.Int64())
			prepared.Password = &generated
		}
		users := repository.NewUserRepository(tx)
		tenants := NewTenantService(repository.NewTenantRepository(tx), repository.NewStorageBackendRepository(tx))
		native := &userService{userRepo: users, tenantService: tenants, memberService: NewTenantMemberService(repository.NewTenantMemberRepository(tx), nil, users, nil)}
		user, _, err := native.AdminCreateUser(ctx, &prepared, types.TenantProvisioningCreatePersonal)
		if errors.Is(err, ErrUserEmailExists) || errors.Is(err, ErrUserUsernameExists) || errors.Is(err, ErrUserIdentityConflict) {
			return ErrFireCreateConflict
		}
		if err != nil {
			return err
		}
		grant, err := s.ensureAccountResources(ctx, tx, user)
		if err != nil {
			return err
		}
		grant.OperationID, grant.RequestFingerprint = req.OperationID, fingerprint
		if err := tx.Create(grant).Error; err != nil {
			return err
		}
		if afterCreate != nil {
			if err := afterCreate(tx, user); err != nil {
				return err
			}
		}
		result.User, result.GeneratedPassword = user, generated
		return nil
	})
	if err != nil {
		return nil, err
	}
	return &result, nil
}

func (s *FireWorkspaceService) ensureAccountResources(ctx context.Context, tx *gorm.DB, user *types.User) (*types.FireWorkspaceAccount, error) {
	kb, err := repository.NewKnowledgeBaseRepository(tx).GetKnowledgeBaseByID(ctx, s.config.CourseKnowledgeBaseID)
	if err != nil || kb == nil || kb.TenantID != s.config.SourceTenantID || kb.CustomerProfile != nil || kb.IsTemporary {
		return nil, errors.New("configured Fire course knowledge base is not a public source resource")
	}
	agent, err := repository.NewCustomAgentRepository(tx).GetAgentByID(ctx, s.config.AgentID, s.config.SourceTenantID)
	if err != nil || agent == nil || strings.TrimSpace(agent.Config.ModelID) == "" {
		return nil, errors.New("configured Fire Taylor agent is unavailable")
	}
	sourceOwner, err := repository.NewUserRepository(tx).GetUserByTenantID(ctx, s.config.SourceTenantID)
	if err != nil || sourceOwner == nil {
		return nil, errors.New("Fire source workspace has no owner")
	}
	orgID := uuid.NewSHA1(uuid.NameSpaceOID, []byte(fmt.Sprintf("fire-course:%d:%s", s.config.SourceTenantID, kb.ID))).String()
	orgRepo, shares := repository.NewOrganizationRepository(tx), repository.NewKBShareRepository(tx)
	orgService := NewOrganizationService(orgRepo, repository.NewUserRepository(tx), shares, repository.NewAgentShareRepository(tx))
	org, err := orgRepo.GetByID(ctx, orgID)
	if errors.Is(err, repository.ErrOrganizationNotFound) {
		// Native org sharing remains the authority for every subsequent read.
		now := time.Now()
		expired := now.Add(-time.Hour)
		org = &types.Organization{ID: orgID, Name: "火种课程", OwnerID: sourceOwner.ID, OwnerTenantID: s.config.SourceTenantID, InviteCode: uuid.New().String()[:32], InviteCodeExpiresAt: &expired, RequireApproval: true, Searchable: false, MemberLimit: 0, CreatedAt: now, UpdatedAt: now}
		if err := orgRepo.Create(ctx, org); err != nil {
			return nil, err
		}
		// GORM's native default tag replaces an inserted zero with 50; managed
		// course access must not silently stop working at the 50th account.
		if err := tx.Model(org).UpdateColumn("member_limit", 0).Error; err != nil {
			return nil, err
		}
		if err := orgService.AddTenantMember(ctx, orgID, s.config.SourceTenantID, sourceOwner.ID, types.OrgRoleAdmin); err != nil {
			return nil, err
		}
	} else if err != nil {
		return nil, err
	}
	if org.OwnerTenantID != s.config.SourceTenantID || org.Searchable {
		return nil, errors.New("invalid Fire course organization binding")
	}
	if _, err := shares.GetByKBAndOrg(ctx, kb.ID, orgID); errors.Is(err, repository.ErrKBShareNotFound) {
		shareService := NewKBShareService(shares, orgRepo, repository.NewKnowledgeBaseRepository(tx), nil, nil, nil)
		if _, err := shareService.ShareKnowledgeBase(ctx, kb.ID, orgID, sourceOwner.ID, s.config.SourceTenantID, types.OrgRoleViewer); err != nil {
			return nil, err
		}
	} else if err != nil {
		return nil, err
	}
	if err := orgService.AddTenantMember(ctx, orgID, user.TenantID, user.ID, types.OrgRoleViewer); err != nil && !errors.Is(err, repository.ErrOrgMemberAlreadyExists) {
		return nil, err
	}
	projected, modelIDs, err := projectFireTaylor(agent, user.TenantID, kb)
	if err != nil {
		return nil, err
	}
	for _, id := range modelIDs {
		m, err := repository.NewModelRepository(tx).GetByID(ctx, s.config.SourceTenantID, id)
		if err != nil || m == nil || m.Status != types.ModelStatusActive {
			return nil, errors.New("a configured Fire model is unavailable")
		}
	}
	agents := repository.NewCustomAgentRepository(tx)
	if _, err := agents.GetAgentByID(ctx, projected.ID, user.TenantID); errors.Is(err, repository.ErrCustomAgentNotFound) {
		if err := agents.CreateAgent(ctx, projected); err != nil {
			return nil, err
		}
	} else if err != nil {
		return nil, err
	}
	modelJSON, _ := json.Marshal(modelIDs)
	return &types.FireWorkspaceAccount{UserID: user.ID, TenantID: user.TenantID, SourceTenantID: s.config.SourceTenantID, CourseKnowledgeBaseID: kb.ID, SourceAgentID: agent.ID, DefaultAgentID: projected.ID, ModelIDsJSON: string(modelJSON), CreatedAt: time.Now()}, nil
}

func projectFireTaylor(source *types.CustomAgent, tenantID uint64, kb *types.KnowledgeBase) (*types.CustomAgent, []string, error) {
	// Deep detach nested config maps/slices; preserve the source's actual prompt,
	// retrieval settings and tool list, never source-owned runtime credentials.
	data, err := json.Marshal(source.Config)
	if err != nil {
		return nil, nil, err
	}
	var cfg types.CustomAgentConfig
	if err := json.Unmarshal(data, &cfg); err != nil {
		return nil, nil, err
	}
	cfg.KBSelectionMode, cfg.KnowledgeBases = "selected", []string{kb.ID}
	cfg.MCPSelectionMode, cfg.MCPServices = "none", nil
	cfg.SandboxConfigID = types.SandboxConfigIDGlobalDefault
	if cfg.SkillsSelectionMode == "" {
		cfg.SkillsSelectionMode = "all"
	}
	cfg.WebSearchProviderID, cfg.ImageStorageProvider = "", ""
	if cfg.QueryUnderstandModelID == "" {
		cfg.QueryUnderstandModelID = cfg.ModelID
	}
	if cfg.QuestionSuggestions != nil && cfg.QuestionSuggestions.FollowUps.ModelID == "" {
		cfg.QuestionSuggestions.FollowUps.ModelID = cfg.ModelID
	}
	ids := []string{}
	modelIDs := []string{cfg.ModelID, cfg.QueryUnderstandModelID, cfg.RerankModelID, cfg.VLMModelID, cfg.ASRModelID, kb.EmbeddingModelID, kb.SummaryModelID, kb.VLMConfig.ModelID, kb.ASRConfig.ModelID}
	if cfg.QuestionSuggestions != nil {
		modelIDs = append(modelIDs, cfg.QuestionSuggestions.FollowUps.ModelID)
	}
	for _, id := range modelIDs {
		if id != "" && !slices.Contains(ids, id) {
			ids = append(ids, id)
		}
	}
	now := time.Now()
	return &types.CustomAgent{ID: types.FireDefaultAgentID, TenantID: tenantID, Name: "泰勒", Description: source.Description, Avatar: source.Avatar, IsBuiltin: false, Config: cfg, CreatedAt: now, UpdatedAt: now}, ids, nil
}

// managedSource resolves only the explicit server-issued resource binding.
// Reading an agent never enrolls an arbitrary tenant in the source workspace or
// broadens its shared-course permissions.
func (s *FireWorkspaceService) managedSource(ctx context.Context, tenantID uint64) (*types.CustomAgent, *types.KnowledgeBase, bool, error) {
	if !s.Enabled() {
		return nil, nil, false, nil
	}
	if tenantID != s.config.SourceTenantID {
		var grant types.FireWorkspaceAccount
		err := s.db.WithContext(ctx).Where("tenant_id = ?", tenantID).First(&grant).Error
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, nil, false, nil
		}
		if err != nil {
			return nil, nil, false, err
		}
		if grant.SourceTenantID != s.config.SourceTenantID || grant.SourceAgentID != s.config.AgentID ||
			grant.CourseKnowledgeBaseID != s.config.CourseKnowledgeBaseID || grant.DefaultAgentID != types.FireDefaultAgentID {
			return nil, nil, false, errors.New("invalid Fire managed resource binding")
		}
	}
	kb, err := repository.NewKnowledgeBaseRepository(s.db).GetKnowledgeBaseByID(ctx, s.config.CourseKnowledgeBaseID)
	if err != nil || kb == nil || kb.TenantID != s.config.SourceTenantID || kb.CustomerProfile != nil || kb.IsTemporary {
		return nil, nil, false, errors.New("configured Fire course knowledge base is unavailable")
	}
	source, err := repository.NewCustomAgentRepository(s.db).GetAgentByID(ctx, s.config.AgentID, s.config.SourceTenantID)
	if err != nil || source == nil || strings.TrimSpace(source.Config.ModelID) == "" {
		return nil, nil, false, errors.New("configured Fire Taylor agent is unavailable")
	}
	return source, kb, true, nil
}

// DefaultAgent is a live view of the administrator's Taylor configuration.
// Receiver snapshots remain stored for rollback, but are never the runtime
// authority. The source owner keeps its real editable ID; receivers keep the
// protected tenant-local ID and their own runtime credentials.
func (s *FireWorkspaceService) DefaultAgent(ctx context.Context, tenantID uint64) (*types.CustomAgent, bool, error) {
	source, kb, managed, err := s.managedSource(ctx, tenantID)
	if err != nil || !managed {
		return nil, managed, err
	}
	if tenantID == s.config.SourceTenantID {
		source.Name = "泰勒"
		return source, true, nil
	}
	projected, _, err := projectFireTaylor(source, tenantID, kb)
	if err != nil {
		return nil, true, err
	}
	projected.CreatedAt, projected.UpdatedAt = source.CreatedAt, source.UpdatedAt
	return projected, true, nil
}

// ManagedModels returns exact provisioned model references without changing
// caller identity. Callers still apply their normal plan / runtime policies.
func (s *FireWorkspaceService) ManagedModels(ctx context.Context, tenantID uint64) ([]*types.Model, error) {
	if !s.Enabled() {
		return nil, nil
	}
	source, kb, managed, err := s.managedSource(ctx, tenantID)
	if err != nil || !managed {
		return nil, err
	}
	_, ids, err := projectFireTaylor(source, tenantID, kb)
	if err != nil {
		return nil, err
	}
	var models []*types.Model
	if len(ids) == 0 {
		return models, nil
	}
	err = s.db.WithContext(ctx).Where("id IN ? AND (tenant_id = ? OR is_builtin = ?)", ids, s.config.SourceTenantID, true).Find(&models).Error
	return models, err
}

func (s *FireWorkspaceService) ResolveManagedModel(ctx context.Context, tenantID uint64, modelID string) (*types.Model, bool, error) {
	if !s.Enabled() {
		return nil, false, nil
	}
	source, kb, managed, err := s.managedSource(ctx, tenantID)
	if err != nil || !managed {
		return nil, false, err
	}
	_, ids, err := projectFireTaylor(source, tenantID, kb)
	if err != nil {
		return nil, false, err
	}
	if !slices.Contains(ids, modelID) {
		return nil, false, nil
	}
	model, err := repository.NewModelRepository(s.db).GetByID(ctx, s.config.SourceTenantID, modelID)
	return model, err == nil && model != nil, err
}
