package service

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"sync"
	"testing"

	"github.com/Tencent/WeKnora/internal/application/repository"
	"github.com/Tencent/WeKnora/internal/firebilling"
	"github.com/Tencent/WeKnora/internal/types"
	"github.com/stretchr/testify/require"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

func fireAdminContext() context.Context {
	ctx := context.WithValue(context.Background(), types.SystemAdminContextKey, true)
	return context.WithValue(ctx, types.UserIDContextKey, "source-user")
}

func fireFixture(t *testing.T) *FireWorkspaceService {
	t.Helper()
	t.Setenv("MUSUW_PRODUCT_EDITION", "standard")
	t.Setenv("STORAGE_TYPE", "local")
	db, err := gorm.Open(sqlite.Open(filepath.Join(t.TempDir(), "fire.db")), &gorm.Config{})
	require.NoError(t, err)
	sqlDB, err := db.DB()
	require.NoError(t, err)
	t.Cleanup(func() { _ = sqlDB.Close() })
	require.NoError(t, db.AutoMigrate(&types.Tenant{}, &types.User{}, &types.TenantMember{}, &types.StorageBackend{}, &types.KnowledgeBase{}, &types.Model{}, &types.CustomAgent{}, &types.Organization{}, &types.OrganizationTenantMember{}, &types.KnowledgeBaseShare{}, &types.FireWorkspaceAccount{}))
	// The native SQLite migration uses DATETIME; AutoMigrate blindly copies
	// the PostgreSQL-specific timestamp tag on invite_code_expires_at.
	initSQL, err := os.ReadFile("../../../migrations/sqlite/000000_init.up.sql")
	require.NoError(t, err)
	orgSQL := string(initSQL)
	orgSQL = orgSQL[strings.Index(orgSQL, "CREATE TABLE IF NOT EXISTS organizations ("):strings.Index(orgSQL, "CREATE TABLE IF NOT EXISTS organization_tenant_members (")]
	require.NoError(t, db.Exec("DROP TABLE organizations").Error)
	require.NoError(t, db.Exec(orgSQL).Error)
	require.NoError(t, db.Create(&types.Tenant{ID: 100, Name: "source", Status: "active"}).Error)
	require.NoError(t, db.Create(&types.User{ID: "source-user", Username: "source", Email: "source@example.test", PasswordHash: "unused", TenantID: 100, IsActive: true, IsSystemAdmin: true}).Error)
	require.NoError(t, db.Create(&types.Model{ID: "approved-model", TenantID: 100, Name: "deepseek-flash", Type: types.ModelTypeKnowledgeQA, Status: types.ModelStatusActive}).Error)
	require.NoError(t, db.Create(&types.Model{ID: "private-model", TenantID: 100, Name: "private", Type: types.ModelTypeKnowledgeQA, Status: types.ModelStatusActive}).Error)
	require.NoError(t, db.Create(&types.KnowledgeBase{ID: "public-course", TenantID: 100, Name: "完整课程", Type: "document"}).Error)
	require.NoError(t, db.Create(&types.KnowledgeBase{ID: "private-source-target", TenantID: 100, Name: "private", Type: "document", CustomerProfile: &types.CustomerProfile{}}).Error)
	require.NoError(t, db.Create(&types.CustomAgent{ID: "source-taylor", TenantID: 100, Name: "泰勒", Config: types.CustomAgentConfig{
		ModelID: "approved-model", SystemPrompt: "original Taylor prompt", AgentMode: types.AgentModeSmartReasoning,
		KBSelectionMode: "all", KnowledgeBases: []string{"private-source-target"},
		MCPSelectionMode: "all", MCPServices: []string{"private-mcp"}, SandboxConfigID: "private-sandbox",
		AllowedTools: []string{"shell_exec", "read_skill", "search_knowledge", "write_sandbox_file"},
	}}).Error)
	return &FireWorkspaceService{db: db, config: FireWorkspaceConfig{SourceTenantID: 100, CourseKnowledgeBaseID: "public-course", AgentID: "source-taylor"}}
}

func TestFireAccountNativeProvisioningIsolatedReadOnlyAndReplaySafe(t *testing.T) {
	s := fireFixture(t)
	ctx := fireAdminContext()
	grants := 0
	req := &types.AdminCreateUserRequest{OperationID: "create-one", FireTokens: 1000}
	result, err := s.CreateAccount(ctx, req, func(_ *gorm.DB, u *types.User) error {
		grants++
		require.NotEqual(t, uint64(100), u.TenantID)
		return nil
	})
	require.NoError(t, err)
	require.Equal(t, "taylor001", result.User.Username)
	require.Regexp(t, regexp.MustCompile(`^Ty\d{6}$`), result.GeneratedPassword)
	require.NoError(t, bcrypt.CompareHashAndPassword([]byte(result.User.PasswordHash), []byte(result.GeneratedPassword)))
	require.False(t, result.User.IsSystemAdmin)
	require.False(t, result.User.CanAccessAllTenants)
	var ownMembership []types.TenantMember
	require.NoError(t, s.db.Where("user_id = ?", result.User.ID).Find(&ownMembership).Error)
	require.Len(t, ownMembership, 1)
	require.Equal(t, result.User.TenantID, ownMembership[0].TenantID)
	require.Equal(t, types.TenantRoleOwner, ownMembership[0].Role)
	agent, err := repository.NewCustomAgentRepository(s.db).GetAgentByID(ctx, types.FireDefaultAgentID, result.User.TenantID)
	require.NoError(t, err)
	require.Equal(t, []string{"public-course"}, agent.Config.KnowledgeBases)
	require.Equal(t, "selected", agent.Config.KBSelectionMode)
	require.Equal(t, "none", agent.Config.MCPSelectionMode)
	require.Empty(t, agent.Config.MCPServices)
	require.Equal(t, "-", agent.Config.SandboxConfigID)
	require.Equal(t, "all", agent.Config.SkillsSelectionMode)
	require.Contains(t, agent.Config.AllowedTools, "shell_exec")
	require.Equal(t, "original Taylor prompt", agent.Config.SystemPrompt)
	share := NewKBShareService(repository.NewKBShareRepository(s.db), repository.NewOrganizationRepository(s.db), repository.NewKnowledgeBaseRepository(s.db), nil, nil, nil)
	allowed, err := share.HasTenantKBPermission(ctx, "public-course", result.User.TenantID, types.TenantRoleOwner, types.OrgRoleViewer)
	require.NoError(t, err)
	require.True(t, allowed)
	allowed, err = share.HasTenantKBPermission(ctx, "public-course", result.User.TenantID, types.TenantRoleOwner, types.OrgRoleEditor)
	require.NoError(t, err)
	require.False(t, allowed)
	allowed, err = share.HasTenantKBPermission(ctx, "private-source-target", result.User.TenantID, types.TenantRoleOwner, types.OrgRoleViewer)
	require.NoError(t, err)
	require.False(t, allowed)
	again, err := s.CreateAccount(ctx, req, func(*gorm.DB, *types.User) error { grants++; return nil })
	require.NoError(t, err)
	require.True(t, again.Existing)
	require.Equal(t, result.User.ID, again.User.ID)
	require.Empty(t, again.GeneratedPassword)
	require.Equal(t, 1, grants)
	changed := *req
	changed.FireTokens++
	_, err = s.CreateAccount(ctx, &changed, nil)
	require.ErrorIs(t, err, ErrFireCreateConflict)
	second, err := s.CreateAccount(ctx, &types.AdminCreateUserRequest{OperationID: "create-two"}, nil)
	require.NoError(t, err)
	require.Equal(t, "taylor002", second.User.Username)
	require.NotEqual(t, result.User.TenantID, second.User.TenantID)
}

func TestFireAccountMembershipFailureRollsBackEverything(t *testing.T) {
	s := fireFixture(t)
	_, err := s.CreateAccount(fireAdminContext(), &types.AdminCreateUserRequest{OperationID: "bad-plan"}, func(tx *gorm.DB, user *types.User) error { return errors.New("invalid plan") })
	require.Error(t, err)
	var count int64
	for _, model := range []any{&types.FireWorkspaceAccount{}, &types.KnowledgeBaseShare{}, &types.Organization{}} {
		require.NoError(t, s.db.Model(model).Count(&count).Error)
		require.Zero(t, count)
	}
	require.NoError(t, s.db.Model(&types.User{}).Where("username LIKE ?", "taylor%").Count(&count).Error)
	require.Zero(t, count)
	require.NoError(t, s.db.Model(&types.Tenant{}).Where("id != ?", 100).Count(&count).Error)
	require.Zero(t, count)
}

func TestFireModelGrantDoesNotPermitProviderConfigurationMutation(t *testing.T) {
	s := fireFixture(t)
	result, err := s.CreateAccount(fireAdminContext(), &types.AdminCreateUserRequest{OperationID: "read-only-model"}, nil)
	require.NoError(t, err)
	ctx := context.WithValue(context.Background(), types.TenantIDContextKey, result.User.TenantID)
	svc := &modelService{repo: repository.NewModelRepository(s.db), fireWorkspace: s}
	model, err := svc.GetModelByID(ctx, "approved-model")
	require.NoError(t, err)
	require.Equal(t, uint64(100), model.TenantID)
	_, err = svc.UpdateModelCredentials(ctx, model.ID, new("replacement-key"), nil)
	require.Error(t, err)
	require.Error(t, svc.DeleteModel(ctx, model.ID))
	model, err = repository.NewModelRepository(s.db).GetByID(ctx, 100, "approved-model")
	require.NoError(t, err)
	require.Equal(t, "deepseek-flash", model.Name)
	require.Empty(t, model.Parameters.APIKey)
}

func TestFireManagedModelsCannotAuthorizeOtherTenantOrUnlistedModel(t *testing.T) {
	s := fireFixture(t)
	result, err := s.CreateAccount(fireAdminContext(), &types.AdminCreateUserRequest{OperationID: "models"}, nil)
	require.NoError(t, err)
	model, ok, err := s.ResolveManagedModel(context.Background(), result.User.TenantID, "approved-model")
	require.NoError(t, err)
	require.True(t, ok)
	require.Equal(t, uint64(100), model.TenantID)
	for _, test := range []struct {
		tenant uint64
		model  string
	}{{result.User.TenantID, "private-model"}, {888, "approved-model"}} {
		model, ok, err := s.ResolveManagedModel(context.Background(), test.tenant, test.model)
		require.NoError(t, err)
		require.False(t, ok)
		require.Nil(t, model)
	}
}

func TestFireDefaultAgentCannotBeOverwrittenByTenantOwner(t *testing.T) {
	ctx := context.WithValue(context.Background(), types.TenantIDContextKey, uint64(123))
	svc := &customAgentService{}
	_, err := svc.CreateAgent(ctx, &types.CustomAgent{ID: types.FireDefaultAgentID, Name: "replacement"})
	require.ErrorIs(t, err, ErrCannotModifyBuiltin)
	_, err = svc.UpdateAgent(ctx, &types.CustomAgent{ID: types.FireDefaultAgentID, Name: "replacement"})
	require.ErrorIs(t, err, ErrCannotModifyBuiltin)
	require.ErrorIs(t, svc.DeleteAgent(ctx, types.FireDefaultAgentID), ErrCannotDeleteBuiltin)
	// Administrators edit the source Taylor row rather than a receiver's
	// projected copy; allowing the latter would appear to save but be ignored.
	_, err = svc.UpdateAgent(fireAdminContext(), &types.CustomAgent{ID: types.FireDefaultAgentID, Name: "replacement"})
	require.ErrorIs(t, err, ErrCannotModifyBuiltin)
	require.ErrorIs(t, svc.DeleteAgent(fireAdminContext(), types.FireDefaultAgentID), ErrCannotDeleteBuiltin)
}

func TestFireTaylorIsTheOnlyManagedDefaultAndTracksSourceEdits(t *testing.T) {
	s := fireFixture(t)
	require.NoError(t, types.LoadBuiltinAgentsConfig("../../../config"))
	result, err := s.CreateAccount(fireAdminContext(), &types.AdminCreateUserRequest{OperationID: "live-default"}, nil)
	require.NoError(t, err)
	ctx := context.WithValue(context.Background(), types.TenantIDContextKey, result.User.TenantID)
	repo := repository.NewCustomAgentRepository(s.db)
	svc := NewCustomAgentServiceWithFireWorkspace(repo, nil, nil, nil, nil, nil, nil, s)
	personal := &types.CustomAgent{ID: "personal-agent", TenantID: result.User.TenantID, Name: "我的智能体", Config: types.CustomAgentConfig{SystemPrompt: "my private prompt"}}
	require.NoError(t, repo.CreateAgent(ctx, personal))
	other := &types.CustomAgent{ID: "foreign-agent", TenantID: 777, Name: "foreign"}
	require.NoError(t, repo.CreateAgent(ctx, other))
	listed, err := svc.ListAgents(ctx)
	require.NoError(t, err)
	require.Len(t, listed, 2, "only Taylor and the user's own agents belong in the picker")
	require.Equal(t, types.FireDefaultAgentID, listed[0].ID)
	require.Equal(t, "泰勒", listed[0].Name)
	require.Equal(t, personal.ID, listed[1].ID)

	source, err := repo.GetAgentByID(ctx, "source-taylor", 100)
	require.NoError(t, err)
	source.Config.SystemPrompt = "updated administrator Taylor prompt"
	source.Config.AllowedTools = []string{"knowledge_search", "wiki_search"}
	source.Config.EmbeddingTopK = 31
	source.Config.SkillsSelectionMode = "none"
	source.Config.QuestionSuggestions = &types.QuestionSuggestionConfig{Starters: types.StarterSuggestionConfig{Enabled: true, Items: []string{"new starter"}}}
	require.NoError(t, repo.UpdateAgent(ctx, source))
	fresh, err := svc.GetAgentByID(ctx, types.FireDefaultAgentID)
	require.NoError(t, err)
	require.Equal(t, source.Config.SystemPrompt, fresh.Config.SystemPrompt)
	require.Equal(t, source.Config.AllowedTools, fresh.Config.AllowedTools)
	require.Equal(t, 31, fresh.Config.EmbeddingTopK)
	require.Equal(t, "none", fresh.Config.SkillsSelectionMode)
	require.Equal(t, []string{"new starter"}, fresh.Config.QuestionSuggestions.Starters.Items)
	sharedView, err := svc.GetAgentByIDAndTenant(ctx, types.FireDefaultAgentID, result.User.TenantID)
	require.NoError(t, err)
	require.Equal(t, fresh.Config, sharedView.Config)
	require.Equal(t, result.User.TenantID, fresh.TenantID, "using Taylor must not switch the user's tenant")
	require.Equal(t, []string{"public-course"}, fresh.Config.KnowledgeBases)
	require.Equal(t, "none", fresh.Config.MCPSelectionMode)
	require.Empty(t, fresh.Config.MCPServices)
	require.Equal(t, types.SandboxConfigIDGlobalDefault, fresh.Config.SandboxConfigID)
	fresh.Config.AllowedTools[0] = "mutated"
	sourceAgain, err := repo.GetAgentByID(ctx, "source-taylor", 100)
	require.NoError(t, err)
	require.Equal(t, "knowledge_search", sourceAgain.Config.AllowedTools[0])
	personalAgain, err := repo.GetAgentByID(ctx, personal.ID, result.User.TenantID)
	require.NoError(t, err)
	require.Equal(t, "my private prompt", personalAgain.Config.SystemPrompt)

	// Existing built-in IDs remain resolvable for old conversation records.
	legacy, err := svc.GetAgentByID(ctx, types.BuiltinQuickAnswerID)
	require.NoError(t, err)
	require.Equal(t, types.BuiltinQuickAnswerID, legacy.ID)
}

func TestFireTaylorDefaultSourceOwnerAndUnprovisionedTenants(t *testing.T) {
	s := fireFixture(t)
	require.NoError(t, types.LoadBuiltinAgentsConfig("../../../config"))
	repo := repository.NewCustomAgentRepository(s.db)
	svc := NewCustomAgentServiceWithFireWorkspace(repo, nil, nil, nil, nil, nil, nil, s)
	ownerCtx := context.WithValue(fireAdminContext(), types.TenantIDContextKey, uint64(100))
	listed, err := svc.ListAgents(ownerCtx)
	require.NoError(t, err)
	require.Len(t, listed, 1)
	require.Equal(t, "source-taylor", listed[0].ID, "administrator edits must target the original authoritative row")
	require.False(t, listed[0].IsBuiltin)
	source, err := svc.GetAgentByID(ownerCtx, "source-taylor")
	require.NoError(t, err)
	require.Equal(t, "original Taylor prompt", source.Config.SystemPrompt)
	require.Equal(t, "private-sandbox", source.Config.SandboxConfigID, "source workspace settings stay intact")

	strangerCtx := context.WithValue(context.Background(), types.TenantIDContextKey, uint64(777))
	_, err = svc.GetAgentByID(strangerCtx, types.FireDefaultAgentID)
	require.ErrorIs(t, err, ErrAgentNotFound)
	listed, err = svc.ListAgents(strangerCtx)
	require.NoError(t, err)
	for _, agent := range listed {
		require.NotEqual(t, types.FireDefaultAgentID, agent.ID)
		require.NotEqual(t, "source-taylor", agent.ID)
	}
	var grants int64
	require.NoError(t, s.db.Model(&types.FireWorkspaceAccount{}).Count(&grants).Error)
	require.Zero(t, grants, "read paths must not silently provision or share source resources")
}

func TestFireTaylorSourceModelRotationUpdatesExistingReceiversWithoutRegrant(t *testing.T) {
	s := fireFixture(t)
	result, err := s.CreateAccount(fireAdminContext(), &types.AdminCreateUserRequest{OperationID: "rotate-default-model"}, nil)
	require.NoError(t, err)
	repo := repository.NewCustomAgentRepository(s.db)
	source, err := repo.GetAgentByID(context.Background(), "source-taylor", 100)
	require.NoError(t, err)
	source.Config.ModelID = "private-model"
	source.Config.QueryUnderstandModelID = "private-model"
	require.NoError(t, repo.UpdateAgent(context.Background(), source))
	model, allowed, err := s.ResolveManagedModel(context.Background(), result.User.TenantID, "private-model")
	require.NoError(t, err)
	require.True(t, allowed)
	require.Equal(t, "private-model", model.ID)
	_, allowed, err = s.ResolveManagedModel(context.Background(), result.User.TenantID, "approved-model")
	require.NoError(t, err)
	require.False(t, allowed, "a retired source model cannot remain available through stale signup metadata")
	models, err := s.ManagedModels(context.Background(), result.User.TenantID)
	require.NoError(t, err)
	require.Len(t, models, 1)
	require.Equal(t, "private-model", models[0].ID)

	var grant types.FireWorkspaceAccount
	require.NoError(t, s.db.Where("tenant_id = ?", result.User.TenantID).First(&grant).Error)
	require.Contains(t, grant.ModelIDsJSON, "approved-model", "the original grant snapshot is preserved for rollback")
	_, _, err = s.DefaultAgent(context.Background(), result.User.TenantID)
	require.NoError(t, err)
	require.NoError(t, repo.DeleteAgent(context.Background(), source.ID, source.TenantID))
	_, _, err = s.DefaultAgent(context.Background(), result.User.TenantID)
	require.Error(t, err, "a missing source must fail honestly instead of executing a stale persona")
}

func TestFireAccountRejectsNonAdminBeforePersistence(t *testing.T) {
	s := fireFixture(t)
	ctx := context.WithValue(context.Background(), types.TenantRoleContextKey, types.TenantRoleOwner)
	_, err := s.CreateAccount(ctx, &types.AdminCreateUserRequest{OperationID: "untrusted"}, nil)
	require.ErrorIs(t, err, ErrFireProvisionForbidden)
	var count int64
	require.NoError(t, s.db.Model(&types.FireWorkspaceAccount{}).Count(&count).Error)
	require.Zero(t, count)
}

func TestFireAccountLedgerGrantSharesAtomicTransaction(t *testing.T) {
	s := fireFixture(t)
	require.NoError(t, s.db.AutoMigrate(&firebilling.Plan{}, &firebilling.Membership{}, &firebilling.Adjustment{}, &firebilling.Call{}))
	ctx := fireAdminContext()
	req := &types.AdminCreateUserRequest{OperationID: "real-ledger", FireDurationDays: 30, FireTokens: 5000}
	grant := func(tx *gorm.DB, user *types.User) error {
		_, err := firebilling.NewService(tx).Apply(ctx, user.ID, firebilling.Mutation{OperationID: "account:" + req.OperationID, Kind: "grant", DurationDays: req.FireDurationDays, Tokens: req.FireTokens})
		return err
	}
	result, err := s.CreateAccount(ctx, req, grant)
	require.NoError(t, err)
	status, err := firebilling.NewService(s.db).Status(ctx, result.User.ID)
	require.NoError(t, err)
	require.EqualValues(t, 5000, status.RemainingTokens)
	_, err = s.CreateAccount(ctx, req, grant)
	require.NoError(t, err)
	var count int64
	require.NoError(t, s.db.Model(&firebilling.Adjustment{}).Count(&count).Error)
	require.EqualValues(t, 1, count)
}

func TestFireAccountConcurrentReplayReturnsOnlyOneCredential(t *testing.T) {
	s := fireFixture(t)
	var wg sync.WaitGroup
	var mu sync.Mutex
	credentials := 0
	userIDs := map[string]bool{}
	for range 3 {
		wg.Go(func() {
			result, err := s.CreateAccount(fireAdminContext(), &types.AdminCreateUserRequest{OperationID: "concurrent"}, nil)
			mu.Lock()
			defer mu.Unlock()
			require.NoError(t, err)
			if result == nil {
				return
			}
			userIDs[result.User.ID] = true
			if result.GeneratedPassword != "" {
				credentials++
			}
		})
	}
	wg.Wait()
	require.Len(t, userIDs, 1)
	require.Equal(t, 1, credentials)
}

func TestFireTargetConversationIncludesSharedCourseButNotAnotherTarget(t *testing.T) {
	s := fireFixture(t)
	result, err := s.CreateAccount(fireAdminContext(), &types.AdminCreateUserRequest{OperationID: "target"}, nil)
	require.NoError(t, err)
	kb := &types.KnowledgeBase{ID: "own-target", TenantID: result.User.TenantID, Name: "own", Type: "document", CustomerProfile: &types.CustomerProfile{}}
	require.NoError(t, s.db.Create(kb).Error)
	ctx := context.WithValue(context.Background(), types.TenantIDContextKey, result.User.TenantID)
	ctx = context.WithValue(ctx, types.TenantRoleContextKey, types.TenantRoleOwner)
	share := NewKBShareService(repository.NewKBShareRepository(s.db), repository.NewOrganizationRepository(s.db), repository.NewKnowledgeBaseRepository(s.db), nil, nil, nil)
	svc := &sessionService{knowledgeBaseService: &knowledgeBaseService{repo: repository.NewKnowledgeBaseRepository(s.db)}, kbShareService: share}
	req := &types.QARequest{Session: &types.Session{TenantID: result.User.TenantID, CustomerKnowledgeBaseID: kb.ID},
		CustomAgent:      &types.CustomAgent{TenantID: result.User.TenantID, Config: types.CustomAgentConfig{KnowledgeBases: []string{"public-course", "private-source-target"}}},
		KnowledgeBaseIDs: []string{"public-course"}}
	ids, _, err := svc.resolveCustomerKnowledge(ctx, req)
	require.NoError(t, err)
	require.ElementsMatch(t, []string{kb.ID, "public-course"}, ids)
	req.KnowledgeBaseIDs = []string{"private-source-target"}
	_, _, err = svc.resolveCustomerKnowledge(ctx, req)
	require.Error(t, err)
}
