package service

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"

	paddle "github.com/PaddleHQ/paddle-go-sdk/v5"
	"github.com/google/uuid"
)

var (
	ErrAccountBillingActionRequired       = errors.New("billing action required before account deletion")
	ErrAccountBillingUnavailable          = errors.New("billing state is unavailable")
	ErrAccountIdentityDeletionUnavailable = errors.New("identity deletion is unavailable")
)

type accountBillingGuard interface {
	PrepareAccountDeletion(ctx context.Context, customerID, subscriptionID string) error
	EnsureAccountTerminal(ctx context.Context, customerID, subscriptionID string) error
}

type paddleSubscriptionReader interface {
	GetSubscription(context.Context, *paddle.GetSubscriptionRequest) (*paddle.Subscription, error)
	ListSubscriptions(context.Context, *paddle.ListSubscriptionsRequest) (*paddle.Collection[*paddle.Subscription], error)
	CancelSubscription(context.Context, *paddle.CancelSubscriptionRequest) (*paddle.Subscription, error)
}

type paddleSubscriptionInventory interface {
	Get(ctx context.Context, subscriptionID string) (*paddle.Subscription, error)
	ListByCustomer(ctx context.Context, customerID string) ([]*paddle.Subscription, error)
	Cancel(ctx context.Context, subscriptionID string, effectiveFrom paddle.EffectiveFrom) (*paddle.Subscription, error)
}

type paddleSDKSubscriptionInventory struct {
	reader paddleSubscriptionReader
}

func (i *paddleSDKSubscriptionInventory) Get(ctx context.Context, subscriptionID string) (*paddle.Subscription, error) {
	return i.reader.GetSubscription(ctx, &paddle.GetSubscriptionRequest{SubscriptionID: subscriptionID})
}

func (i *paddleSDKSubscriptionInventory) ListByCustomer(ctx context.Context, customerID string) ([]*paddle.Subscription, error) {
	perPage := 200
	collection, err := i.reader.ListSubscriptions(ctx, &paddle.ListSubscriptionsRequest{
		CustomerID: []string{customerID},
		PerPage:    &perPage,
	})
	if err != nil {
		return nil, err
	}
	if collection == nil {
		return nil, errors.New("Paddle returned no subscription collection")
	}
	var subscriptions []*paddle.Subscription
	if err := collection.IterErr(ctx, func(subscription *paddle.Subscription) error {
		subscriptions = append(subscriptions, subscription)
		return nil
	}); err != nil {
		return nil, err
	}
	return subscriptions, nil
}

func (i *paddleSDKSubscriptionInventory) Cancel(
	ctx context.Context,
	subscriptionID string,
	effectiveFrom paddle.EffectiveFrom,
) (*paddle.Subscription, error) {
	return i.reader.CancelSubscription(ctx, &paddle.CancelSubscriptionRequest{
		SubscriptionID: subscriptionID,
		EffectiveFrom:  &effectiveFrom,
	})
}

type paddleAccountErasureGuard struct {
	subscriptions paddleSubscriptionInventory
	initErr       error
}

func newPaddleAccountErasureGuard(subscriptions paddleSubscriptionInventory) *paddleAccountErasureGuard {
	return &paddleAccountErasureGuard{subscriptions: subscriptions}
}

// NewPaddleAccountErasureGuard uses the same selected Paddle environment and
// file-backed API key as checkout/portal. Account deletion schedules normal
// paid subscriptions to cancel at period end; it never refunds or adjusts a
// transaction.
func NewPaddleAccountErasureGuard() accountBillingGuard {
	environment := strings.ToLower(strings.TrimSpace(os.Getenv("MUSUW_PADDLE_ENVIRONMENT")))
	apiKey := strings.TrimSpace(os.Getenv("MUSUW_PADDLE_API_KEY"))
	guard := &paddleAccountErasureGuard{}
	if apiKey == "" {
		guard.initErr = errors.New("Paddle API key is not configured")
		return guard
	}
	var (
		sdk *paddle.SDK
		err error
	)
	switch environment {
	case "sandbox":
		sdk, err = paddle.NewSandbox(apiKey)
	case "live":
		sdk, err = paddle.New(apiKey)
	default:
		err = errors.New("Paddle environment is not configured")
	}
	if err != nil {
		guard.initErr = err
		return guard
	}
	guard.subscriptions = &paddleSDKSubscriptionInventory{reader: sdk}
	return guard
}

func (g *paddleAccountErasureGuard) PrepareAccountDeletion(ctx context.Context, customerID, subscriptionID string) error {
	subscriptions, err := g.loadSubscriptions(ctx, customerID, subscriptionID)
	if err != nil {
		return err
	}
	type cancellation struct {
		subscriptionID string
		effectiveFrom  paddle.EffectiveFrom
	}
	cancellations := make([]cancellation, 0, len(subscriptions))
	expectedSubscriptionID := subscriptionID
	if strings.TrimSpace(customerID) != "" {
		// Customer inventory is authoritative and may legitimately contain more
		// than the one locally cached subscription coordinate.
		expectedSubscriptionID = ""
	}
	for _, subscription := range subscriptions {
		effectiveFrom, required, err := planPaddleSubscriptionCancellation(subscription, customerID, expectedSubscriptionID)
		if err != nil {
			return err
		}
		if required {
			cancellations = append(cancellations, cancellation{
				subscriptionID: strings.TrimSpace(subscription.ID),
				effectiveFrom:  effectiveFrom,
			})
		}
	}
	// Validate the complete provider inventory before issuing the first write.
	// A retry remains safe if Paddle itself fails after an earlier cancellation:
	// already-scheduled cancellation is an idempotent success on the next read.
	for _, cancellation := range cancellations {
		prepared, err := g.subscriptions.Cancel(ctx, cancellation.subscriptionID, cancellation.effectiveFrom)
		if err != nil {
			return fmt.Errorf("%w: provider subscription cancellation failed", ErrAccountBillingUnavailable)
		}
		if err := validatePaddleCancellationResponse(prepared, cancellation.subscriptionID, cancellation.effectiveFrom); err != nil {
			return err
		}
	}
	return nil
}

func (g *paddleAccountErasureGuard) loadSubscriptions(
	ctx context.Context,
	customerID,
	subscriptionID string,
) ([]*paddle.Subscription, error) {
	customerID = strings.TrimSpace(customerID)
	subscriptionID = strings.TrimSpace(subscriptionID)
	if customerID == "" && subscriptionID == "" {
		return nil, nil
	}
	if g == nil || g.subscriptions == nil {
		return nil, fmt.Errorf("%w: Paddle subscription client is not configured", ErrAccountBillingUnavailable)
	}
	if g.initErr != nil {
		return nil, fmt.Errorf("%w: %v", ErrAccountBillingUnavailable, g.initErr)
	}
	if customerID != "" {
		subscriptions, err := g.subscriptions.ListByCustomer(ctx, customerID)
		if errors.Is(err, paddle.ErrNotFound) {
			return nil, nil
		}
		if err != nil {
			return nil, fmt.Errorf("%w: provider customer subscription read failed", ErrAccountBillingUnavailable)
		}
		return subscriptions, nil
	}
	subscription, err := g.subscriptions.Get(ctx, subscriptionID)
	if errors.Is(err, paddle.ErrNotFound) {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("%w: provider subscription read failed", ErrAccountBillingUnavailable)
	}
	return []*paddle.Subscription{subscription}, nil
}

func planPaddleSubscriptionCancellation(
	subscription *paddle.Subscription,
	expectedCustomerID,
	expectedSubscriptionID string,
) (paddle.EffectiveFrom, bool, error) {
	if subscription == nil {
		return "", false, fmt.Errorf("%w: provider returned no subscription", ErrAccountBillingUnavailable)
	}
	subscriptionID := strings.TrimSpace(subscription.ID)
	if subscriptionID == "" || (strings.TrimSpace(expectedSubscriptionID) != "" && subscriptionID != strings.TrimSpace(expectedSubscriptionID)) {
		return "", false, fmt.Errorf("%w: provider returned mismatched subscription coordinates", ErrAccountBillingUnavailable)
	}
	if expectedCustomerID = strings.TrimSpace(expectedCustomerID); expectedCustomerID != "" &&
		strings.TrimSpace(subscription.CustomerID) != expectedCustomerID {
		return "", false, fmt.Errorf("%w: provider returned mismatched customer coordinates", ErrAccountBillingUnavailable)
	}
	if subscription.Status == paddle.SubscriptionStatusCanceled {
		return "", false, nil
	}
	if subscription.ScheduledChange != nil && subscription.ScheduledChange.Action == paddle.ScheduledChangeActionCancel {
		if !validPaddleScheduledCancellation(subscription.ScheduledChange) {
			return "", false, fmt.Errorf("%w: provider returned an invalid scheduled cancellation", ErrAccountBillingUnavailable)
		}
		return "", false, nil
	}

	var effectiveFrom paddle.EffectiveFrom
	switch subscription.Status {
	case paddle.SubscriptionStatusActive, paddle.SubscriptionStatusTrialing:
		effectiveFrom = paddle.EffectiveFromNextBillingPeriod
	case paddle.SubscriptionStatusPaused:
		effectiveFrom = paddle.EffectiveFromImmediately
	case paddle.SubscriptionStatusPastDue:
		return "", false, ErrAccountBillingActionRequired
	default:
		return "", false, fmt.Errorf("%w: unrecognized subscription status", ErrAccountBillingUnavailable)
	}
	return effectiveFrom, true, nil
}

func validatePaddleCancellationResponse(
	prepared *paddle.Subscription,
	expectedSubscriptionID string,
	effectiveFrom paddle.EffectiveFrom,
) error {
	if prepared == nil || strings.TrimSpace(prepared.ID) != strings.TrimSpace(expectedSubscriptionID) {
		return fmt.Errorf("%w: provider returned mismatched cancellation coordinates", ErrAccountBillingUnavailable)
	}
	if prepared.Status == paddle.SubscriptionStatusCanceled {
		return nil
	}
	if effectiveFrom != paddle.EffectiveFromNextBillingPeriod || !validPaddleScheduledCancellation(prepared.ScheduledChange) {
		return fmt.Errorf("%w: provider did not confirm subscription cancellation", ErrAccountBillingUnavailable)
	}
	return nil
}

func validPaddleScheduledCancellation(change *paddle.SubscriptionScheduledChange) bool {
	if change == nil || change.Action != paddle.ScheduledChangeActionCancel || strings.TrimSpace(change.EffectiveAt) == "" {
		return false
	}
	_, err := time.Parse(time.RFC3339, change.EffectiveAt)
	return err == nil
}

func (g *paddleAccountErasureGuard) EnsureAccountTerminal(ctx context.Context, customerID, subscriptionID string) error {
	customerID = strings.TrimSpace(customerID)
	subscriptionID = strings.TrimSpace(subscriptionID)
	if customerID == "" && subscriptionID == "" {
		return nil
	}
	if g == nil || g.subscriptions == nil {
		return fmt.Errorf("%w: Paddle subscription reader is not configured", ErrAccountBillingUnavailable)
	}
	if g.initErr != nil {
		return fmt.Errorf("%w: %v", ErrAccountBillingUnavailable, g.initErr)
	}
	if customerID != "" {
		subscriptions, err := g.subscriptions.ListByCustomer(ctx, customerID)
		if errors.Is(err, paddle.ErrNotFound) {
			return nil
		}
		if err != nil {
			return fmt.Errorf("%w: provider customer subscription read failed", ErrAccountBillingUnavailable)
		}
		for _, subscription := range subscriptions {
			if err := ensurePaddleSubscriptionTerminal(subscription); err != nil {
				return err
			}
		}
		return nil
	}

	subscription, err := g.subscriptions.Get(ctx, subscriptionID)
	if errors.Is(err, paddle.ErrNotFound) {
		// An authoritative not-found result is the intended cleanup path for
		// disposable pre-Live/Sandbox bindings. Never probe another environment.
		return nil
	}
	if err != nil {
		return fmt.Errorf("%w: provider subscription read failed", ErrAccountBillingUnavailable)
	}
	return ensurePaddleSubscriptionTerminal(subscription)
}

func ensurePaddleSubscriptionTerminal(subscription *paddle.Subscription) error {
	if subscription == nil {
		return fmt.Errorf("%w: provider returned no subscription", ErrAccountBillingUnavailable)
	}
	switch subscription.Status {
	case paddle.SubscriptionStatusCanceled:
		return nil
	case paddle.SubscriptionStatusActive,
		paddle.SubscriptionStatusTrialing,
		paddle.SubscriptionStatusPastDue,
		paddle.SubscriptionStatusPaused:
		return ErrAccountBillingActionRequired
	default:
		return fmt.Errorf("%w: unrecognized subscription status", ErrAccountBillingUnavailable)
	}
}

type accountIdentityAdmin interface {
	ResolveIdentityDeletion(ctx context.Context, provider, subject, email string) (string, string, error)
	ValidateIdentityDeletion(provider, subject string) error
	DeleteIdentity(ctx context.Context, provider, subject string) error
}

type supabaseIdentityAdmin struct {
	baseURL   *url.URL
	secret    string
	client    *http.Client
	allowHTTP bool
}

func NewSupabaseIdentityAdmin() accountIdentityAdmin {
	baseURL := strings.TrimSpace(os.Getenv("MUSUW_SUPABASE_URL"))
	if baseURL == "" {
		baseURL = supabaseBaseURLFromIssuer(os.Getenv("OIDC_AUTH_ISSUER_URL"))
	}
	return newSupabaseIdentityAdmin(
		baseURL,
		strings.TrimSpace(os.Getenv("MUSUW_SUPABASE_SERVICE_ROLE_KEY")),
		&http.Client{Timeout: 15 * time.Second},
		false,
	)
}

func newSupabaseIdentityAdmin(rawURL, secret string, client *http.Client, allowHTTP bool) *supabaseIdentityAdmin {
	parsed, _ := url.Parse(strings.TrimSpace(rawURL))
	if client == nil {
		client = &http.Client{Timeout: 15 * time.Second}
	}
	return &supabaseIdentityAdmin{
		baseURL:   parsed,
		secret:    strings.TrimSpace(secret),
		client:    client,
		allowHTTP: allowHTTP,
	}
}

func supabaseBaseURLFromIssuer(issuer string) string {
	issuer = strings.TrimRight(strings.TrimSpace(issuer), "/")
	return strings.TrimSuffix(issuer, "/auth/v1")
}

// ResolveIdentityDeletion keeps already-bound identities deterministic and
// repairs legacy pre-migration rows through Supabase's server-only Admin user
// inventory. The exact email comes from Musuw's verified local account row;
// no confirmation or provider coordinate is accepted from the browser.
func (a *supabaseIdentityAdmin) ResolveIdentityDeletion(
	ctx context.Context,
	provider, subject, email string,
) (string, string, error) {
	provider = strings.ToLower(strings.TrimSpace(provider))
	subject = strings.TrimSpace(subject)
	if provider != "" || subject != "" {
		if err := a.ValidateIdentityDeletion(provider, subject); err != nil {
			return "", "", err
		}
		return provider, subject, nil
	}

	configuredURL := a != nil && a.baseURL != nil && strings.TrimSpace(a.baseURL.Host) != ""
	configuredSecret := a != nil && strings.TrimSpace(a.secret) != ""
	if !configuredURL && !configuredSecret {
		// Native-password deployments have no external identity to remove.
		return "", "", nil
	}
	if !configuredURL || !configuredSecret ||
		(a.baseURL.Scheme != "https" && !(a.allowHTTP && a.baseURL.Scheme == "http")) {
		return "", "", fmt.Errorf("%w: Supabase Admin API is not configured", ErrAccountIdentityDeletionUnavailable)
	}
	email = strings.TrimSpace(email)
	if email == "" {
		return "", "", ErrAccountIdentityBindingRequired
	}

	const (
		pageSize = 1000
		maxPages = 1000
	)
	matchedSubject := ""
	for page := 1; page <= maxPages; page++ {
		endpoint := *a.baseURL
		endpoint.Path = strings.TrimRight(endpoint.Path, "/") + "/auth/v1/admin/users"
		query := endpoint.Query()
		query.Set("page", fmt.Sprintf("%d", page))
		query.Set("per_page", fmt.Sprintf("%d", pageSize))
		endpoint.RawQuery = query.Encode()
		endpoint.Fragment = ""

		req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint.String(), nil)
		if err != nil {
			return "", "", fmt.Errorf("%w: build Supabase identity lookup", ErrAccountIdentityDeletionUnavailable)
		}
		req.Header.Set("Authorization", "Bearer "+a.secret)
		req.Header.Set("apikey", a.secret)
		req.Header.Set("Accept", "application/json")
		resp, err := a.client.Do(req)
		if err != nil {
			return "", "", fmt.Errorf("%w: Supabase Admin identity lookup failed", ErrAccountIdentityDeletionUnavailable)
		}
		var pageData struct {
			Users []struct {
				ID    string `json:"id"`
				Email string `json:"email"`
			} `json:"users"`
		}
		if resp.StatusCode >= http.StatusOK && resp.StatusCode < http.StatusMultipleChoices {
			err = json.NewDecoder(io.LimitReader(resp.Body, 16<<20)).Decode(&pageData)
		} else {
			err = fmt.Errorf("Supabase Admin API returned status %d", resp.StatusCode)
		}
		_ = resp.Body.Close()
		if err != nil {
			return "", "", fmt.Errorf("%w: %v", ErrAccountIdentityDeletionUnavailable, err)
		}
		for _, user := range pageData.Users {
			if !strings.EqualFold(strings.TrimSpace(user.Email), email) {
				continue
			}
			candidate := strings.TrimSpace(user.ID)
			if _, err := uuid.Parse(candidate); err != nil {
				return "", "", fmt.Errorf("%w: Supabase returned an invalid user ID", ErrAccountIdentityDeletionUnavailable)
			}
			if matchedSubject != "" && matchedSubject != candidate {
				return "", "", fmt.Errorf("%w: Supabase email is ambiguous", ErrAccountIdentityBindingRequired)
			}
			matchedSubject = candidate
		}
		if len(pageData.Users) < pageSize {
			if matchedSubject == "" {
				// The official inventory is authoritative: this is either a
				// native local account or an upstream identity already removed.
				return "", "", nil
			}
			return "supabase", matchedSubject, nil
		}
	}
	return "", "", fmt.Errorf("%w: Supabase user inventory exceeded the lookup bound", ErrAccountIdentityDeletionUnavailable)
}

func (a *supabaseIdentityAdmin) ValidateIdentityDeletion(provider, subject string) error {
	provider = strings.ToLower(strings.TrimSpace(provider))
	if provider == "" && strings.TrimSpace(subject) == "" {
		// ResolveIdentityDeletion performs the configured Supabase inventory
		// lookup before this validator is used. An empty pair here therefore
		// represents a native local account or an already-absent identity.
		return nil
	}
	if provider != "supabase" {
		return fmt.Errorf("%w: unsupported provider", ErrAccountIdentityDeletionUnavailable)
	}
	if _, err := uuid.Parse(strings.TrimSpace(subject)); err != nil {
		return fmt.Errorf("%w: invalid Supabase subject", ErrAccountIdentityDeletionUnavailable)
	}
	if a == nil || a.baseURL == nil || strings.TrimSpace(a.baseURL.Host) == "" ||
		(a.baseURL.Scheme != "https" && !(a.allowHTTP && a.baseURL.Scheme == "http")) ||
		strings.TrimSpace(a.secret) == "" {
		return fmt.Errorf("%w: Supabase Admin API is not configured", ErrAccountIdentityDeletionUnavailable)
	}
	return nil
}

func (a *supabaseIdentityAdmin) DeleteIdentity(ctx context.Context, provider, subject string) error {
	if err := a.ValidateIdentityDeletion(provider, subject); err != nil {
		return err
	}
	provider = strings.ToLower(strings.TrimSpace(provider))
	if provider == "" && strings.TrimSpace(subject) == "" {
		return nil
	}
	endpoint := *a.baseURL
	endpoint.Path = strings.TrimRight(endpoint.Path, "/") + "/auth/v1/admin/users/" + url.PathEscape(strings.TrimSpace(subject))
	endpoint.RawQuery = ""
	endpoint.Fragment = ""
	req, err := http.NewRequestWithContext(ctx, http.MethodDelete, endpoint.String(), nil)
	if err != nil {
		return fmt.Errorf("%w: build Supabase deletion request", ErrAccountIdentityDeletionUnavailable)
	}
	req.Header.Set("Authorization", "Bearer "+a.secret)
	req.Header.Set("apikey", a.secret)
	req.Header.Set("Accept", "application/json")
	resp, err := a.client.Do(req)
	if err != nil {
		return fmt.Errorf("%w: Supabase Admin API request failed", ErrAccountIdentityDeletionUnavailable)
	}
	defer resp.Body.Close()
	if resp.StatusCode == http.StatusNotFound {
		return nil
	}
	if resp.StatusCode < http.StatusOK || resp.StatusCode >= http.StatusMultipleChoices {
		return fmt.Errorf("%w: Supabase Admin API returned status %d", ErrAccountIdentityDeletionUnavailable, resp.StatusCode)
	}
	return nil
}
