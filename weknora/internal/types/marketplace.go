package types

import (
	"errors"
	"strings"
	"time"
)

const (
	// MarketplaceDefaultModelID is the built-in model used for reviewed products.
	MarketplaceDefaultModelID = CheapestChatModelID
	// TypeMarketplaceWebhook identifies verified marketplace billing tasks.
	TypeMarketplaceWebhook = "creator_marketplace:webhook"
)

// Marketplace errors distinguish invalid input, authorization and retryable conflicts.
var (
	ErrMarketplaceCheckoutRejected = errors.New("paddle checkout was rejected before creation")
	ErrMarketplaceNotFound         = errors.New("marketplace resource not found")
	ErrMarketplaceForbidden        = errors.New("marketplace access denied")
	ErrMarketplaceConflict         = errors.New("marketplace state conflicts with this operation")
	ErrMarketplaceInvalid          = errors.New("invalid marketplace request")
)

// MarketplaceProduct is the reviewed catalog entry. Source configuration is
// internal; buyer responses never serialize prompts, credentials or tenant IDs.
type MarketplaceProduct struct {
	CheckoutAvailable bool   `json:"checkout_available" gorm:"-"`
	ID                string `json:"id" gorm:"type:varchar(36);primaryKey"`
	CreatorTenantID   uint64 `json:"-" gorm:"not null;index"`
	CreatorUserID     string `json:"-" gorm:"type:varchar(36);not null"`
	CreatorName       string `json:"-" gorm:"type:varchar(255)"`
	Contact           string `json:"contact,omitempty" gorm:"type:text"`
	Authorization     string `json:"authorization,omitempty" gorm:"type:text"`

	AuthorizationConfirmed bool `json:"authorization_confirmed,omitempty" gorm:"not null;default:false"`

	PublishedTenantID uint64 `json:"-" gorm:"not null;default:0"`
	PlatformAgentID   string `json:"platform_agent_id,omitempty" gorm:"type:varchar(36)"`

	PlatformKnowledgeBaseIDs StringArray `json:"platform_knowledge_base_ids,omitempty" gorm:"type:json;not null"`

	Title              string                    `json:"title" gorm:"type:varchar(160);not null"`
	Description        string                    `json:"description" gorm:"type:text"`
	Category           string                    `json:"category" gorm:"type:varchar(64);index"`
	CoverURL           string                    `json:"cover_url" gorm:"type:text"`
	AgentID            string                    `json:"agent_id" gorm:"type:varchar(36);not null"`
	AgentName          string                    `json:"agent_name" gorm:"type:varchar(255)"`
	KnowledgeBaseIDs   StringArray               `json:"knowledge_base_ids" gorm:"type:json;not null"`
	KnowledgeBaseNames StringArray               `json:"knowledge_base_names" gorm:"type:json;not null"`
	SampleQuestions    StringArray               `json:"sample_questions" gorm:"type:json;not null"`
	AgentSnapshot      CustomAgentConfig         `json:"-" gorm:"type:json;not null"`
	DefaultModelID     string                    `json:"default_model_id" gorm:"type:varchar(128);not null"`
	Currency           string                    `json:"currency" gorm:"type:varchar(3);not null"`
	MonthlyAmount      int64                     `json:"monthly_amount" gorm:"not null"`
	YearlyAmount       int64                     `json:"yearly_amount" gorm:"not null"`
	PaddleProductID    string                    `json:"paddle_product_id,omitempty" gorm:"type:varchar(64)"`
	MonthlyPriceID     string                    `json:"monthly_price_id,omitempty" gorm:"type:varchar(64);index"`
	YearlyPriceID      string                    `json:"yearly_price_id,omitempty" gorm:"type:varchar(64);index"`
	Status             string                    `json:"status" gorm:"type:varchar(24);not null;index"`
	Featured           bool                      `json:"featured" gorm:"not null;default:false"`
	Fixture            bool                      `json:"fixture" gorm:"not null;default:false"`
	ReviewNote         string                    `json:"review_note,omitempty" gorm:"type:text"`
	ReviewedBy         string                    `json:"-" gorm:"type:varchar(36)"`
	ReviewedAt         *time.Time                `json:"reviewed_at,omitempty"`
	CreatedAt          time.Time                 `json:"created_at"`
	UpdatedAt          time.Time                 `json:"updated_at"`
	Access             *MarketplaceProductAccess `json:"access,omitempty" gorm:"-"`

	//nolint:lll // Keep the complete JSON and GORM column contract together.
	SampleConversations []MarketplaceExample `json:"sample_conversations,omitempty" gorm:"serializer:json;type:json;not null;default:'[]'"`
}

// IsFree reports whether the product has no purchase price or payment binding.
func (p MarketplaceProduct) IsFree() bool {
	return p.MonthlyAmount == 0 && p.YearlyAmount == 0 && p.PaddleProductID == "" &&
		p.MonthlyPriceID == "" && p.YearlyPriceID == ""
}

// MarketplaceProductAccess is the buyer's current access and management projection.
type MarketplaceProductAccess struct {
	PortalAvailable   bool       `json:"portal_available"`
	CanChat           bool       `json:"can_chat"`
	SubscriptionID    string     `json:"subscription_id,omitempty"`
	Status            string     `json:"status,omitempty"`
	PaidThrough       *time.Time `json:"paid_through,omitempty"`
	CancelAtPeriodEnd bool       `json:"cancel_at_period_end"`
}

// MarketplaceLibraryEntry exposes a purchased knowledge base and agent without
// source configuration. CanChat authorizes the product; CanRead also requires the KB.
type MarketplaceLibraryEntry struct {
	ProductID         string     `json:"product_id"`
	ProductTitle      string     `json:"product_title"`
	AgentID           string     `json:"agent_id"`
	AgentName         string     `json:"agent_name"`
	KnowledgeBaseID   string     `json:"knowledge_base_id"`
	Name              string     `json:"name"`
	Description       string     `json:"description"`
	WikiEnabled       bool       `json:"wiki_enabled"`
	CanRead           bool       `json:"can_read"`
	CanChat           bool       `json:"can_chat"`
	Status            string     `json:"status"`
	PaidThrough       *time.Time `json:"paid_through,omitempty"`
	CancelAtPeriodEnd bool       `json:"cancel_at_period_end"`
}

// MarketplaceProductInput contains editable submission fields.
type MarketplaceProductInput struct {
	Title                  string   `json:"title"`
	Description            string   `json:"description"`
	Category               string   `json:"category"`
	CoverURL               string   `json:"cover_url"`
	AgentID                string   `json:"agent_id"`
	KnowledgeBaseIDs       []string `json:"knowledge_base_ids"`
	DefaultModelID         string   `json:"default_model_id"`
	Currency               string   `json:"currency"`
	MonthlyAmount          int64    `json:"monthly_amount"`
	SampleQuestions        []string `json:"sample_questions"`
	Contact                string   `json:"contact"`
	Authorization          string   `json:"authorization"`
	AuthorizationConfirmed bool     `json:"authorization_confirmed"`

	// Nil preserves the curated examples; only platform administrators may replace them.
	SampleConversations *[]MarketplaceExample `json:"sample_conversations,omitempty"`
}

// MarketplaceExample is an explicitly curated public copy, never a live chat reference.
type MarketplaceExample struct {
	Question string `json:"question"`
	Answer   string `json:"answer"`
}

// MarketplaceDirectoryEntry deliberately contains no Wiki body, summary or source references.
type MarketplaceDirectoryEntry struct {
	ID       string   `json:"id"`
	Title    string   `json:"title"`
	Path     []string `json:"path"`
	PageType string   `json:"page_type"`
}

// MarketplacePreview exposes the reviewed directory and curated final answers.
type MarketplacePreview struct {
	Directory []MarketplaceDirectoryEntry `json:"directory"`
	Examples  []MarketplaceExample        `json:"examples"`
}

// MarketplaceCheckoutConfig exposes checkout settings and internal portal readiness.
type MarketplaceCheckoutConfig struct {
	PortalConfigured bool   `json:"-"`
	Environment      string `json:"environment"`
	ClientToken      string `json:"client_token"`
	Configured       bool   `json:"configured"`
}

// MarketplaceCheckout identifies one server-created checkout transaction.
type MarketplaceCheckout struct {
	MarketplaceCheckoutConfig
	TransactionID  string `json:"transaction_id"`
	SubscriptionID string `json:"subscription_id"`
}

// MarketplaceCheckoutRecovery describes an exact provider transaction found during recovery.
type MarketplaceCheckoutRecovery struct {
	TransactionID string
	Status        string
}

// MarketplaceReviewInput binds a reviewed submission to platform assets and Paddle prices.
type MarketplaceReviewInput struct {
	Action                   string   `json:"action"`
	PaddleProductID          string   `json:"paddle_product_id"`
	MonthlyPriceID           string   `json:"monthly_price_id"`
	YearlyPriceID            string   `json:"yearly_price_id"`
	ReviewNote               string   `json:"review_note"`
	Featured                 *bool    `json:"featured,omitempty"`
	Fixture                  *bool    `json:"fixture,omitempty"`
	PlatformAgentID          string   `json:"platform_agent_id"`
	PlatformKnowledgeBaseIDs []string `json:"platform_knowledge_base_ids"`
}

// MarketplaceSubscription owns one product subscription and its initial checkout. Its immutable
// price snapshot lets existing subscriptions renew after a catalog price edit.
type MarketplaceSubscription struct {
	ID           string `json:"id" gorm:"type:varchar(36);primaryKey"`
	TenantID     uint64 `json:"-" gorm:"not null;index;uniqueIndex:ux_marketplace_checkout_key"`
	UserID       string `json:"-" gorm:"type:varchar(36);not null"`
	ProductID    string `json:"product_id" gorm:"type:varchar(36);not null;index"`
	ProductTitle string `json:"product_title" gorm:"type:varchar(160);not null"`

	OperationKey string `json:"-" gorm:"type:varchar(128);not null;uniqueIndex:ux_marketplace_checkout_key"`

	BillingPeriod         string     `json:"billing_period" gorm:"type:varchar(16);not null"`
	PriceID               string     `json:"price_id" gorm:"type:varchar(64);not null"`
	Currency              string     `json:"currency" gorm:"type:varchar(3);not null"`
	Amount                int64      `json:"amount" gorm:"not null"`
	Status                string     `json:"status" gorm:"type:varchar(24);not null;index"`
	PaddleCustomerID      string     `json:"-" gorm:"type:varchar(64);index"`
	PaddleSubscriptionID  string     `json:"-" gorm:"type:varchar(64);index"`
	CheckoutTransactionID string     `json:"-" gorm:"type:varchar(64);index"`
	PaidThrough           *time.Time `json:"paid_through,omitempty"`
	CancelAtPeriodEnd     bool       `json:"cancel_at_period_end" gorm:"not null;default:false"`
	ScheduledChangeAt     *time.Time `json:"scheduled_change_at,omitempty"`
	LastEventID           string     `json:"-" gorm:"type:varchar(64)"`
	LastEventAt           *time.Time `json:"-"`
	LastPaymentAt         *time.Time `json:"-"`
	LastError             string     `json:"-" gorm:"type:text"`
	CreatedAt             time.Time  `json:"created_at"`
	UpdatedAt             time.Time  `json:"updated_at"`
	CanChat               bool       `json:"can_chat" gorm:"-"`
	PortalAvailable       bool       `json:"portal_available" gorm:"-"`
}

// HasAccess reports whether the subscription has a usable paid term at the given instant.
func (s MarketplaceSubscription) HasAccess(at time.Time) bool {
	return (s.Status == "active" || s.Status == "past_due") && s.PaidThrough != nil && s.PaidThrough.After(at.UTC())
}

// MarketplaceTransaction is the provider-confirmed invoice/receipt history.
// It is also the authoritative link from adjustments to their purchased term.
type MarketplaceTransaction struct {
	ID             string     `json:"id" gorm:"type:varchar(64);primaryKey"`
	TenantID       uint64     `json:"-" gorm:"not null;index"`
	SubscriptionID string     `json:"subscription_id" gorm:"type:varchar(36);not null;index"`
	ProductID      string     `json:"product_id" gorm:"type:varchar(36);not null;index"`
	ProductTitle   string     `json:"product_title" gorm:"type:varchar(160)"`
	Status         string     `json:"status" gorm:"type:varchar(24);not null"`
	Currency       string     `json:"currency" gorm:"type:varchar(3)"`
	Amount         string     `json:"amount" gorm:"type:varchar(32)"`
	BillingPeriod  string     `json:"billing_period" gorm:"type:varchar(16)"`
	PeriodStartsAt *time.Time `json:"period_starts_at,omitempty"`
	PeriodEndsAt   *time.Time `json:"period_ends_at,omitempty"`
	OccurredAt     time.Time  `json:"occurred_at"`
	LastEventAt    time.Time  `json:"-"`
	CreatedAt      time.Time  `json:"created_at"`
	UpdatedAt      time.Time  `json:"updated_at"`
}

// MarketplaceOrders combines product subscriptions and confirmed invoices for one buyer.
type MarketplaceOrders struct {
	Subscriptions            []*MarketplaceSubscription `json:"subscriptions"`
	Transactions             []*MarketplaceTransaction  `json:"transactions"`
	MembershipManagementPath string                     `json:"membership_management_path"`
}

// MarketplaceAccess never crosses HTTP. The caller keeps the buyer context for
// sessions and usage, and applies SourceTenantID only to the reviewed retrieval.
type MarketplaceAccess struct {
	ProductID        string
	SourceTenantID   uint64
	Agent            *CustomAgent
	KnowledgeBaseIDs []string
	SubscriptionID   string
	DefaultModelID   string
}

// MarketplaceBillingEvent contains only a verified provider projection, never
// a raw body, signature or checkout binding. Durable processing is per subscription.
type MarketplaceBillingEvent struct {
	ReconciledStatus     string     `json:"reconciled_status,omitempty"`
	EventID              string     `json:"event_id"`
	EventType            string     `json:"event_type"`
	OccurredAt           time.Time  `json:"occurred_at"`
	SubscriptionID       string     `json:"subscription_id"`
	PaddleSubscriptionID string     `json:"paddle_subscription_id"`
	CustomerID           string     `json:"customer_id"`
	TransactionID        string     `json:"transaction_id,omitempty"`
	PriceID              string     `json:"price_id,omitempty"`
	Status               string     `json:"status"`
	Action               string     `json:"action,omitempty"`
	AdjustmentType       string     `json:"adjustment_type,omitempty"`
	Currency             string     `json:"currency,omitempty"`
	Amount               string     `json:"amount,omitempty"`
	PeriodStartsAt       *time.Time `json:"period_starts_at,omitempty"`
	PeriodEndsAt         *time.Time `json:"period_ends_at,omitempty"`
	CancelAtPeriodEnd    bool       `json:"cancel_at_period_end"`
	ScheduledChangeAt    *time.Time `json:"scheduled_change_at,omitempty"`
}

// MarketplaceProcessedEvent deduplicates provider events after durable processing.
type MarketplaceProcessedEvent struct {
	EventID        string `gorm:"type:varchar(64);primaryKey"`
	SubscriptionID string `gorm:"type:varchar(36);not null;index"`
	CreatedAt      time.Time
}

// Validate rejects incomplete events before they enter or leave the billing queue.
func (e MarketplaceBillingEvent) Validate() error {
	if e.EventID == "" || len(e.EventID) > 64 || e.OccurredAt.IsZero() || e.SubscriptionID == "" ||
		e.PaddleSubscriptionID == "" ||
		e.CustomerID == "" {
		return ErrMarketplaceInvalid
	}
	switch {
	case strings.HasPrefix(e.EventType, "subscription."):
		switch e.Status {
		case "active", "past_due", "paused", "canceled":
		default:
			return ErrMarketplaceInvalid
		}
		if e.PriceID == "" {
			return ErrMarketplaceInvalid
		}
	case e.EventType == "transaction.completed":
		if e.TransactionID == "" || e.Status != "completed" || e.PriceID == "" {
			return ErrMarketplaceInvalid
		}
	case e.EventType == "adjustment.created" || e.EventType == "adjustment.updated":
		if e.TransactionID == "" {
			return ErrMarketplaceInvalid
		}
	default:
		return ErrMarketplaceInvalid
	}
	return nil
}
