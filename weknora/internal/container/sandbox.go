// Package container - workspace sandbox provider wiring.
package container

import (
	"context"
	"errors"
	"fmt"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/redis/go-redis/v9"
	"gorm.io/gorm"

	apperrors "github.com/Tencent/WeKnora/internal/errors"
	"github.com/Tencent/WeKnora/internal/logger"
	"github.com/Tencent/WeKnora/internal/sandbox"
	"github.com/Tencent/WeKnora/internal/types"
	"github.com/Tencent/WeKnora/internal/types/interfaces"
)

// newSandboxManager builds the deployment-wide compatibility backend used by
// agents that predate named workspace sandbox configs. The old Musuw contract
// was entirely environment-driven (WEKNORA_SANDBOX_MODE, timeout and image),
// so dropping that manager when the tenant resolver was introduced would make
// existing Docker deployments silently become disabled.
//
// Docker remains remote and session-bound here, exactly like a named Docker
// config. The former "local" mode is intentionally not brought back: it ran
// untrusted model-authored code as a host process and is no longer an
// acceptable isolation boundary. Existing local-mode deployments therefore
// remain safely disabled until moved to Docker/Cube/E2B.
func newSandboxManager(
	redisClient *redis.Client,
	sessionRepo interfaces.SessionRepository,
) sandbox.Manager {
	cfg, mode := legacySandboxConfigFromEnv()
	switch mode {
	case "disabled":
		return sandbox.NewDisabledManager()
	case "local":
		logger.Warnf(context.Background(),
			"[sandbox] WEKNORA_SANDBOX_MODE=local is no longer supported: "+
				"host-process execution was removed for security; use docker or a "+
				"named remote sandbox config")
		return sandbox.NewDisabledManager()
	case "docker":
		// Continue below. The manager is constructed with the same shared
		// binding store/checker as named configs, so old env-only sessions do
		// not lose persistence when requests are handled by another instance.
	default:
		logger.Warnf(context.Background(),
			"[sandbox] unsupported WEKNORA_SANDBOX_MODE=%q; sandbox disabled",
			mode)
		return sandbox.NewDisabledManager()
	}

	client, err := sandbox.NewDockerRemoteClient(cfg)
	if err != nil {
		logger.Warnf(context.Background(),
			"[sandbox] failed to initialize legacy Docker sandbox, falling back to disabled: %v",
			err)
		return sandbox.NewDisabledManager()
	}
	store, _, err := selectSessionBindingStore(redisClient, true)
	if err != nil {
		logger.Warnf(context.Background(),
			"[sandbox] failed to initialize legacy Docker session bindings, falling back to disabled: %v",
			err)
		return sandbox.NewDisabledManager()
	}
	mgr, err := sandbox.NewSessionBoundManager(sandbox.SessionBoundManagerConfig{
		Config:          cfg,
		Client:          client,
		Store:           store,
		Checker:         sessionExistenceCheckerFor(sessionRepo),
		ConfigID:        types.SandboxConfigIDGlobalDefault,
		SkipHealthProbe: true,
	})
	if err != nil {
		logger.Warnf(context.Background(),
			"[sandbox] failed to initialize legacy Docker sandbox, falling back to disabled: %v",
			err)
		return sandbox.NewDisabledManager()
	}
	logger.Infof(context.Background(),
		"[sandbox] legacy environment compatibility enabled: mode=docker timeout=%s image=%s",
		cfg.DefaultTimeout, cfg.DockerImage)
	return mgr
}

// legacySandboxConfigFromEnv translates the pre-named-config environment
// contract into the target sandbox.Config. It intentionally recognizes only
// Docker as executable: the old local process backend was removed for
// security, while disabled/unknown values stay fail-closed.
func legacySandboxConfigFromEnv() (*sandbox.Config, string) {
	mode := strings.ToLower(strings.TrimSpace(os.Getenv("WEKNORA_SANDBOX_MODE")))
	if mode == "" {
		mode = "disabled"
	}

	cfg := sandbox.DefaultConfig()
	cfg.Type = sandbox.SandboxTypeDisabled
	if mode != "docker" {
		return cfg, mode
	}

	cfg.Type = sandbox.SandboxTypeDocker
	image := strings.TrimSpace(os.Getenv("WEKNORA_SANDBOX_DOCKER_IMAGE"))
	if image == "" {
		image = sandbox.DefaultDockerImage
	}
	cfg.DockerImage = image
	cfg.DefaultTimeout = legacySandboxTimeout()
	// Keep an explicit DOCKER_HOST in the generated config when supplied. An
	// empty value is resolved by the sandbox package from the same environment
	// (or current Docker context) at client construction time.
	cfg.DockerHost = strings.TrimSpace(os.Getenv("DOCKER_HOST"))
	return cfg, mode
}

func legacySandboxTimeout() time.Duration {
	raw := strings.TrimSpace(os.Getenv("WEKNORA_SANDBOX_TIMEOUT"))
	if raw == "" {
		return sandbox.DefaultTimeout
	}
	seconds, err := strconv.ParseInt(raw, 10, 64)
	if err != nil || seconds <= 0 {
		return sandbox.DefaultTimeout
	}
	// Avoid wrapping a very large environment value into a negative duration,
	// which ValidateConfig correctly rejects and would unexpectedly disable
	// Docker at startup.
	if seconds > int64(^uint64(0)>>1)/int64(time.Second) {
		return sandbox.DefaultTimeout
	}
	return time.Duration(seconds) * time.Second
}

func selectSessionBindingStore(
	redisClient *redis.Client,
	requireRedis bool,
) (sandbox.SessionSandboxBindingStore, string, error) {
	namespace := strings.TrimSpace(os.Getenv("WEKNORA_REDIS_NAMESPACE"))
	if namespace == "" {
		namespace = "weknora"
	}
	if redisClient != nil {
		store, err := sandbox.NewRedisSessionSandboxBindingStore(redisClient, namespace)
		if err != nil {
			return nil, "", fmt.Errorf("build redis binding store: %w", err)
		}
		return store, "redis", nil
	}
	_ = requireRedis
	logger.Warnf(context.Background(),
		"[sandbox] No Redis configured, using in-memory binding store (single-instance)")
	return sandbox.NewMemorySessionSandboxBindingStore(), "memory", nil
}

// sessionExistenceLookup is the narrow slice of SessionRepository the
// session existence checker actually needs. Declaring it here (rather than
// depending on interfaces.SessionRepository) keeps the checker easy to test
// and lets the container inject a nil repository in Lite mode without
// dragging the whole database contract along.
type sessionExistenceLookup interface {
	GetByID(ctx context.Context, tenantID uint64, id string) (*types.Session, error)
}

// sessionExistenceCheckerFor returns a SessionExistenceChecker backed by the
// tenant session repository. When the repository is unavailable (Lite mode
// without a database) the returned checker is permissive so single-process
// deployments still work; multi-instance production paths always resolve a
// real repository because the container refuses to boot without one.
func sessionExistenceCheckerFor(
	lookup sessionExistenceLookup,
) sandbox.SessionExistenceChecker {
	if lookup == nil {
		return sandbox.PermissiveSessionExistenceChecker{}
	}
	return &repositorySessionExistenceChecker{lookup: lookup}
}

// repositorySessionExistenceChecker adapts SessionRepository.GetByID onto the
// SessionExistenceChecker contract. gorm.ErrRecordNotFound → false, other
// errors propagate so the lifecycle coordinator preserves bindings under
// transient database failures.
type repositorySessionExistenceChecker struct {
	lookup sessionExistenceLookup
}

func (c *repositorySessionExistenceChecker) SessionExists(
	ctx context.Context,
	key sandbox.SessionSandboxKey,
) (bool, error) {
	if c == nil || c.lookup == nil {
		return true, nil
	}
	session, err := c.lookup.GetByID(ctx, key.TenantID, key.SessionID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) || errors.Is(err, apperrors.ErrSessionNotFound) {
			return false, nil
		}
		return false, fmt.Errorf("session existence check: %w", err)
	}
	return session != nil, nil
}

// buildGlobalSandboxConfig returns the process-wide *sandbox.Config that
// per-tenant overrides are merged onto.
func buildGlobalSandboxConfig() *sandbox.Config {
	cfg := sandbox.DefaultConfig()
	cfg.Type = sandbox.SandboxTypeDisabled
	// Keep the legacy timeout as the cross-cutting default for named configs
	// that omit an explicit timeout.  Do not copy the legacy mode/image here:
	// those are deployment-manager concerns and named configs must retain their
	// stored provider semantics.
	cfg.DefaultTimeout = legacySandboxTimeout()
	return cfg
}

// newTenantSandboxResolver wires the workspace-config resolver. Agents without
// a selected config use the deployment-wide manager (including the legacy
// environment compatibility backend); named configs still resolve strictly by
// their own stored provider settings.
func newTenantSandboxResolver(
	defaultManager sandbox.Manager,
	loader sandbox.TenantSandboxConfigLoader,
	redisClient *redis.Client,
	sessionRepo interfaces.SessionRepository,
) sandbox.TenantSandboxResolver {
	ctx := context.Background()

	// Tenants may configure any supported backend regardless of process startup
	// mode. Remote configs use this binding store for session persistence.
	store, storeKind, err := selectSessionBindingStore(redisClient, true)
	if err != nil {
		logger.Warnf(ctx,
			"Per-tenant sandbox config disabled: %v", err)
		return nil
	}
	resolver, err := sandbox.NewTenantSandboxResolver(sandbox.TenantSandboxResolverDeps{
		GlobalConfig:    buildGlobalSandboxConfig(),
		DefaultManager:  defaultManager,
		Loader:          loader,
		Store:           store,
		Checker:         sessionExistenceCheckerFor(sessionRepo),
		SharedTransport: sandbox.NewGuardedTransport(),
	})
	if err != nil {
		logger.Warnf(ctx,
			"Failed to initialize tenant sandbox resolver: %v "+
				"(per-tenant sandbox config disabled)", err)
		return nil
	}
	logger.Infof(ctx, "Tenant sandbox resolver configured: binding=%s", storeKind)
	return resolver
}
