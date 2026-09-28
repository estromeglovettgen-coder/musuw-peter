package openrouter

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"os"
	"strings"
	"time"

	openroutersdk "github.com/OpenRouterTeam/go-sdk"
	"github.com/OpenRouterTeam/go-sdk/models/operations"
	"github.com/OpenRouterTeam/go-sdk/models/sdkerrors"
	"github.com/OpenRouterTeam/go-sdk/optionalnullable"
	"github.com/OpenRouterTeam/go-sdk/retry"
)

const managementKeyFilePath = "/run/secrets/openrouter_management_api_key"

// KeyManager is the small control-plane surface the tenant module needs.
// The implementation delegates OpenRouter protocol, response typing and
// idempotent retries to OpenRouter's official Go SDK.
type KeyManager interface {
	CreateKey(ctx context.Context, name string, limitMicrousd int64, monthlyReset bool) (*ManagedKey, error)
	UpdateKeyLimit(ctx context.Context, hash string, limitMicrousd int64, monthlyReset bool) error
	GetKey(ctx context.Context, hash string) (*KeyInfo, error)
	DeleteKey(ctx context.Context, hash string) error
}

type ManagedKey struct {
	Key  string
	Hash string
}

type KeyInfo struct {
	Hash                   string
	LimitMicrousd          int64
	LimitRemainingMicrousd int64
	UsageMicrousd          int64
	UsageMonthlyMicrousd   int64
	MonthlyReset           bool
}

type sdkKeyManager struct {
	client      *openroutersdk.OpenRouter
	workspaceID string
}

func NewKeyManagerFromEnv() KeyManager {
	key := strings.TrimSpace(os.Getenv("OPENROUTER_MANAGEMENT_API_KEY"))
	if key == "" {
		if value, err := os.ReadFile(managementKeyFilePath); err == nil {
			key = strings.TrimSpace(string(value))
		}
	}
	if key == "" {
		return nil
	}
	workspaceID := strings.TrimSpace(os.Getenv("OPENROUTER_WORKSPACE_ID"))
	return newSDKKeyManagerWithWorkspace(key, workspaceID, openroutersdk.ServerList[openroutersdk.ServerProduction], &http.Client{Timeout: 10 * time.Second})
}

func newSDKKeyManager(managementKey, baseURL string, client openroutersdk.HTTPClient) *sdkKeyManager {
	return newSDKKeyManagerWithWorkspace(managementKey, "", baseURL, client)
}

func newSDKKeyManagerWithWorkspace(managementKey, workspaceID, baseURL string, client openroutersdk.HTTPClient) *sdkKeyManager {
	if client == nil {
		client = &http.Client{Timeout: 10 * time.Second}
	}
	return &sdkKeyManager{workspaceID: strings.TrimSpace(workspaceID), client: openroutersdk.New(
		openroutersdk.WithSecurity(strings.TrimSpace(managementKey)),
		openroutersdk.WithServerURL(strings.TrimRight(baseURL, "/")),
		openroutersdk.WithClient(client),
		openroutersdk.WithTimeout(10*time.Second),
	)}
}

func (m *sdkKeyManager) CreateKey(ctx context.Context, name string, limitMicrousd int64, monthlyReset bool) (*ManagedKey, error) {
	if m == nil || m.client == nil {
		return nil, fmt.Errorf("OpenRouter Management API is not configured")
	}
	if limitMicrousd <= 0 {
		return nil, fmt.Errorf("OpenRouter key limit must be positive")
	}
	limitUSD := microusdToUSD(limitMicrousd)
	reset := optionalnullable.From[operations.CreateKeysLimitReset](nil)
	if monthlyReset {
		value := operations.CreateKeysLimitResetMonthly
		reset = optionalnullable.From(&value)
	}
	request := operations.CreateKeysRequest{
		Name:       name,
		Limit:      optionalnullable.From(&limitUSD),
		LimitReset: reset,
	}
	if m.workspaceID != "" {
		request.WorkspaceID = &m.workspaceID
	}
	response, err := m.client.APIKeys.Create(ctx, request, operations.WithRetries(retry.Config{Strategy: "none"}))
	if err != nil {
		return nil, managementSDKError("create key", err)
	}
	if response == nil || strings.TrimSpace(response.Key) == "" || strings.TrimSpace(response.Data.Hash) == "" {
		return nil, fmt.Errorf("OpenRouter Management API returned an incomplete key")
	}
	return &ManagedKey{Key: response.Key, Hash: response.Data.Hash}, nil
}

func (m *sdkKeyManager) UpdateKeyLimit(ctx context.Context, hash string, limitMicrousd int64, monthlyReset bool) error {
	if m == nil || m.client == nil {
		return fmt.Errorf("OpenRouter Management API is not configured")
	}
	if strings.TrimSpace(hash) == "" {
		return fmt.Errorf("OpenRouter key hash is required")
	}
	if limitMicrousd <= 0 {
		return fmt.Errorf("OpenRouter key limit must be positive")
	}
	limitUSD := microusdToUSD(limitMicrousd)
	reset := optionalnullable.From[operations.UpdateKeysLimitReset](nil)
	if monthlyReset {
		value := operations.UpdateKeysLimitResetMonthly
		reset = optionalnullable.From(&value)
	}
	_, err := m.client.APIKeys.Update(ctx, hash, operations.UpdateKeysRequestBody{
		Limit:      optionalnullable.From(&limitUSD),
		LimitReset: reset,
	})
	if err != nil {
		return managementSDKError("update key", err)
	}
	return nil
}

func (m *sdkKeyManager) GetKey(ctx context.Context, hash string) (*KeyInfo, error) {
	if m == nil || m.client == nil {
		return nil, fmt.Errorf("OpenRouter Management API is not configured")
	}
	if strings.TrimSpace(hash) == "" {
		return nil, fmt.Errorf("OpenRouter key hash is required")
	}
	response, err := m.client.APIKeys.Get(ctx, hash)
	if err != nil {
		return nil, managementSDKError("get key", err)
	}
	if response == nil || response.Data.Limit == nil || response.Data.LimitRemaining == nil {
		return nil, fmt.Errorf("OpenRouter managed key %q has no spend limit", hash)
	}
	return &KeyInfo{
		Hash:                   response.Data.Hash,
		LimitMicrousd:          usdToMicrousd(*response.Data.Limit),
		LimitRemainingMicrousd: usdToMicrousd(*response.Data.LimitRemaining),
		UsageMicrousd:          usdToMicrousd(response.Data.Usage),
		UsageMonthlyMicrousd:   usdToMicrousd(response.Data.UsageMonthly),
		MonthlyReset:           response.Data.LimitReset != nil && *response.Data.LimitReset == "monthly",
	}, nil
}

func (m *sdkKeyManager) DeleteKey(ctx context.Context, hash string) error {
	if m == nil || m.client == nil {
		return fmt.Errorf("OpenRouter Management API is not configured")
	}
	if strings.TrimSpace(hash) == "" {
		return nil
	}
	_, err := m.client.APIKeys.Delete(ctx, hash)
	if err == nil || isSDKNotFound(err) {
		return nil
	}
	return managementSDKError("delete key", err)
}

func isSDKNotFound(err error) bool {
	var notFound *sdkerrors.NotFoundResponseError
	if errors.As(err, &notFound) {
		return true
	}
	var apiErr *sdkerrors.APIError
	return errors.As(err, &apiErr) && apiErr.StatusCode == http.StatusNotFound
}

func managementSDKError(operation string, err error) error {
	var apiErr *sdkerrors.APIError
	if errors.As(err, &apiErr) {
		return fmt.Errorf("OpenRouter Management API %s returned HTTP %d", operation, apiErr.StatusCode)
	}
	return fmt.Errorf("OpenRouter Management API %s failed: %w", operation, err)
}

func microusdToUSD(value int64) float64 {
	return float64(value) / 1_000_000
}

func usdToMicrousd(value float64) int64 {
	if value <= 0 {
		return 0
	}
	return int64(value*1_000_000 + 0.5)
}
