package service

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	paddle "github.com/PaddleHQ/paddle-go-sdk/v5"
	"github.com/stretchr/testify/require"
)

type paddleSubscriptionInventoryStub struct {
	sub             *paddle.Subscription
	subscriptions   []*paddle.Subscription
	err             error
	listedCustomer  string
	cancelErr       error
	cancelErrByID   map[string]error
	cancelResponses map[string]*paddle.Subscription
	cancelCalls     []paddleCancellationCall
}

type paddleCancellationCall struct {
	subscriptionID string
	effectiveFrom  paddle.EffectiveFrom
}

func (s *paddleSubscriptionInventoryStub) Get(context.Context, string) (*paddle.Subscription, error) {
	return s.sub, s.err
}

func (s *paddleSubscriptionInventoryStub) ListByCustomer(_ context.Context, customerID string) ([]*paddle.Subscription, error) {
	s.listedCustomer = customerID
	return s.subscriptions, s.err
}

func (s *paddleSubscriptionInventoryStub) Cancel(_ context.Context, subscriptionID string, effectiveFrom paddle.EffectiveFrom) (*paddle.Subscription, error) {
	s.cancelCalls = append(s.cancelCalls, paddleCancellationCall{subscriptionID: subscriptionID, effectiveFrom: effectiveFrom})
	if s.cancelErr != nil {
		return nil, s.cancelErr
	}
	if err := s.cancelErrByID[subscriptionID]; err != nil {
		return nil, err
	}
	if response, ok := s.cancelResponses[subscriptionID]; ok {
		return response, nil
	}
	if effectiveFrom == paddle.EffectiveFromImmediately {
		return &paddle.Subscription{ID: subscriptionID, Status: paddle.SubscriptionStatusCanceled}, nil
	}
	return &paddle.Subscription{
		ID:     subscriptionID,
		Status: paddle.SubscriptionStatusActive,
		ScheduledChange: &paddle.SubscriptionScheduledChange{
			Action:      paddle.ScheduledChangeActionCancel,
			EffectiveAt: "2027-01-01T00:00:00Z",
		},
	}, nil
}

func TestPaddleAccountErasureGuardPreparesPaidCancellationBeforeDeletion(t *testing.T) {
	for _, tc := range []struct {
		name          string
		status        paddle.SubscriptionStatus
		effectiveFrom paddle.EffectiveFrom
	}{
		{name: "active", status: paddle.SubscriptionStatusActive, effectiveFrom: paddle.EffectiveFromNextBillingPeriod},
		{name: "trialing", status: paddle.SubscriptionStatusTrialing, effectiveFrom: paddle.EffectiveFromNextBillingPeriod},
		{name: "paused", status: paddle.SubscriptionStatusPaused, effectiveFrom: paddle.EffectiveFromImmediately},
	} {
		t.Run(tc.name, func(t *testing.T) {
			inventory := &paddleSubscriptionInventoryStub{sub: &paddle.Subscription{ID: "sub_123", Status: tc.status}}
			guard := newPaddleAccountErasureGuard(inventory)

			require.NoError(t, guard.PrepareAccountDeletion(context.Background(), "", "sub_123"))
			require.Equal(t, []paddleCancellationCall{{subscriptionID: "sub_123", effectiveFrom: tc.effectiveFrom}}, inventory.cancelCalls)
		})
	}
}

func TestPaddleAccountErasureGuardTreatsScheduledCancelAsPrepared(t *testing.T) {
	inventory := &paddleSubscriptionInventoryStub{sub: &paddle.Subscription{
		ID:     "sub_123",
		Status: paddle.SubscriptionStatusActive,
		ScheduledChange: &paddle.SubscriptionScheduledChange{
			Action:      paddle.ScheduledChangeActionCancel,
			EffectiveAt: "2027-01-01T00:00:00Z",
		},
	}}
	guard := newPaddleAccountErasureGuard(inventory)

	require.NoError(t, guard.PrepareAccountDeletion(context.Background(), "", "sub_123"))
	require.Empty(t, inventory.cancelCalls)
	require.ErrorIs(t, guard.EnsureAccountTerminal(context.Background(), "", "sub_123"), ErrAccountBillingActionRequired)

	inventory.sub.ScheduledChange.EffectiveAt = "invalid"
	err := guard.PrepareAccountDeletion(context.Background(), "", "sub_123")
	require.ErrorIs(t, err, ErrAccountBillingUnavailable)
	require.Empty(t, inventory.cancelCalls)
}

func TestPaddleAccountErasureGuardPreparesEveryCustomerSubscription(t *testing.T) {
	inventory := &paddleSubscriptionInventoryStub{subscriptions: []*paddle.Subscription{
		{ID: "sub_active", CustomerID: "ctm_123", Status: paddle.SubscriptionStatusActive},
		{ID: "sub_trial", CustomerID: "ctm_123", Status: paddle.SubscriptionStatusTrialing},
		{ID: "sub_canceled", CustomerID: "ctm_123", Status: paddle.SubscriptionStatusCanceled},
	}}
	guard := newPaddleAccountErasureGuard(inventory)

	require.NoError(t, guard.PrepareAccountDeletion(context.Background(), "ctm_123", "sub_stale"))
	require.Equal(t, []paddleCancellationCall{
		{subscriptionID: "sub_active", effectiveFrom: paddle.EffectiveFromNextBillingPeriod},
		{subscriptionID: "sub_trial", effectiveFrom: paddle.EffectiveFromNextBillingPeriod},
	}, inventory.cancelCalls)
}

func TestPaddleAccountErasureGuardValidatesWholeInventoryBeforeMutation(t *testing.T) {
	inventory := &paddleSubscriptionInventoryStub{subscriptions: []*paddle.Subscription{
		{ID: "sub_active", CustomerID: "ctm_123", Status: paddle.SubscriptionStatusActive},
		{ID: "sub_due", CustomerID: "ctm_123", Status: paddle.SubscriptionStatusPastDue},
	}}

	err := newPaddleAccountErasureGuard(inventory).PrepareAccountDeletion(context.Background(), "ctm_123", "")

	require.ErrorIs(t, err, ErrAccountBillingActionRequired)
	require.Empty(t, inventory.cancelCalls)
}

func TestPaddleAccountErasureGuardRetriesAfterPartialProviderFailure(t *testing.T) {
	inventory := &paddleSubscriptionInventoryStub{
		subscriptions: []*paddle.Subscription{
			{ID: "sub_first", CustomerID: "ctm_123", Status: paddle.SubscriptionStatusActive},
			{ID: "sub_second", CustomerID: "ctm_123", Status: paddle.SubscriptionStatusActive},
		},
		cancelErrByID: map[string]error{"sub_second": errors.New("temporary provider failure")},
	}
	guard := newPaddleAccountErasureGuard(inventory)

	err := guard.PrepareAccountDeletion(context.Background(), "ctm_123", "")
	require.ErrorIs(t, err, ErrAccountBillingUnavailable)
	require.Equal(t, []paddleCancellationCall{
		{subscriptionID: "sub_first", effectiveFrom: paddle.EffectiveFromNextBillingPeriod},
		{subscriptionID: "sub_second", effectiveFrom: paddle.EffectiveFromNextBillingPeriod},
	}, inventory.cancelCalls)

	// Paddle persisted the first write even though the request could not safely
	// fence the local account. A retry skips that scheduled cancellation and
	// continues only the remaining subscription.
	inventory.subscriptions[0].ScheduledChange = &paddle.SubscriptionScheduledChange{
		Action: paddle.ScheduledChangeActionCancel, EffectiveAt: "2027-01-01T00:00:00Z",
	}
	inventory.cancelErrByID = nil
	inventory.cancelCalls = nil
	require.NoError(t, guard.PrepareAccountDeletion(context.Background(), "ctm_123", ""))
	require.Equal(t, []paddleCancellationCall{
		{subscriptionID: "sub_second", effectiveFrom: paddle.EffectiveFromNextBillingPeriod},
	}, inventory.cancelCalls)
}

func TestPaddleAccountErasureGuardRejectsMismatchedProviderCoordinates(t *testing.T) {
	inventory := &paddleSubscriptionInventoryStub{subscriptions: []*paddle.Subscription{
		{ID: "sub_foreign", CustomerID: "ctm_other", Status: paddle.SubscriptionStatusActive},
	}}
	err := newPaddleAccountErasureGuard(inventory).PrepareAccountDeletion(context.Background(), "ctm_123", "")
	require.ErrorIs(t, err, ErrAccountBillingUnavailable)
	require.Empty(t, inventory.cancelCalls)

	inventory = &paddleSubscriptionInventoryStub{
		sub: &paddle.Subscription{ID: "sub_123", Status: paddle.SubscriptionStatusActive},
		cancelResponses: map[string]*paddle.Subscription{
			"sub_123": {
				ID:     "sub_other",
				Status: paddle.SubscriptionStatusActive,
				ScheduledChange: &paddle.SubscriptionScheduledChange{
					Action:      paddle.ScheduledChangeActionCancel,
					EffectiveAt: "2027-01-01T00:00:00Z",
				},
			},
		},
	}
	err = newPaddleAccountErasureGuard(inventory).PrepareAccountDeletion(context.Background(), "", "sub_123")
	require.ErrorIs(t, err, ErrAccountBillingUnavailable)

	inventory.cancelResponses["sub_123"] = &paddle.Subscription{
		ID:     "sub_123",
		Status: paddle.SubscriptionStatusActive,
		ScheduledChange: &paddle.SubscriptionScheduledChange{
			Action:      paddle.ScheduledChangeActionCancel,
			EffectiveAt: "not-a-provider-timestamp",
		},
	}
	err = newPaddleAccountErasureGuard(inventory).PrepareAccountDeletion(context.Background(), "", "sub_123")
	require.ErrorIs(t, err, ErrAccountBillingUnavailable)
}

func TestPaddleAccountErasureGuardFailsClosedWhenCancellationCannotBePrepared(t *testing.T) {
	inventory := &paddleSubscriptionInventoryStub{
		sub:       &paddle.Subscription{ID: "sub_123", Status: paddle.SubscriptionStatusActive},
		cancelErr: errors.New("provider mutation failed"),
	}
	guard := newPaddleAccountErasureGuard(inventory)
	err := guard.PrepareAccountDeletion(context.Background(), "", "sub_123")
	require.ErrorIs(t, err, ErrAccountBillingUnavailable)

	inventory = &paddleSubscriptionInventoryStub{sub: &paddle.Subscription{ID: "sub_due", Status: paddle.SubscriptionStatusPastDue}}
	guard = newPaddleAccountErasureGuard(inventory)
	err = guard.PrepareAccountDeletion(context.Background(), "", "sub_due")
	require.ErrorIs(t, err, ErrAccountBillingActionRequired)
	require.Empty(t, inventory.cancelCalls)
}

func TestPaddleAccountErasureGuardRequiresHostedBillingResolution(t *testing.T) {
	for _, status := range []paddle.SubscriptionStatus{
		paddle.SubscriptionStatusActive,
		paddle.SubscriptionStatusTrialing,
		paddle.SubscriptionStatusPastDue,
		paddle.SubscriptionStatusPaused,
	} {
		t.Run(string(status), func(t *testing.T) {
			guard := newPaddleAccountErasureGuard(&paddleSubscriptionInventoryStub{
				sub: &paddle.Subscription{Status: status},
			})
			err := guard.EnsureAccountTerminal(context.Background(), "", "sub_123")
			require.ErrorIs(t, err, ErrAccountBillingActionRequired)
		})
	}
}

func TestPaddleAccountErasureGuardAllowsTerminalOrOfficialNotFound(t *testing.T) {
	guard := newPaddleAccountErasureGuard(&paddleSubscriptionInventoryStub{
		sub: &paddle.Subscription{Status: paddle.SubscriptionStatusCanceled},
	})
	require.NoError(t, guard.EnsureAccountTerminal(context.Background(), "", "sub_123"))

	guard = newPaddleAccountErasureGuard(&paddleSubscriptionInventoryStub{err: paddle.ErrNotFound})
	require.NoError(t, guard.EnsureAccountTerminal(context.Background(), "", "sub_stale"))
	require.NoError(t, guard.PrepareAccountDeletion(context.Background(), "ctm_stale", ""))
	require.NoError(t, guard.EnsureAccountTerminal(context.Background(), "ctm_stale", ""))
}

func TestPaddleAccountErasureGuardFailsClosedOnAmbiguousRead(t *testing.T) {
	guard := newPaddleAccountErasureGuard(&paddleSubscriptionInventoryStub{err: errors.New("network unavailable")})
	err := guard.EnsureAccountTerminal(context.Background(), "", "sub_123")
	require.ErrorIs(t, err, ErrAccountBillingUnavailable)

	guard = newPaddleAccountErasureGuard(&paddleSubscriptionInventoryStub{sub: &paddle.Subscription{Status: "future_state"}})
	err = guard.EnsureAccountTerminal(context.Background(), "", "sub_123")
	require.ErrorIs(t, err, ErrAccountBillingUnavailable)
}

func TestPaddleAccountErasureGuardUsesOfficialCustomerInventoryWhenLocalSubscriptionMissing(t *testing.T) {
	inventory := &paddleSubscriptionInventoryStub{subscriptions: []*paddle.Subscription{
		{Status: paddle.SubscriptionStatusCanceled},
	}}
	guard := newPaddleAccountErasureGuard(inventory)
	require.NoError(t, guard.EnsureAccountTerminal(context.Background(), "ctm_123", ""))
	require.Equal(t, "ctm_123", inventory.listedCustomer)

	inventory.subscriptions = append(inventory.subscriptions, &paddle.Subscription{Status: paddle.SubscriptionStatusActive})
	err := guard.EnsureAccountTerminal(context.Background(), "ctm_123", "")
	require.ErrorIs(t, err, ErrAccountBillingActionRequired)
}

func TestSupabaseIdentityAdminDeletesBoundSubjectWithoutLeakingSecret(t *testing.T) {
	const secret = "server-only-secret-value"
	var gotMethod, gotPath, gotAuthorization, gotAPIKey string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotMethod = r.Method
		gotPath = r.URL.Path
		gotAuthorization = r.Header.Get("Authorization")
		gotAPIKey = r.Header.Get("apikey")
		w.WriteHeader(http.StatusNoContent)
	}))
	defer server.Close()

	admin := newSupabaseIdentityAdmin(server.URL, secret, server.Client(), true)
	provider, subject, err := admin.ResolveIdentityDeletion(context.Background(), "supabase", "00000000-0000-0000-0000-000000000007", "")
	require.NoError(t, err)
	require.Equal(t, "supabase", provider)
	require.Equal(t, "00000000-0000-0000-0000-000000000007", subject)
	err = admin.DeleteIdentity(context.Background(), "supabase", "00000000-0000-0000-0000-000000000007")
	require.NoError(t, err)
	require.Equal(t, http.MethodDelete, gotMethod)
	require.Equal(t, "/auth/v1/admin/users/00000000-0000-0000-0000-000000000007", gotPath)
	require.Equal(t, "Bearer "+secret, gotAuthorization)
	require.Equal(t, secret, gotAPIKey)
}

func TestSupabaseIdentityAdminBoundIdentityResolutionDoesNotCallProvider(t *testing.T) {
	calls := 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		calls++
		w.WriteHeader(http.StatusNoContent)
	}))
	defer server.Close()
	admin := newSupabaseIdentityAdmin(server.URL, "secret", server.Client(), true)

	provider, subject, err := admin.ResolveIdentityDeletion(context.Background(), "supabase", "00000000-0000-0000-0000-000000000007", "owner@example.com")
	require.NoError(t, err)
	require.Equal(t, "supabase", provider)
	require.Equal(t, "00000000-0000-0000-0000-000000000007", subject)
	require.Zero(t, calls)
}

func TestSupabaseIdentityAdminResolvesLegacyBindingByExactEmail(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		require.Equal(t, "/auth/v1/admin/users", r.URL.Path)
		require.Equal(t, "1", r.URL.Query().Get("page"))
		require.Equal(t, "1000", r.URL.Query().Get("per_page"))
		require.Equal(t, "Bearer secret", r.Header.Get("Authorization"))
		require.Equal(t, "secret", r.Header.Get("apikey"))
		_, _ = w.Write([]byte(`{"users":[{"id":"00000000-0000-0000-0000-000000000007","email":"Owner@Example.com"}]}`))
	}))
	defer server.Close()
	admin := newSupabaseIdentityAdmin(server.URL, "secret", server.Client(), true)

	provider, subject, err := admin.ResolveIdentityDeletion(context.Background(), "", "", "owner@example.com")
	require.NoError(t, err)
	require.Equal(t, "supabase", provider)
	require.Equal(t, "00000000-0000-0000-0000-000000000007", subject)
}

func TestSupabaseIdentityAdminTreatsMissingLegacyEmailAsNoUpstreamIdentity(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write([]byte(`{"users":[]}`))
	}))
	defer server.Close()
	admin := newSupabaseIdentityAdmin(server.URL, "secret", server.Client(), true)

	provider, subject, err := admin.ResolveIdentityDeletion(context.Background(), "", "", "owner@example.com")
	require.NoError(t, err)
	require.Empty(t, provider)
	require.Empty(t, subject)
}

func TestSupabaseIdentityAdminFailsClosedWhenLegacyEmailIsAmbiguous(t *testing.T) {
	for _, tc := range []struct {
		name  string
		users string
	}{
		{name: "ambiguous", users: `[{"id":"00000000-0000-0000-0000-000000000007","email":"owner@example.com"},{"id":"00000000-0000-0000-0000-000000000008","email":"OWNER@example.com"}]`},
	} {
		t.Run(tc.name, func(t *testing.T) {
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
				_, _ = w.Write([]byte(`{"users":` + tc.users + `}`))
			}))
			defer server.Close()
			admin := newSupabaseIdentityAdmin(server.URL, "secret", server.Client(), true)

			_, _, err := admin.ResolveIdentityDeletion(context.Background(), "", "", "owner@example.com")
			require.ErrorIs(t, err, ErrAccountIdentityBindingRequired)
		})
	}
}

func TestSupabaseIdentityAdminIsIdempotentAndRejectsUnsupportedProviders(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusNotFound)
	}))
	defer server.Close()
	admin := newSupabaseIdentityAdmin(server.URL, "secret", server.Client(), true)
	require.NoError(t, admin.DeleteIdentity(context.Background(), "supabase", "00000000-0000-0000-0000-000000000007"))

	err := admin.DeleteIdentity(context.Background(), "oidc", "external-subject")
	require.ErrorIs(t, err, ErrAccountIdentityDeletionUnavailable)
}

func TestSupabaseIdentityAdminNeverIncludesCredentialInProviderErrors(t *testing.T) {
	const secret = "do-not-leak-this-secret"
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusBadGateway)
	}))
	defer server.Close()
	admin := newSupabaseIdentityAdmin(server.URL, secret, server.Client(), true)

	err := admin.DeleteIdentity(context.Background(), "supabase", "00000000-0000-0000-0000-000000000007")
	require.Error(t, err)
	require.False(t, strings.Contains(err.Error(), secret))
}
