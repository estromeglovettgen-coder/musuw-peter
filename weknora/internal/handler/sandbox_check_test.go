package handler

import (
	"context"
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/Tencent/WeKnora/internal/sandbox"
	"github.com/Tencent/WeKnora/internal/types"
)

type checkSandboxClient struct {
	sandbox.RemoteSandboxClient
	executions int
	deleted    bool
}

type checkSandboxHandle struct{ sandbox.RemoteSandboxHandle }

func (checkSandboxHandle) ID() string { return "probe" }
func (c *checkSandboxClient) Create(context.Context, sandbox.RemoteCreateRequest) (sandbox.RemoteSandboxHandle, error) {
	return checkSandboxHandle{}, nil
}
func (c *checkSandboxClient) Delete(context.Context, string) error { c.deleted = true; return nil }
func (c *checkSandboxClient) Exec(context.Context, sandbox.RemoteSandboxHandle, sandbox.RemoteExecRequest) (*sandbox.RemoteExecResult, error) {
	c.executions++
	if c.executions == 1 {
		return &sandbox.RemoteExecResult{Stdout: "weknora-ok"}, nil
	}
	return &sandbox.RemoteExecResult{ExitCode: 1, Stderr: "network disabled"}, nil
}

func TestDeepSandboxCheckHonorsDisabledNetwork(t *testing.T) {
	for _, network := range []string{"none", "bridge"} {
		t.Run(network, func(t *testing.T) {
			client := &checkSandboxClient{}
			result := &SandboxCheckResponse{OK: true, Provider: "docker"}
			cfg := sandbox.DefaultConfig()
			cfg.Type = sandbox.SandboxTypeDocker
			cfg.DockerNetworkMode = network
			(&SystemHandler{}).runDeepSandboxCheck(context.Background(), client, cfg, result)
			require.True(t, client.deleted, "probe container must always be removed")
			if network == "none" {
				require.True(t, result.OK, "deliberately disabling network must not fail execution health")
				require.Equal(t, 1, client.executions)
				require.Equal(t, "network_disabled", result.Checks[2].Reason)
				require.Nil(t, result.Checks[2].OK)
			} else {
				require.False(t, result.OK, "enabled network must still be probed")
				require.Equal(t, 2, client.executions)
			}
		})
	}
}

func TestSandboxConnectionCheckConfigAllowsTemplateDiscoveryAfterConnection(t *testing.T) {
	incoming := &types.TenantSandboxConfig{
		SandboxType: "e2b",
		E2B:         &types.E2BSandboxConfig{APIKey: "key"},
	}

	got := sandboxConnectionCheckConfig(incoming)

	require.Equal(t, "__connection_check__", got.E2B.TemplateID)
	require.Empty(t, incoming.E2B.TemplateID, "the submitted form must not be mutated")
}

func TestSandboxCheckReasonDockerUnavailableIncludesHost(t *testing.T) {
	msg := sandboxCheckReason(&sandbox.RemoteError{
		Kind:     sandbox.RemoteErrorKindUnavailable,
		Provider: sandbox.SandboxTypeDocker,
		Message:  "Cannot connect to the Docker daemon at unix:///var/run/docker.sock. Is the docker daemon running?",
	})
	require.Contains(t, msg, "unix:///var/run/docker.sock")
	require.Contains(t, msg, "docker context")
}

func TestRunStatelessSandboxCheckRemovedWithLocalBackend(t *testing.T) {
	incoming := &types.TenantSandboxConfig{SandboxType: "local"}

	_, err := sandbox.ResolveEffectiveConfig(incoming, sandbox.DefaultConfig())

	require.ErrorIs(t, err, sandbox.ErrUnsupportedSandboxType)
}
