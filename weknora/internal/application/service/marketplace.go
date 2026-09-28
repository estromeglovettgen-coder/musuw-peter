package service

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"net/url"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/Tencent/WeKnora/internal/application/repository"
	"github.com/Tencent/WeKnora/internal/types"
	"github.com/Tencent/WeKnora/internal/types/interfaces"
	"github.com/google/uuid"
)

type marketplaceService struct {
	repo           interfaces.MarketplaceRepository
	entitlements   interfaces.EntitlementService
	knowledgeBases interfaces.KnowledgeBaseRepository
	agents         interfaces.CustomAgentRepository
	gateway        interfaces.MarketplacePaymentGateway
}

// NewMarketplaceService coordinates reviewed products and independent product subscriptions.
func NewMarketplaceService(
	repo interfaces.MarketplaceRepository,
	entitlements interfaces.EntitlementService,
	knowledgeBases interfaces.KnowledgeBaseRepository,
	agents interfaces.CustomAgentRepository,
	gateway interfaces.MarketplacePaymentGateway,
) interfaces.MarketplaceService {
	return &marketplaceService{
		repo:           repo,
		entitlements:   entitlements,
		knowledgeBases: knowledgeBases,
		agents:         agents,
		gateway:        gateway,
	}
}

func marketplaceActor(ctx context.Context) (uint64, string, error) {
	tenant, ok := types.TenantIDFromContext(ctx)
	user, userOK := types.UserIDFromContext(ctx)
	if !ok || tenant == 0 || !userOK || user == "" {
		return 0, "", types.ErrMarketplaceForbidden
	}
	return tenant, user, nil
}

func (s *marketplaceService) requireCreator(ctx context.Context) error {
	if _, _, err := marketplaceActor(ctx); err != nil {
		return err
	}
	if types.IsSystemAdminFromContext(ctx) {
		return nil
	}
	if s.entitlements == nil {
		return types.ErrMarketplaceForbidden
	}
	current, err := s.entitlements.Current(ctx, time.Now().UTC())
	if err != nil {
		return err
	}
	if current == nil || current.Plan != types.ConsumerPlanMax {
		return fmt.Errorf("%w: an active Max membership is required to submit", types.ErrMarketplaceForbidden)
	}
	return nil
}

func marketplaceStringList(values []string, limit int) ([]string, error) {
	if len(values) == 0 || len(values) > limit {
		return nil, types.ErrMarketplaceInvalid
	}
	result := make([]string, 0, len(values))
	seen := map[string]bool{}
	for _, value := range values {
		value = strings.TrimSpace(value)
		if value == "" || len(value) > 128 || seen[value] {
			return nil, types.ErrMarketplaceInvalid
		}
		seen[value] = true
		result = append(result, value)
	}
	return result, nil
}

func (s *marketplaceService) validateSources(
	ctx context.Context,
	tenant uint64,
	agentID string,
	kbIDs []string,
) (*types.CustomAgent, []string, error) {
	if s.agents == nil || s.knowledgeBases == nil {
		return nil, nil, types.ErrMarketplaceInvalid
	}
	agent, err := s.agents.GetAgentByID(ctx, agentID, tenant)
	if err != nil && !errors.Is(err, repository.ErrCustomAgentNotFound) {
		return nil, nil, err
	}
	if err != nil || agent == nil || agent.TenantID != tenant || agent.IsBuiltin {
		return nil, nil, fmt.Errorf("%w: select an owned custom agent", types.ErrMarketplaceForbidden)
	}
	names := make([]string, 0, len(kbIDs))
	for _, id := range kbIDs {
		kb, err := s.knowledgeBases.GetKnowledgeBaseByID(ctx, id)
		if err != nil && !errors.Is(err, repository.ErrKnowledgeBaseNotFound) {
			return nil, nil, err
		}
		if err != nil || kb == nil || kb.TenantID != tenant || kb.IsTemporary {
			return nil, nil, fmt.Errorf("%w: select owned, durable knowledge bases", types.ErrMarketplaceForbidden)
		}
		names = append(names, kb.Name)
	}
	return agent, names, nil
}

func validateMarketplaceInput(input *types.MarketplaceProductInput) error {
	input.Title = strings.TrimSpace(input.Title)
	input.Description = strings.TrimSpace(input.Description)
	input.Category = strings.TrimSpace(input.Category)
	input.AgentID = strings.TrimSpace(input.AgentID)
	input.Contact = strings.TrimSpace(input.Contact)
	input.Authorization = strings.TrimSpace(input.Authorization)
	if input.Title == "" || utf8.RuneCountInString(input.Title) > 160 || input.Description == "" ||
		utf8.RuneCountInString(input.Description) > 8000 ||
		len(input.Category) > 64 ||
		input.AgentID == "" ||
		len(input.AgentID) > 36 {
		return types.ErrMarketplaceInvalid
	}
	if input.MonthlyAmount < 0 || input.MonthlyAmount > math.MaxInt64/10 {
		return fmt.Errorf("%w: monthly price must be a nonnegative minor-unit amount", types.ErrMarketplaceInvalid)
	}
	input.Currency = strings.ToUpper(strings.TrimSpace(input.Currency))
	if input.Currency == "" {
		input.Currency = "USD"
	}
	if input.Currency != "USD" {
		return fmt.Errorf("%w: catalog prices use USD", types.ErrMarketplaceInvalid)
	}
	if input.DefaultModelID != "" && input.DefaultModelID != types.MarketplaceDefaultModelID {
		return fmt.Errorf("%w: use the platform Flash default model", types.ErrMarketplaceInvalid)
	}
	if len(input.Contact) > 1000 || len(input.Authorization) > 8000 || len(input.SampleQuestions) > 6 {
		return types.ErrMarketplaceInvalid
	}
	for _, q := range input.SampleQuestions {
		if strings.TrimSpace(q) == "" || utf8.RuneCountInString(q) > 300 {
			return types.ErrMarketplaceInvalid
		}
	}
	input.CoverURL = strings.TrimSpace(input.CoverURL)
	if input.CoverURL != "" {
		parsed, err := url.Parse(input.CoverURL)
		if err != nil || parsed.Scheme != "https" || parsed.Host == "" || parsed.User != nil ||
			len(input.CoverURL) > 2048 {
			return fmt.Errorf("%w: cover must be an HTTPS URL", types.ErrMarketplaceInvalid)
		}
	}
	var err error
	input.KnowledgeBaseIDs, err = marketplaceStringList(input.KnowledgeBaseIDs, 20)
	return err
}

func (s *marketplaceService) SaveProduct(
	ctx context.Context,
	id string,
	input types.MarketplaceProductInput,
	asAdmin bool,
) (*types.MarketplaceProduct, error) {
	tenant, user, err := marketplaceActor(ctx)
	if err != nil {
		return nil, err
	}
	if asAdmin {
		if !types.IsSystemAdminFromContext(ctx) {
			return nil, types.ErrMarketplaceForbidden
		}
	} else if err := s.requireCreator(ctx); err != nil {
		return nil, err
	}
	if input.SampleConversations != nil && (!asAdmin || !types.IsSystemAdminFromContext(ctx)) {
		return nil, types.ErrMarketplaceForbidden
	}
	if err := validateMarketplaceExamples(input.SampleConversations); err != nil {
		return nil, err
	}
	if err := validateMarketplaceInput(&input); err != nil {
		return nil, err
	}
	p := &types.MarketplaceProduct{
		ID:                       uuid.NewString(),
		CreatorTenantID:          tenant,
		CreatorUserID:            user,
		Status:                   "draft",
		PlatformKnowledgeBaseIDs: types.StringArray{},
		KnowledgeBaseNames:       types.StringArray{},
		SampleQuestions:          types.StringArray{},
	}
	expected := time.Time{}
	if id != "" {
		p, err = s.repo.GetProduct(ctx, id)
		if err != nil {
			return nil, err
		}
		expected = p.UpdatedAt
		if !asAdmin && (p.CreatorTenantID != tenant || p.CreatorUserID != user) {
			return nil, types.ErrMarketplaceForbidden
		}
		if !asAdmin && p.Status != "draft" && p.Status != "rejected" {
			return nil, types.ErrMarketplaceConflict
		}
		if p.ReviewedAt != nil && (p.MonthlyAmount == 0) != (input.MonthlyAmount == 0) {
			return nil, fmt.Errorf(
				"%w: reviewed products cannot switch between free and paid",
				types.ErrMarketplaceConflict,
			)
		}
	}
	agent, names, err := s.validateSources(ctx, p.CreatorTenantID, input.AgentID, input.KnowledgeBaseIDs)
	if err != nil {
		return nil, err
	}
	p.Title = input.Title
	p.Description = input.Description
	p.Category = input.Category
	p.CoverURL = input.CoverURL
	p.AgentID = agent.ID
	p.AgentName = agent.Name
	p.KnowledgeBaseIDs = types.StringArray(input.KnowledgeBaseIDs)
	p.KnowledgeBaseNames = types.StringArray(names)
	p.SampleQuestions = types.StringArray(input.SampleQuestions)
	if input.SampleConversations != nil {
		p.SampleConversations = append([]types.MarketplaceExample{}, (*input.SampleConversations)...)
	}
	if p.SampleQuestions == nil {
		p.SampleQuestions = types.StringArray{}
	}
	p.DefaultModelID = types.MarketplaceDefaultModelID
	p.Currency = input.Currency
	p.MonthlyAmount = input.MonthlyAmount
	p.YearlyAmount = input.MonthlyAmount * 10
	p.Contact = input.Contact
	p.Authorization = input.Authorization
	p.AuthorizationConfirmed = input.AuthorizationConfirmed
	p.Status = "draft"
	p.ReviewNote = ""
	if err := s.repo.SaveProduct(ctx, p, expected); err != nil {
		return nil, err
	}
	return p, nil
}

func (s *marketplaceService) SubmitProduct(ctx context.Context, id string) (*types.MarketplaceProduct, error) {
	tenant, user, err := marketplaceActor(ctx)
	if err != nil {
		return nil, err
	}
	if err := s.requireCreator(ctx); err != nil {
		return nil, err
	}
	p, err := s.repo.GetProduct(ctx, id)
	if err != nil {
		return nil, err
	}
	if p.CreatorTenantID != tenant || p.CreatorUserID != user {
		return nil, types.ErrMarketplaceForbidden
	}
	if p.Status != "draft" && p.Status != "rejected" {
		return nil, types.ErrMarketplaceConflict
	}
	if p.Contact == "" || p.Authorization == "" || !p.AuthorizationConfirmed {
		return nil, fmt.Errorf(
			"%w: contact and confirmed publication authorization are required",
			types.ErrMarketplaceInvalid,
		)
	}
	if _, _, err := s.validateSources(ctx, p.CreatorTenantID, p.AgentID, p.KnowledgeBaseIDs); err != nil {
		return nil, err
	}
	expected := p.UpdatedAt
	p.Status = "pending"
	p.ReviewNote = ""
	if err := s.repo.SaveProduct(ctx, p, expected); err != nil {
		return nil, err
	}
	return p, nil
}

func marketplaceReviewedConfig(agent *types.CustomAgent, kbIDs []string) (types.CustomAgentConfig, error) {
	raw, err := json.Marshal(agent.Config)
	if err != nil {
		return types.CustomAgentConfig{}, err
	}
	var cfg types.CustomAgentConfig
	if err = json.Unmarshal(raw, &cfg); err != nil {
		return cfg, err
	}
	cfg.ModelID = types.MarketplaceDefaultModelID
	cfg.QueryUnderstandModelID = types.MarketplaceDefaultModelID
	cfg.RerankModelID = types.CheapestRerankModelID
	cfg.VLMModelID = types.CheapestVisionModelID
	cfg.ASRModelID = types.CheapestSpeechModelID
	cfg.KBSelectionMode = "selected"
	cfg.KnowledgeBases = append([]string{}, kbIDs...)
	cfg.RetrieveKBOnlyWhenMentioned = false
	cfg.MCPSelectionMode = "none"
	cfg.MCPServices = nil
	cfg.SkillsSelectionMode = "none"
	cfg.SelectedSkills = nil
	cfg.SandboxConfigID = ""
	cfg.WebSearchEnabled = false
	cfg.WebFetchEnabled = false
	cfg.WebSearchProviderID = ""
	cfg.DataAnalysisEnabled = false
	cfg.AllowedTools = []string{
		"knowledge_search",
		"wiki_search",
		"wiki_read_page",
		"wiki_read_source_doc",
		"grep_chunks",
		"list_knowledge_chunks",
		"get_document_info",
	}
	disabled := false
	cfg.MemoryEnabled = &disabled
	return cfg, nil
}

func (s *marketplaceService) ReviewProduct(
	ctx context.Context,
	id string,
	input types.MarketplaceReviewInput,
) (*types.MarketplaceProduct, error) {
	tenant, user, err := marketplaceActor(ctx)
	if err != nil {
		return nil, err
	}
	if !types.IsSystemAdminFromContext(ctx) {
		return nil, types.ErrMarketplaceForbidden
	}
	p, err := s.repo.GetProduct(ctx, id)
	if err != nil {
		return nil, err
	}
	expected := p.UpdatedAt
	switch input.Action {
	case "approve":
		if p.Status != "pending" && p.Status != "unpublished" && p.Status != "published" && p.Status != "draft" {
			return nil, types.ErrMarketplaceConflict
		}
		if p.Contact == "" || p.Authorization == "" || !p.AuthorizationConfirmed {
			return nil, fmt.Errorf("%w: confirmed publication authorization is required", types.ErrMarketplaceInvalid)
		}
		ids, err := marketplaceStringList(input.PlatformKnowledgeBaseIDs, 20)
		if err != nil {
			return nil, fmt.Errorf("%w: platform knowledge bases are required", types.ErrMarketplaceInvalid)
		}
		agent, names, err := s.validateSources(ctx, tenant, strings.TrimSpace(input.PlatformAgentID), ids)
		if err != nil {
			return nil, err
		}
		for _, id := range ids {
			kb, err := s.knowledgeBases.GetKnowledgeBaseByID(ctx, id)
			if err != nil {
				return nil, err
			}
			if kb.EmbeddingModelID != types.PlatformKnowledgeBaseEmbeddingModelID {
				return nil, fmt.Errorf(
					"%w: published knowledge bases must use the platform embedding model",
					types.ErrMarketplaceInvalid,
				)
			}
		}
		p.PaddleProductID = strings.TrimSpace(input.PaddleProductID)
		p.MonthlyPriceID = strings.TrimSpace(input.MonthlyPriceID)
		p.YearlyPriceID = strings.TrimSpace(input.YearlyPriceID)
		if p.MonthlyAmount == 0 {
			if !p.IsFree() {
				return nil, fmt.Errorf("%w: free products must not have Paddle prices", types.ErrMarketplaceInvalid)
			}
		} else {
			if s.gateway == nil {
				return nil, fmt.Errorf("paddle catalog verification is unavailable")
			}
			if err := s.gateway.ValidateCatalog(ctx, p); err != nil {
				return nil, err
			}
		}
		cfg, err := marketplaceReviewedConfig(agent, ids)
		if err != nil {
			return nil, err
		}
		p.PublishedTenantID = tenant
		p.PlatformAgentID = agent.ID
		p.PlatformKnowledgeBaseIDs = types.StringArray(ids)
		p.AgentSnapshot = cfg
		p.AgentName = agent.Name
		p.KnowledgeBaseNames = types.StringArray(names)
		p.Status = "published"
	case "reject":
		if p.Status != "pending" {
			return nil, types.ErrMarketplaceConflict
		}
		p.Status = "rejected"
	case "unpublish":
		if p.Status != "published" {
			return nil, types.ErrMarketplaceConflict
		}
		p.Status = "unpublished"
	default:
		return nil, types.ErrMarketplaceInvalid
	}
	if len(input.ReviewNote) > 4000 {
		return nil, types.ErrMarketplaceInvalid
	}
	p.ReviewNote = strings.TrimSpace(input.ReviewNote)
	p.ReviewedBy = user
	now := time.Now().UTC()
	p.ReviewedAt = &now
	if input.Featured != nil {
		p.Featured = *input.Featured
	}
	if input.Fixture != nil {
		p.Fixture = *input.Fixture
	}
	if err := s.repo.SaveProduct(ctx, p, expected); err != nil {
		return nil, err
	}
	return p, nil
}

func (s *marketplaceService) projectProduct(
	ctx context.Context,
	p *types.MarketplaceProduct,
	manage bool,
) (*types.MarketplaceProduct, error) {
	out := *p
	// Curated answers belong to the lazy preview response, never catalog cards.
	out.SampleConversations = nil
	out.CheckoutAvailable = s.gateway != nil && s.gateway.Config().Configured && p.Status == "published" &&
		p.MonthlyPriceID != "" &&
		p.YearlyPriceID != ""
	if !manage {
		out.Contact = ""
		out.Authorization = ""
		out.AuthorizationConfirmed = false
		out.ReviewNote = ""
		out.ReviewedAt = nil
		if p.PublishedTenantID != 0 {
			out.AgentID = p.PlatformAgentID
			out.KnowledgeBaseIDs = append(types.StringArray{}, p.PlatformKnowledgeBaseIDs...)
		}
		out.PlatformAgentID = ""
		out.PlatformKnowledgeBaseIDs = nil
	}
	out.Access = &types.MarketplaceProductAccess{}
	tenant, ok := types.TenantIDFromContext(ctx)
	if !ok || tenant == 0 {
		return &out, nil
	}
	if p.IsFree() {
		out.Access.CanChat = p.Status == "published" && p.PublishedTenantID != 0 &&
			p.PlatformAgentID != "" && len(p.PlatformKnowledgeBaseIDs) > 0
		out.Access.Status = "free"
		return &out, nil
	}
	sub, err := s.repo.CurrentSubscription(ctx, tenant, p.ID)
	if errors.Is(err, types.ErrMarketplaceNotFound) {
		return &out, nil
	}
	if err != nil {
		return nil, err
	}
	out.Access = &types.MarketplaceProductAccess{
		CanChat:           sub.HasAccess(time.Now().UTC()) && p.PublishedTenantID != 0,
		PortalAvailable:   s.portalAvailable(sub),
		SubscriptionID:    sub.ID,
		Status:            sub.Status,
		PaidThrough:       sub.PaidThrough,
		CancelAtPeriodEnd: sub.CancelAtPeriodEnd,
	}
	// Match the durable checkout fence: a refund revokes access without ending
	// the provider subscription. Only canceled/failed rows allow a replacement.
	if sub.PaddleSubscriptionID != "" && sub.Status != "canceled" && sub.Status != "failed" {
		out.CheckoutAvailable = false
	}
	return &out, nil
}

func (s *marketplaceService) ListProducts(
	ctx context.Context,
	q interfaces.MarketplaceCatalogQuery,
	creator, admin bool,
) ([]*types.MarketplaceProduct, int64, error) {
	tenant, user, err := marketplaceActor(ctx)
	if err != nil {
		return nil, 0, err
	}
	q.CreatorTenantID = 0
	q.CreatorUserID = ""
	q.PublishedOnly = true
	if admin {
		if !types.IsSystemAdminFromContext(ctx) {
			return nil, 0, types.ErrMarketplaceForbidden
		}
		q.PublishedOnly = false
	} else if creator {
		q.CreatorTenantID = tenant
		q.CreatorUserID = user
		q.PublishedOnly = false
	}
	products, total, err := s.repo.ListProducts(ctx, q)
	if err != nil {
		return nil, 0, err
	}
	for i, p := range products {
		projected, err := s.projectProduct(ctx, p, creator || admin)
		if err != nil {
			return nil, 0, err
		}
		products[i] = projected
	}
	return products, total, nil
}

func (s *marketplaceService) GetProduct(ctx context.Context, id string) (*types.MarketplaceProduct, error) {
	tenant, user, err := marketplaceActor(ctx)
	if err != nil {
		return nil, err
	}
	p, err := s.repo.GetProduct(ctx, id)
	if err != nil {
		return nil, err
	}
	manage := types.IsSystemAdminFromContext(ctx) || (p.CreatorTenantID == tenant && p.CreatorUserID == user)
	projected, err := s.projectProduct(ctx, p, manage && p.Status != "published")
	if err != nil {
		return nil, err
	}
	if p.Status != "published" && !manage && (projected.Access == nil || !projected.Access.CanChat) {
		return nil, types.ErrMarketplaceNotFound
	}
	if types.IsSystemAdminFromContext(ctx) {
		projected.SampleConversations = append([]types.MarketplaceExample{}, p.SampleConversations...)
	}
	return projected, nil
}

func (s *marketplaceService) AuthorizeAccess(
	ctx context.Context,
	tenantID uint64,
	productID string,
	at time.Time,
) (*types.MarketplaceAccess, error) {
	actorTenant, _, err := marketplaceActor(ctx)
	if err != nil || actorTenant != tenantID {
		return nil, types.ErrMarketplaceForbidden
	}
	p, err := s.repo.GetProduct(ctx, productID)
	if err != nil {
		return nil, err
	}
	subscriptionID := ""
	if p.IsFree() {
		if p.Status != "published" {
			return nil, types.ErrMarketplaceForbidden
		}
	} else {
		sub, err := s.repo.CurrentSubscription(ctx, tenantID, productID)
		if err != nil {
			if errors.Is(err, types.ErrMarketplaceNotFound) {
				return nil, types.ErrMarketplaceForbidden
			}
			return nil, err
		}
		if !sub.HasAccess(at) {
			return nil, types.ErrMarketplaceForbidden
		}
		subscriptionID = sub.ID
	}
	if p.PublishedTenantID == 0 || p.PlatformAgentID == "" ||
		len(p.PlatformKnowledgeBaseIDs) == 0 {
		return nil, types.ErrMarketplaceForbidden
	}
	// Unlisting stops new sales; existing paid buyers keep the reviewed service
	// through their term. The platform, not the submitter, owns these assets.
	for _, id := range p.PlatformKnowledgeBaseIDs {
		kb, err := s.knowledgeBases.GetKnowledgeBaseByID(ctx, id)
		if err != nil {
			return nil, fmt.Errorf("published knowledge is temporarily unavailable: %w", err)
		}
		if kb == nil || kb.TenantID != p.PublishedTenantID {
			return nil, types.ErrMarketplaceForbidden
		}
	}
	raw, err := json.Marshal(p.AgentSnapshot)
	if err != nil {
		return nil, err
	}
	var cfg types.CustomAgentConfig
	if err = json.Unmarshal(raw, &cfg); err != nil {
		return nil, err
	}
	agent := &types.CustomAgent{
		ID:          p.PlatformAgentID,
		TenantID:    p.PublishedTenantID,
		Name:        p.AgentName,
		Description: p.Description,
		Config:      cfg,
	}
	return &types.MarketplaceAccess{
		ProductID:        p.ID,
		SourceTenantID:   p.PublishedTenantID,
		Agent:            agent,
		KnowledgeBaseIDs: append([]string{}, p.PlatformKnowledgeBaseIDs...),
		SubscriptionID:   subscriptionID,
		DefaultModelID:   p.DefaultModelID,
	}, nil
}

func (s *marketplaceService) Orders(ctx context.Context) (*types.MarketplaceOrders, error) {
	tenant, _, err := marketplaceActor(ctx)
	if err != nil {
		return nil, err
	}
	orders, err := s.repo.ListOrders(ctx, tenant)
	if err != nil {
		return nil, err
	}
	now := time.Now().UTC()
	for _, sub := range orders.Subscriptions {
		sub.CanChat = sub.HasAccess(now)
		sub.PortalAvailable = s.portalAvailable(sub)
	}
	return orders, nil
}

func validMarketplaceOperationKey(key string) bool {
	if len(key) < 16 || len(key) > 128 {
		return false
	}
	for _, r := range key {
		if (r < 'a' || r > 'z') && (r < 'A' || r > 'Z') && (r < '0' || r > '9') && r != '-' && r != '_' && r != '.' {
			return false
		}
	}
	return true
}

func (s *marketplaceService) Checkout(
	ctx context.Context,
	productID, period, key string,
) (*types.MarketplaceCheckout, error) {
	tenant, user, err := marketplaceActor(ctx)
	if err != nil {
		return nil, err
	}
	if (period != "monthly" && period != "yearly") || !validMarketplaceOperationKey(key) {
		return nil, types.ErrMarketplaceInvalid
	}
	p, err := s.repo.GetProduct(ctx, productID)
	if err != nil {
		return nil, err
	}
	if p.Status != "published" {
		return nil, types.ErrMarketplaceNotFound
	}
	if p.IsFree() {
		return nil, fmt.Errorf("%w: free products do not require checkout", types.ErrMarketplaceInvalid)
	}
	if s.gateway == nil || !s.gateway.Config().Configured {
		return nil, fmt.Errorf("paddle checkout is unavailable")
	}
	if err := s.gateway.ValidateCatalog(ctx, p); err != nil {
		return nil, err
	}
	price, amount := p.MonthlyPriceID, p.MonthlyAmount
	if period == "yearly" {
		price = p.YearlyPriceID
		amount = p.YearlyAmount
	}
	candidate := &types.MarketplaceSubscription{
		ID:            uuid.NewString(),
		TenantID:      tenant,
		UserID:        user,
		ProductID:     p.ID,
		ProductTitle:  p.Title,
		OperationKey:  key,
		BillingPeriod: period,
		PriceID:       price,
		Currency:      p.Currency,
		Amount:        amount,
		Status:        "pending",
	}
	if s.entitlements != nil {
		membership, err := s.entitlements.Current(ctx, time.Now())
		if err != nil {
			return nil, err
		}
		if membership != nil {
			candidate.PaddleCustomerID = membership.PaddleCustomerID
		}
	}
	if candidate.PaddleCustomerID == "" {
		orders, err := s.repo.ListOrders(ctx, tenant)
		if err != nil {
			return nil, err
		}
		for _, sub := range orders.Subscriptions {
			if sub.PaddleCustomerID != "" {
				candidate.PaddleCustomerID = sub.PaddleCustomerID
				break
			}
		}
	}
	sub, _, err := s.repo.ClaimCheckout(ctx, candidate)
	if err != nil {
		return nil, err
	}
	if sub.BillingPeriod != period || sub.PriceID != price {
		if sub.OperationKey == key || sub.PaddleSubscriptionID != "" {
			return nil, fmt.Errorf("%w: manage the existing product subscription", types.ErrMarketplaceConflict)
		}
		switch sub.Status {
		case "pending", "checkout_created":
		case "in_flight", "uncertain":
			if time.Since(sub.UpdatedAt) < 2*time.Minute {
				return nil, fmt.Errorf("%w: checkout is being prepared; retry shortly", types.ErrMarketplaceConflict)
			}
		default:
			return nil, fmt.Errorf("%w: manage the existing product subscription", types.ErrMarketplaceConflict)
		}
		// An unsent pending operation can be released only if its provider write
		// has not won the CAS. All other operations require confirmed provider
		// cancellation, including recovery of a previously unknown write.
		if sub.Status != "pending" || sub.CheckoutTransactionID != "" {
			if err := s.gateway.CancelCheckout(ctx, sub); err != nil {
				return nil, err
			}
		}
		released, err := s.repo.UpdateCheckout(
			ctx,
			sub.ID,
			[]string{sub.Status},
			"failed",
			"",
			"replaced unpaid checkout",
		)
		if err != nil {
			return nil, err
		}
		if !released {
			return nil, fmt.Errorf("%w: checkout changed while switching billing period", types.ErrMarketplaceConflict)
		}
		sub, _, err = s.repo.ClaimCheckout(ctx, candidate)
		if err != nil {
			return nil, err
		}
		if sub.BillingPeriod != period || sub.PriceID != price {
			return nil, fmt.Errorf("%w: another billing selection is being prepared", types.ErrMarketplaceConflict)
		}
	}
	if sub.Status != "pending" && sub.Status != "in_flight" && sub.Status != "uncertain" &&
		sub.Status != "checkout_created" {
		return nil, fmt.Errorf("%w: manage the existing product subscription", types.ErrMarketplaceConflict)
	}
	if sub.CheckoutTransactionID != "" {
		recovered, err := s.gateway.RecoverCheckout(ctx, sub)
		if err != nil {
			return nil, err
		}
		if recovered == nil {
			return nil, fmt.Errorf("paddle checkout could not be recovered")
		}
		switch recovered.Status {
		case "draft", "ready", "past_due":
			return &types.MarketplaceCheckout{
				MarketplaceCheckoutConfig: s.gateway.Config(),
				TransactionID:             recovered.TransactionID,
				SubscriptionID:            sub.ID,
			}, nil
		case "canceled":
			_, err = s.repo.UpdateCheckout(
				ctx,
				sub.ID,
				[]string{"pending", "in_flight", "uncertain", "checkout_created"},
				"failed",
				recovered.TransactionID,
				"",
			)
			if err != nil {
				return nil, err
			}
			return nil, fmt.Errorf(
				"%w: checkout was canceled; retry with a new operation key",
				types.ErrMarketplaceConflict,
			)
		default:
			return nil, fmt.Errorf("%w: payment is processing", types.ErrMarketplaceConflict)
		}
	}
	if sub.Status == "in_flight" || sub.Status == "uncertain" {
		if time.Since(sub.UpdatedAt) < 2*time.Minute {
			return nil, fmt.Errorf("%w: checkout is being prepared; retry shortly", types.ErrMarketplaceConflict)
		}
		recovered, err := s.gateway.RecoverCheckout(ctx, sub)
		if err != nil {
			return nil, err
		}
		// An empty inventory result cannot prove that a timed-out write failed.
		// Keep the fence and allow another recovery attempt; never blindly rebill.
		if recovered == nil {
			return nil, fmt.Errorf("paddle checkout recovery is pending")
		}
		status := "checkout_created"
		if recovered.Status == "canceled" {
			status = "failed"
		}
		changed, err := s.repo.UpdateCheckout(
			ctx,
			sub.ID,
			[]string{"in_flight", "uncertain"},
			status,
			recovered.TransactionID,
			"",
		)
		if err != nil {
			return nil, err
		}
		if !changed || (recovered.Status != "draft" && recovered.Status != "ready" && recovered.Status != "past_due") {
			return nil, fmt.Errorf("%w: recovered payment is processing or canceled", types.ErrMarketplaceConflict)
		}
		return &types.MarketplaceCheckout{
			MarketplaceCheckoutConfig: s.gateway.Config(),
			TransactionID:             recovered.TransactionID,
			SubscriptionID:            sub.ID,
		}, nil
	}
	started, err := s.repo.UpdateCheckout(ctx, sub.ID, []string{"pending"}, "in_flight", "", "")
	if err != nil {
		return nil, err
	}
	if !started {
		return nil, fmt.Errorf("%w: checkout is being prepared", types.ErrMarketplaceConflict)
	}
	transactionID, providerErr := s.gateway.CreateCheckout(ctx, sub)
	if providerErr != nil {
		status := "uncertain"
		if errors.Is(providerErr, types.ErrMarketplaceCheckoutRejected) {
			status = "failed"
		}
		_, saveErr := s.repo.UpdateCheckout(
			ctx,
			sub.ID,
			[]string{"in_flight"},
			status,
			"",
			"Paddle checkout creation needs reconciliation",
		)
		if saveErr != nil {
			return nil, saveErr
		}
		return nil, providerErr
	}
	_, err = s.repo.UpdateCheckout(
		ctx, sub.ID, []string{"in_flight", "uncertain"}, "checkout_created", transactionID, "",
	)
	if err != nil {
		return nil, err
	}
	return &types.MarketplaceCheckout{
		MarketplaceCheckoutConfig: s.gateway.Config(),
		TransactionID:             transactionID,
		SubscriptionID:            sub.ID,
	}, nil
}

func (s *marketplaceService) Portal(ctx context.Context, id string) (string, error) {
	tenant, _, err := marketplaceActor(ctx)
	if err != nil {
		return "", err
	}
	sub, err := s.repo.GetSubscription(ctx, id)
	if err != nil {
		return "", err
	}
	if sub.TenantID != tenant {
		return "", types.ErrMarketplaceForbidden
	}
	if !s.portalAvailable(sub) {
		return "", types.ErrMarketplaceConflict
	}
	return s.gateway.CreatePortal(ctx, sub)
}

func (s *marketplaceService) portalAvailable(sub *types.MarketplaceSubscription) bool {
	return s.gateway != nil && s.gateway.Config().PortalConfigured && sub != nil && sub.PaddleCustomerID != "" &&
		sub.PaddleSubscriptionID != ""
}

// Called only after the account's durable deletion fence. Checkout claims and
// provider-write starts lock that same user row, so no new write can escape
// this complete inventory. An already running write remains recoverable.
func (s *marketplaceService) PrepareAccountDeletion(ctx context.Context, tenantID uint64) error {
	rows, err := s.repo.ListBillingSubscriptions(ctx, tenantID)
	if err != nil {
		return err
	}
	for _, sub := range rows {
		if sub.PaddleSubscriptionID != "" || sub.Status == "failed" || sub.Status == "canceled" {
			continue // Bound subscriptions are handled by the existing billing guard.
		}
		if sub.Status != "pending" || sub.CheckoutTransactionID != "" {
			if sub.CheckoutTransactionID == "" && time.Since(sub.UpdatedAt) < 2*time.Minute {
				return fmt.Errorf("marketplace checkout write is still being reconciled")
			}
			if s.gateway == nil {
				return fmt.Errorf("marketplace checkout cancellation is unavailable")
			}
			if err := s.gateway.CancelCheckout(ctx, sub); err != nil {
				return err
			}
		}
		changed, err := s.repo.UpdateCheckout(
			ctx,
			sub.ID,
			[]string{"pending", "in_flight", "uncertain", "checkout_created"},
			"failed",
			"",
			"account deletion canceled unpaid checkout",
		)
		if err != nil {
			return err
		}
		if !changed {
			return fmt.Errorf("marketplace checkout changed during account deletion; retry")
		}
	}
	return nil
}

func (s *marketplaceService) EnsureAccountTerminal(ctx context.Context, tenantID uint64) error {
	rows, err := s.repo.ListBillingSubscriptions(ctx, tenantID)
	if err != nil {
		return err
	}
	for _, sub := range rows {
		if sub.PaddleSubscriptionID == "" && sub.Status != "failed" && sub.Status != "canceled" {
			return fmt.Errorf("marketplace checkout is not terminal")
		}
	}
	return nil
}

func (s *marketplaceService) GetBillingSubscription(
	ctx context.Context,
	id string,
) (*types.MarketplaceSubscription, error) {
	return s.repo.GetSubscription(ctx, id)
}

func (s *marketplaceService) ResolveBillingSubscription(
	ctx context.Context,
	providerID, transactionID string,
) (*types.MarketplaceSubscription, error) {
	return s.repo.ResolveSubscription(ctx, providerID, transactionID)
}

func (s *marketplaceService) ProcessBillingEvent(
	ctx context.Context,
	event types.MarketplaceBillingEvent,
) (bool, error) {
	return s.repo.ApplyBillingEvent(ctx, event)
}
