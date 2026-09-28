package interfaces

import (
	"context"
	"time"

	"github.com/Tencent/WeKnora/internal/types"
)

// MarketplaceCatalogQuery scopes and pages catalog or submission listings.
type MarketplaceCatalogQuery struct {
	CreatorUserID           string
	Query, Category, Status string
	CreatorTenantID         uint64
	PublishedOnly           bool
	Limit, Offset           int
}

// MarketplaceRepository persists catalog, subscription, invoice and event state.
type MarketplaceRepository interface {
	ListProducts(context.Context, MarketplaceCatalogQuery) ([]*types.MarketplaceProduct, int64, error)
	GetProduct(context.Context, string) (*types.MarketplaceProduct, error)
	PreviewDirectory(context.Context, uint64, []string) ([]types.MarketplaceDirectoryEntry, error)
	SaveProduct(context.Context, *types.MarketplaceProduct, time.Time) error
	ClaimCheckout(context.Context, *types.MarketplaceSubscription) (*types.MarketplaceSubscription, bool, error)
	GetSubscription(context.Context, string) (*types.MarketplaceSubscription, error)
	CurrentSubscription(context.Context, uint64, string) (*types.MarketplaceSubscription, error)
	ResolveSubscription(context.Context, string, string) (*types.MarketplaceSubscription, error)
	UpdateCheckout(context.Context, string, []string, string, string, string) (bool, error)
	ListOrders(context.Context, uint64) (*types.MarketplaceOrders, error)
	ListBillingSubscriptions(context.Context, uint64) ([]*types.MarketplaceSubscription, error)
	ApplyBillingEvent(context.Context, types.MarketplaceBillingEvent) (bool, error)
}

// MarketplacePaymentGateway owns Paddle's catalog verification, checkout inventory recovery,
// and portal implementation; application callers never coordinate SDK details.
type MarketplacePaymentGateway interface {
	Config() types.MarketplaceCheckoutConfig
	ValidateCatalog(context.Context, *types.MarketplaceProduct) error
	CreateCheckout(context.Context, *types.MarketplaceSubscription) (string, error)
	RecoverCheckout(context.Context, *types.MarketplaceSubscription) (*types.MarketplaceCheckoutRecovery, error)
	CancelCheckout(context.Context, *types.MarketplaceSubscription) error
	CreatePortal(context.Context, *types.MarketplaceSubscription) (string, error)
}

// MarketplaceService coordinates publication, purchase and buyer authorization.
type MarketplaceService interface {
	ListProducts(context.Context, MarketplaceCatalogQuery, bool, bool) ([]*types.MarketplaceProduct, int64, error)
	GetProduct(context.Context, string) (*types.MarketplaceProduct, error)
	Preview(context.Context, string) (*types.MarketplacePreview, error)
	SaveProduct(context.Context, string, types.MarketplaceProductInput, bool) (*types.MarketplaceProduct, error)
	SubmitProduct(context.Context, string) (*types.MarketplaceProduct, error)
	ReviewProduct(context.Context, string, types.MarketplaceReviewInput) (*types.MarketplaceProduct, error)
	Orders(context.Context) (*types.MarketplaceOrders, error)
	Library(context.Context) ([]*types.MarketplaceLibraryEntry, error)
	Checkout(context.Context, string, string, string) (*types.MarketplaceCheckout, error)
	Portal(context.Context, string) (string, error)
	AuthorizeAccess(context.Context, uint64, string, time.Time) (*types.MarketplaceAccess, error)
	GetBillingSubscription(context.Context, string) (*types.MarketplaceSubscription, error)
	ResolveBillingSubscription(context.Context, string, string) (*types.MarketplaceSubscription, error)
	ProcessBillingEvent(context.Context, types.MarketplaceBillingEvent) (bool, error)
	PrepareAccountDeletion(context.Context, uint64) error
	EnsureAccountTerminal(context.Context, uint64) error
}
