package types

import (
	"testing"
	"time"

	"github.com/stretchr/testify/require"
)

func TestMarketplaceSubscriptionAccessEndsAtConfirmedPaidTerm(t *testing.T) {
	now := time.Date(2026, 9, 22, 0, 0, 0, 0, time.UTC)
	end := now.Add(time.Hour)
	subscription := MarketplaceSubscription{Status: "active", PaidThrough: &end}
	require.True(t, subscription.HasAccess(now))
	require.False(t, subscription.HasAccess(end))
	subscription.Status = "past_due"
	require.True(t, subscription.HasAccess(now))
	require.False(t, subscription.HasAccess(end))
	subscription.Status = "refunded"
	require.False(t, subscription.HasAccess(now))
}
