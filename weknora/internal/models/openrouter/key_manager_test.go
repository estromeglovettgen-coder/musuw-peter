package openrouter

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestKeyManagerUsesOfficialLimitResetModes(t *testing.T) {
	var created bool
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		require.Equal(t, "Bearer management-secret", r.Header.Get("Authorization"))
		assert.Contains(t, r.Header.Get("User-Agent"), "speakeasy-sdk/go")
		w.Header().Set("Content-Type", "application/json")
		switch {
		case r.Method == http.MethodPost && r.URL.Path == "/keys":
			var body map[string]any
			require.NoError(t, json.NewDecoder(r.Body).Decode(&body))
			assert.Equal(t, "musuw-tenant-7", body["name"])
			assert.Equal(t, 1.25, body["limit"])
			assert.Equal(t, "monthly", body["limit_reset"])
			assert.NotContains(t, body, "workspace_id")
			created = true
			w.WriteHeader(http.StatusCreated)
			_, _ = w.Write([]byte(`{"data":{"hash":"hash-7","limit":1.25,"limit_remaining":1.25,"usage_monthly":0},"key":"sk-child"}`))
		case r.Method == http.MethodPatch && r.URL.Path == "/keys/hash-7":
			var body map[string]any
			require.NoError(t, json.NewDecoder(r.Body).Decode(&body))
			assert.Equal(t, 2.5, body["limit"])
			assert.Contains(t, body, "limit_reset")
			assert.Nil(t, body["limit_reset"])
			_, _ = w.Write([]byte(`{"data":{"hash":"hash-7","limit":2.5,"limit_remaining":2.4,"limit_reset":null,"usage":0.6,"usage_monthly":0.1}}`))
		case r.Method == http.MethodGet && r.URL.Path == "/keys/hash-7":
			_, _ = w.Write([]byte(`{"data":{"hash":"hash-7","limit":2.5,"limit_remaining":2.4,"limit_reset":null,"usage":0.6,"usage_monthly":0.1}}`))
		case r.Method == http.MethodDelete && r.URL.Path == "/keys/hash-7":
			_, _ = w.Write([]byte(`{"deleted":true}`))
		default:
			http.NotFound(w, r)
		}
	}))
	defer server.Close()

	manager := newSDKKeyManager("management-secret", server.URL, server.Client())
	key, err := manager.CreateKey(context.Background(), "musuw-tenant-7", 1_250_000, true)
	require.NoError(t, err)
	require.True(t, created)
	assert.Equal(t, "sk-child", key.Key)
	assert.Equal(t, "hash-7", key.Hash)

	require.NoError(t, manager.UpdateKeyLimit(context.Background(), key.Hash, 2_500_000, false))
	info, err := manager.GetKey(context.Background(), key.Hash)
	require.NoError(t, err)
	assert.Equal(t, int64(2_500_000), info.LimitMicrousd)
	assert.Equal(t, int64(2_400_000), info.LimitRemainingMicrousd)
	assert.Equal(t, int64(600_000), info.UsageMicrousd)
	assert.Equal(t, int64(100_000), info.UsageMonthlyMicrousd)
	assert.False(t, info.MonthlyReset)
	require.NoError(t, manager.DeleteKey(context.Background(), key.Hash))
}

func TestKeyManagerCreateKeyTargetsConfiguredWorkspace(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		require.Equal(t, http.MethodPost, r.Method)
		require.Equal(t, "/keys", r.URL.Path)
		require.Equal(t, "Bearer management-secret", r.Header.Get("Authorization"))
		var body map[string]any
		require.NoError(t, json.NewDecoder(r.Body).Decode(&body))
		assert.Equal(t, "workspace-staging", body["workspace_id"])
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusCreated)
		_, _ = w.Write([]byte(`{"data":{"hash":"hash-staging","limit":1.25,"limit_remaining":1.25},"key":"sk-child"}`))
	}))
	defer server.Close()

	manager := newSDKKeyManagerWithWorkspace("management-secret", "workspace-staging", server.URL, server.Client())
	key, err := manager.CreateKey(context.Background(), "musuw-tenant-staging", 1_250_000, false)
	require.NoError(t, err)
	assert.Equal(t, "hash-staging", key.Hash)
}

func TestKeyManagerWorkspaceIDIsNotLeakedInErrors(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		require.Equal(t, http.MethodPost, r.Method)
		require.Equal(t, "/keys", r.URL.Path)
		http.Error(w, "provider unavailable", http.StatusBadGateway)
	}))
	defer server.Close()

	workspaceID := "workspace-secret-marker"
	manager := newSDKKeyManagerWithWorkspace("management-secret", workspaceID, server.URL, server.Client())
	_, err := manager.CreateKey(context.Background(), "musuw-tenant-staging", 1_250_000, false)
	require.Error(t, err)
	assert.NotContains(t, err.Error(), workspaceID)
}

func TestDeleteKeyTreatsMissingManagedKeyAsAlreadyDeleted(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		require.Equal(t, http.MethodDelete, r.Method)
		require.Equal(t, "/keys/already-gone", r.URL.Path)
		w.Header().Set("Content-Type", "application/json")
		http.NotFound(w, r)
	}))
	defer server.Close()

	manager := newSDKKeyManager("management-secret", server.URL, server.Client())
	require.NoError(t, manager.DeleteKey(context.Background(), "already-gone"))
}
