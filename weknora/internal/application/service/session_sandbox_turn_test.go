package service

import (
	"context"
	"testing"

	"github.com/Tencent/WeKnora/internal/types"
	"github.com/stretchr/testify/require"
)

func TestHoldSandboxTurnOpensAndClosesTheLease(t *testing.T) {
	holder := &turnLeaseManager{}
	svc := &sessionService{sandboxMgr: holder}

	release := svc.holdSandboxTurn(context.Background(), "session-a", "")
	require.Equal(t, 1, holder.begins)
	require.Zero(t, holder.ends)

	release()
	require.Equal(t, 1, holder.ends)
}

func TestHoldSandboxTurnIsNoopWhenBeginFails(t *testing.T) {
	holder := &turnLeaseManager{beginErr: context.Canceled}
	svc := &sessionService{sandboxMgr: holder}

	release := svc.holdSandboxTurn(context.Background(), "session-a", "")
	require.Equal(t, 1, holder.begins)
	release()
	require.Zero(t, holder.ends)
}

func TestHoldSandboxTurnResolvesNamedBackendBeforeBeginningLease(t *testing.T) {
	global := &turnLeaseManager{}
	named := &turnLeaseManager{}
	svc := &sessionService{
		sandboxMgr:      global,
		sandboxResolver: stubSandboxResolver{mgr: named},
	}
	ctx := context.WithValue(context.Background(), types.TenantIDContextKey, uint64(7))

	release := svc.holdSandboxTurn(ctx, "session-named", "cfg-cube")
	require.Zero(t, global.begins, "named config must not lease the deployment fallback")
	require.Equal(t, 1, named.begins)

	release()
	require.Zero(t, global.ends)
	require.Equal(t, 1, named.ends)
}

func TestHoldSandboxTurnUsesGlobalManagerForSentinel(t *testing.T) {
	global := &turnLeaseManager{}
	named := &turnLeaseManager{}
	svc := &sessionService{
		sandboxMgr:      global,
		sandboxResolver: stubSandboxResolver{mgr: named},
	}
	ctx := context.WithValue(context.Background(), types.TenantIDContextKey, uint64(7))

	release := svc.holdSandboxTurn(ctx, "session-global", sandboxConfigIDGlobalDefaultForTest())
	require.Equal(t, 1, global.begins)
	require.Zero(t, named.begins)

	release()
	require.Equal(t, 1, global.ends)
	require.Zero(t, named.ends)
}

// Keep the test's sentinel lookup local to this package so it remains clear
// that the regression concerns the public ID rather than a magic literal.
func sandboxConfigIDGlobalDefaultForTest() string {
	return types.SandboxConfigIDGlobalDefault
}

type turnLeaseManager struct {
	stagingSandboxManager
	begins   int
	ends     int
	beginErr error
	endErr   error
}

func (m *turnLeaseManager) BeginSessionTurn(context.Context, string) error {
	m.begins++
	return m.beginErr
}

func (m *turnLeaseManager) EndSessionTurn(context.Context, string) error {
	m.ends++
	return m.endErr
}
