package service

import (
	"context"
	"testing"

	"github.com/Tencent/WeKnora/internal/types"
	"github.com/stretchr/testify/require"
)

type accountMarketplaceGuardStub struct {
	repo        *accountErasureRepoStub
	prepareErr  error
	prepares    int
	terminalErr error
}

func (s *accountMarketplaceGuardStub) PrepareAccountDeletion(context.Context, uint64) error {
	if !s.repo.fenced && !s.repo.target.IsDeletionPending {
		panic("market cancellation must follow durable fence")
	}
	s.prepares++
	return s.prepareErr
}

func (s *accountMarketplaceGuardStub) EnsureAccountTerminal(context.Context, uint64) error {
	return s.terminalErr
}

func TestAccountErasureSchedulesMarketplaceOnlyBuyerAndDefersUnknownCheckout(t *testing.T) {
	target := eligibleErasureTarget()
	target.PaddleSubscriptionID = ""
	target.IsDeletionPending = false
	target.MarketplaceBilling = []types.AccountErasureBillingReference{
		{PaddleCustomerID: "ctm-market", PaddleSubscriptionID: "sub-market"},
		{PaddleCustomerID: "ctm-market", PaddleSubscriptionID: "sub-other"},
	}
	repo := &accountErasureRepoStub{target: target}
	billing := &accountErasureBillingStub{}
	queue := &accountErasureTaskStub{}
	guard := &accountMarketplaceGuardStub{repo: repo, prepareErr: types.ErrMarketplaceConflict}
	svc := newAccountErasureService(repo, nil, nil, nil, queue, nil, billing, &accountErasureIdentityStub{})
	svc.marketplace = guard
	require.NoError(t, svc.Request(context.Background(), target.UserID))
	require.True(t, repo.fenced)
	require.Equal(t, 1, billing.prepareCalls, "one customer inventory handles all its independent subscriptions")
	require.Equal(t, 1, guard.prepares)
	require.Len(t, queue.tasks, 1, "unknown checkout must retain durable recovery")
}

func TestAccountErasureWorkerWaitsForMarketplaceCheckoutRecovery(t *testing.T) {
	target := eligibleErasureTarget()
	target.PaddleSubscriptionID = ""
	repo := &accountErasureRepoStub{target: target}
	guard := &accountMarketplaceGuardStub{repo: repo, prepareErr: types.ErrMarketplaceConflict}
	svc := newAccountErasureService(
		repo, nil, nil, nil, nil, nil, &accountErasureBillingStub{}, &accountErasureIdentityStub{},
	)
	svc.marketplace = guard
	task, err := NewAccountErasureTask(target.UserID)
	require.NoError(t, err)
	require.ErrorIs(t, svc.Process(context.Background(), task), types.ErrMarketplaceConflict)
	require.False(t, repo.purged)
}
