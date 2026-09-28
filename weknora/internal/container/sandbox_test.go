package container

import (
	"context"
	"errors"
	"strconv"
	"testing"
	"time"

	"github.com/alicebob/miniredis/v2"
	"github.com/redis/go-redis/v9"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"

	"github.com/Tencent/WeKnora/internal/sandbox"
	"github.com/Tencent/WeKnora/internal/types"
)

func TestSelectSessionBindingStorePrefersRedis(t *testing.T) {
	mini := miniredis.RunT(t)
	client := redis.NewClient(&redis.Options{Addr: mini.Addr()})
	t.Cleanup(func() { _ = client.Close() })

	store, kind, err := selectSessionBindingStore(client, true)
	require.NoError(t, err)
	require.Equal(t, "redis", kind)
	require.IsType(t, &sandbox.RedisSessionSandboxBindingStore{}, store)
}

func TestSelectSessionBindingStoreUsesMemoryWithoutRedis(t *testing.T) {
	store, kind, err := selectSessionBindingStore(nil, true)
	require.NoError(t, err)
	require.Equal(t, "memory", kind)
	require.IsType(t, &sandbox.MemorySessionSandboxBindingStore{}, store)
}

func TestSelectSessionBindingStoreFallsBackToMemoryWhenNotRequired(t *testing.T) {
	store, kind, err := selectSessionBindingStore(nil, false)
	require.NoError(t, err)
	require.Equal(t, "memory", kind)
	require.IsType(t, &sandbox.MemorySessionSandboxBindingStore{}, store)
}

func TestLegacySandboxConfigFromEnvPreservesDockerSettings(t *testing.T) {
	t.Setenv("WEKNORA_SANDBOX_MODE", " Docker ")
	t.Setenv("WEKNORA_SANDBOX_TIMEOUT", "17")
	t.Setenv("WEKNORA_SANDBOX_DOCKER_IMAGE", " musuw/sandbox:legacy ")
	t.Setenv("DOCKER_HOST", "unix:///tmp/musuw-docker.sock")

	cfg, mode := legacySandboxConfigFromEnv()

	require.Equal(t, "docker", mode)
	require.Equal(t, sandbox.SandboxTypeDocker, cfg.Type)
	require.Equal(t, 17*time.Second, cfg.DefaultTimeout)
	require.Equal(t, "musuw/sandbox:legacy", cfg.DockerImage)
	require.Equal(t, "unix:///tmp/musuw-docker.sock", cfg.DockerHost)
}

func TestLegacySandboxConfigFromEnvDefaultsSafely(t *testing.T) {
	t.Setenv("WEKNORA_SANDBOX_MODE", "")
	t.Setenv("WEKNORA_SANDBOX_TIMEOUT", "not-a-duration")
	t.Setenv("WEKNORA_SANDBOX_DOCKER_IMAGE", "")
	t.Setenv("DOCKER_HOST", "")

	cfg, mode := legacySandboxConfigFromEnv()

	require.Equal(t, "disabled", mode)
	require.Equal(t, sandbox.SandboxTypeDisabled, cfg.Type)

	t.Setenv("WEKNORA_SANDBOX_MODE", "docker")
	cfg, mode = legacySandboxConfigFromEnv()
	require.Equal(t, "docker", mode)
	require.Equal(t, sandbox.SandboxTypeDocker, cfg.Type)
	require.Equal(t, sandbox.DefaultTimeout, cfg.DefaultTimeout)
	require.Equal(t, sandbox.DefaultDockerImage, cfg.DockerImage)
}

func TestLegacySandboxConfigFromEnvDisablesRemovedLocalMode(t *testing.T) {
	t.Setenv("WEKNORA_SANDBOX_MODE", "local")

	cfg, mode := legacySandboxConfigFromEnv()

	require.Equal(t, "local", mode)
	require.Equal(t, sandbox.SandboxTypeDisabled, cfg.Type)
}

func TestBuildGlobalSandboxConfigUsesLegacyTimeoutOnly(t *testing.T) {
	t.Setenv("WEKNORA_SANDBOX_TIMEOUT", "29")
	t.Setenv("WEKNORA_SANDBOX_MODE", "docker")
	t.Setenv("WEKNORA_SANDBOX_DOCKER_IMAGE", "musuw/legacy:ignored")

	cfg := buildGlobalSandboxConfig()

	require.Equal(t, sandbox.SandboxTypeDisabled, cfg.Type)
	require.Equal(t, 29*time.Second, cfg.DefaultTimeout)
	require.Equal(t, sandbox.DefaultDockerImage, cfg.DockerImage)
}

// fakeSessionLookup implements the narrow sessionExistenceLookup surface the
// checker depends on. Keeping the surface narrow means the test double is a
// couple of lines instead of the full 16-method SessionRepository stub.
type fakeSessionLookup struct {
	byID map[string]*types.Session
	err  error
}

func (f *fakeSessionLookup) GetByID(_ context.Context, tenantID uint64, id string) (*types.Session, error) {
	if f.err != nil {
		return nil, f.err
	}
	if s, ok := f.byID[id+"@"+strconv.FormatUint(tenantID, 10)]; ok {
		return s, nil
	}
	return nil, gorm.ErrRecordNotFound
}

func TestSessionExistenceCheckerBackedByRepository(t *testing.T) {
	repo := &fakeSessionLookup{
		byID: map[string]*types.Session{
			"session-a@42": {ID: "session-a", TenantID: 42},
		},
	}
	checker := sessionExistenceCheckerFor(repo)

	ok, err := checker.SessionExists(context.Background(), sandbox.SessionSandboxKey{TenantID: 42, SessionID: "session-a"})
	require.NoError(t, err)
	require.True(t, ok)

	ok, err = checker.SessionExists(context.Background(), sandbox.SessionSandboxKey{TenantID: 42, SessionID: "missing"})
	require.NoError(t, err)
	require.False(t, ok)
}

func TestSessionExistenceCheckerPropagatesTransientErrors(t *testing.T) {
	fault := errors.New("database offline")
	repo := &fakeSessionLookup{err: fault}
	checker := sessionExistenceCheckerFor(repo)

	ok, err := checker.SessionExists(context.Background(), sandbox.SessionSandboxKey{TenantID: 42, SessionID: "session-a"})
	require.ErrorIs(t, err, fault)
	require.False(t, ok)
}

func TestSessionExistenceCheckerFallsBackToPermissiveWhenLookupNil(t *testing.T) {
	// Lite deployments (no database) still need to boot; a nil lookup
	// hands us the permissive checker so the lifecycle coordinator never
	// blocks resolution on a missing dependency.
	checker := sessionExistenceCheckerFor(nil)
	ok, err := checker.SessionExists(context.Background(), sandbox.SessionSandboxKey{TenantID: 42, SessionID: "session-a"})
	require.NoError(t, err)
	require.True(t, ok)
}
