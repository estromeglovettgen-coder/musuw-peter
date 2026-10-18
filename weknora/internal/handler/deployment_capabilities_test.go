package handler

import (
	"encoding/json"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
	"net/http/httptest"
	"os"
	"path/filepath"
	"regexp"
	"runtime"
	"slices"
	"strings"
	"testing"
)

func TestDeploymentCapabilityKeysMatchFrontend(t *testing.T) {
	frontendKeys, err := readFrontendDeploymentCapabilityKeys()
	if err != nil {
		t.Fatalf("read frontend capability keys: %v", err)
	}

	if !slices.Equal(DeploymentCapabilityKeys, frontendKeys) {
		t.Fatalf("backend keys = %#v, frontend keys = %#v", DeploymentCapabilityKeys, frontendKeys)
	}
}

func TestBuildDeploymentCapabilitiesIncludesAllKeys(t *testing.T) {
	result := BuildDeploymentCapabilities("standard", DeploymentFeatureAvailability{
		Organizations: true,
		Agents:        true,
		IM:            true,
		Embed:         true,
		API:           true,
		MCP:           true,
		WebSearch:     true,
		VectorStore:   true,
		Storage:       true,
		Sandbox:       true,
	})

	for _, key := range DeploymentCapabilityKeys {
		if _, ok := result.Capabilities[key]; !ok {
			t.Fatalf("missing capability key %q", key)
		}
	}
}

func readFrontendDeploymentCapabilityKeys() ([]string, error) {
	_, thisFile, _, ok := runtime.Caller(0)
	if !ok {
		return nil, os.ErrInvalid
	}
	repoRoot := filepath.Clean(filepath.Join(filepath.Dir(thisFile), "..", ".."))
	frontendPath := filepath.Join(repoRoot, "frontend", "src", "config", "deploymentCapabilities.ts")
	content, err := os.ReadFile(frontendPath)
	if err != nil {
		return nil, err
	}

	re := regexp.MustCompile(`(?s)export const DEPLOYMENT_CAPABILITY_KEYS = \[(.*?)\]`)
	match := re.FindSubmatch(content)
	if len(match) < 2 {
		return nil, os.ErrInvalid
	}

	var keys []string
	for _, line := range strings.Split(string(match[1]), "\n") {
		line = strings.TrimSpace(strings.TrimRight(line, ","))
		if line == "" {
			continue
		}
		line = strings.Trim(line, `'`)
		keys = append(keys, line)
	}
	return keys, nil
}

func TestFirePauseCapabilityIsReversibleWithoutMutatingStartupSnapshot(t *testing.T) {
	t.Setenv("PETER_TOKEN_BILLING_ENABLED", "true")
	t.Setenv("FIRE_USER_EXECUTION_PAUSED", "true")
	h := &SystemHandler{}
	h.BindDeploymentCapabilities(BuildDeploymentCapabilities("standard", DeploymentFeatureAvailability{Sandbox: true}))
	r := gin.New()
	r.GET("/capabilities", h.GetDeploymentCapabilities)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, httptest.NewRequest("GET", "/capabilities", nil))
	var out struct {
		Data DeploymentCapabilitiesData `json:"data"`
	}
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &out))
	require.Equal(t, "fire_user_execution_paused", out.Data.Capabilities["settings.sandbox"].Reason)
	require.True(t, h.deploymentCapabilities.Capabilities["settings.sandbox"].Supported)
	t.Setenv("FIRE_USER_EXECUTION_PAUSED", "false")
	w = httptest.NewRecorder()
	r.ServeHTTP(w, httptest.NewRequest("GET", "/capabilities", nil))
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &out))
	require.True(t, out.Data.Capabilities["settings.sandbox"].Supported)
}
