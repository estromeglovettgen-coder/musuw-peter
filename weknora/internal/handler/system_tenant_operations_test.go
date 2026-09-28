package handler

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/Tencent/WeKnora/internal/application/repository"
	apperrors "github.com/Tencent/WeKnora/internal/errors"
	"github.com/Tencent/WeKnora/internal/types"
	"github.com/Tencent/WeKnora/internal/types/interfaces"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

type managedTenantServiceStub struct {
	interfaces.TenantService
	tenant  *types.Tenant
	updated *types.Tenant
	getErr  error
}

func (s *managedTenantServiceStub) GetTenantByID(context.Context, uint64) (*types.Tenant, error) {
	if s.getErr != nil {
		return nil, s.getErr
	}
	return s.tenant, nil
}

func (s *managedTenantServiceStub) UpdateTenant(_ context.Context, tenant *types.Tenant) (*types.Tenant, error) {
	s.updated = tenant
	return tenant, nil
}

type managedEntitlementServiceStub struct {
	interfaces.EntitlementService
	current       *types.ConsumerEntitlement
	setRemaining  int64
	setTenantID   uint64
	setError      error
	currentError  error
	grantPlan     types.ConsumerPlan
	grantExpiry   time.Time
	grantID       string
	grantApplied  bool
	grantError    error
	revokeID      string
	revokeApplied bool
	revokeError   error
}

func (s *managedEntitlementServiceStub) CurrentForTenant(context.Context, uint64, time.Time) (*types.ConsumerEntitlement, error) {
	return s.current, s.currentError
}

func (s *managedEntitlementServiceStub) SetOpenRouterRemainingForTenant(_ context.Context, tenantID uint64, remaining int64) (*types.ConsumerEntitlement, error) {
	s.setTenantID = tenantID
	s.setRemaining = remaining
	if s.setError != nil {
		return nil, s.setError
	}
	return s.current, nil
}

func (s *managedEntitlementServiceStub) GrantComplimentaryPlan(_ context.Context, _ uint64, plan types.ConsumerPlan, expiresAt time.Time, grantID string) (*types.ConsumerEntitlement, bool, error) {
	s.grantPlan, s.grantExpiry, s.grantID = plan, expiresAt, grantID
	if s.grantError != nil {
		return nil, s.grantApplied, s.grantError
	}
	return s.current, s.grantApplied, nil
}

func (s *managedEntitlementServiceStub) RevokeComplimentaryPlan(_ context.Context, _ uint64, grantID string) (*types.ConsumerEntitlement, bool, error) {
	s.revokeID = grantID
	if s.revokeError != nil {
		return nil, s.revokeApplied, s.revokeError
	}
	return s.current, s.revokeApplied, nil
}

type managedAuditStub struct {
	interfaces.AuditLogService
	entries []*types.AuditLog
}

func (s *managedAuditStub) Log(_ context.Context, entry *types.AuditLog) error {
	s.entries = append(s.entries, entry)
	return nil
}

func managedTenantOpsRouter(h *SystemHandler) *gin.Engine {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.GET("/tenants/:id/entitlement", h.GetManagedTenantEntitlement)
	r.PATCH("/tenants/:id", h.UpdateManagedTenant)
	r.PUT("/tenants/:id/openrouter-credits", h.UpdateManagedTenantOpenRouterCredits)
	r.PUT("/tenants/:id/complimentary-entitlement", h.GrantManagedTenantComplimentaryPlan)
	r.DELETE("/tenants/:id/complimentary-entitlement", h.RevokeManagedTenantComplimentaryPlan)
	return r
}

func TestGetManagedTenantEntitlementReturnsProviderStatusAndUsage(t *testing.T) {
	periodEnd := time.Date(2026, 9, 16, 0, 0, 0, 0, time.UTC)
	h := &SystemHandler{
		tenantSvc: &managedTenantServiceStub{tenant: &types.Tenant{
			ID: 7, Name: "Workspace", Status: "active", Plan: types.ConsumerPlanPro,
			StorageQuota: 40 * 1024, StorageUsed: 1024,
			PaddleBillingPeriod: "monthly", PaddleCurrentPeriodEnd: &periodEnd,
		}},
		entitlementSvc: &managedEntitlementServiceStub{current: &types.ConsumerEntitlement{
			ConsumerPlanLimits:                  types.LimitsForConsumerPlan(types.ConsumerPlanPro),
			PlanStatus:                          "active",
			StorageUsed:                         1024,
			OpenRouterUsedMicrousd:              500_000,
			OpenRouterRemainingMicrousd:         2_000_000,
			OpenRouterProviderUsedMicrousd:      750_000,
			OpenRouterProviderRemainingMicrousd: 3_500_000,
			OpenRouterResetsAt:                  &periodEnd,
			OpenRouterCreditsStatus:             types.OpenRouterCreditsUnavailable,
		}},
	}
	r := managedTenantOpsRouter(h)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/tenants/7/entitlement", nil))

	require.Equal(t, http.StatusOK, w.Code)
	var body map[string]any
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &body))
	data := body["data"].(map[string]any)
	assert.Equal(t, "pro", data["plan"])
	assert.Equal(t, "unavailable", data["openrouter_credits_status"])
	assert.Equal(t, float64(1024), data["storage_used_bytes"])
	assert.Equal(t, float64(2_500_000), data["openrouter_consumer_allowance_microusd"])
	assert.Equal(t, float64(750_000), data["openrouter_provider_used_microusd"])
	assert.Equal(t, float64(3_500_000), data["openrouter_provider_remaining_microusd"])
	assert.NotContains(t, w.Body.String(), "api_key")
}

func TestGetManagedTenantEntitlementProjectsEffectiveComplimentaryStorage(t *testing.T) {
	expiresAt := time.Now().UTC().Add(time.Hour)
	h := &SystemHandler{
		tenantSvc: &managedTenantServiceStub{tenant: &types.Tenant{
			ID: 7, Name: "Workspace", Status: "active", Plan: types.ConsumerPlanFree,
			StorageQuota: 1024 * 1024 * 1024, StorageUsed: 512 * 1024 * 1024,
			ComplimentaryPlan: types.ConsumerPlanMax, ComplimentaryExpiresAt: &expiresAt, ComplimentaryGrantID: "grant-storage-123",
		}},
		entitlementSvc: &managedEntitlementServiceStub{current: &types.ConsumerEntitlement{
			ConsumerPlanLimits: types.LimitsForConsumerPlan(types.ConsumerPlanMax),
			PlanStatus:         "complimentary",
			PlanSource:         "complimentary",
		}},
	}
	r := managedTenantOpsRouter(h)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/tenants/7/entitlement", nil))

	require.Equal(t, http.StatusOK, w.Code)
	var body map[string]any
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &body))
	data := body["data"].(map[string]any)
	assert.Equal(t, float64(100*1024*1024*1024), data["storage_quota_bytes"])
	assert.Equal(t, 0.5, data["storage_usage_percent"])
}

func TestUpdateManagedTenantWhitelistsStatusAndStorageQuota(t *testing.T) {
	audits := &managedAuditStub{}
	tenant := &types.Tenant{ID: 7, Name: "Workspace", Status: "active", StorageQuota: 100}
	service := &managedTenantServiceStub{tenant: tenant}
	h := &SystemHandler{tenantSvc: service, auditSvc: audits}
	r := managedTenantOpsRouter(h)

	invalid := httptest.NewRecorder()
	r.ServeHTTP(invalid, httptest.NewRequest(http.MethodPatch, "/tenants/7", strings.NewReader(`{"status":"suspended"}`)))
	assert.Equal(t, http.StatusBadRequest, invalid.Code)
	assert.Nil(t, service.updated)

	unknown := httptest.NewRecorder()
	r.ServeHTTP(unknown, httptest.NewRequest(http.MethodPatch, "/tenants/7", strings.NewReader(`{"status":"active","plan":"max"}`)))
	assert.Equal(t, http.StatusBadRequest, unknown.Code)
	assert.Nil(t, service.updated)

	valid := httptest.NewRecorder()
	r.ServeHTTP(valid, httptest.NewRequest(http.MethodPatch, "/tenants/7", strings.NewReader(`{"status":"inactive","storage_quota_bytes":2048}`)))
	require.Equal(t, http.StatusOK, valid.Code)
	require.NotNil(t, service.updated)
	assert.Equal(t, "inactive", service.updated.Status)
	assert.Equal(t, int64(2048), service.updated.StorageQuota)
	require.Len(t, audits.entries, 1)
	assert.Equal(t, types.AuditActionSystemTenantUpdated, audits.entries[0].Action)
}

func TestUpdateManagedTenantCreditsSupportsResetAndRejectsAmbiguousBody(t *testing.T) {
	audits := &managedAuditStub{}
	service := &managedTenantServiceStub{tenant: &types.Tenant{ID: 7, Plan: types.ConsumerPlanPlus, PlanStatus: "active"}}
	credits := &managedEntitlementServiceStub{current: &types.ConsumerEntitlement{ConsumerPlanLimits: types.LimitsForConsumerPlan(types.ConsumerPlanPlus)}}
	h := &SystemHandler{tenantSvc: service, entitlementSvc: credits, auditSvc: audits}
	r := managedTenantOpsRouter(h)

	bad := httptest.NewRecorder()
	r.ServeHTTP(bad, httptest.NewRequest(http.MethodPut, "/tenants/7/openrouter-credits", strings.NewReader(`{"reset":true,"remaining_microusd":1}`)))
	assert.Equal(t, http.StatusBadRequest, bad.Code)
	assert.Zero(t, credits.setRemaining)

	unknown := httptest.NewRecorder()
	r.ServeHTTP(unknown, httptest.NewRequest(http.MethodPut, "/tenants/7/openrouter-credits", strings.NewReader(`{"reset":true,"plan":"max"}`)))
	assert.Equal(t, http.StatusBadRequest, unknown.Code)
	assert.Zero(t, credits.setRemaining)

	good := httptest.NewRecorder()
	r.ServeHTTP(good, httptest.NewRequest(http.MethodPut, "/tenants/7/openrouter-credits", strings.NewReader(`{"reset":true}`)))
	require.Equal(t, http.StatusOK, good.Code)
	assert.Equal(t, int64(1_250_000), credits.setRemaining)
	assert.Equal(t, uint64(7), credits.setTenantID)
	require.Len(t, audits.entries, 1)
	assert.Equal(t, types.AuditActionSystemCreditsAdjusted, audits.entries[0].Action)
}

func TestUpdateManagedTenantCreditsResetUsesActiveComplimentaryPlan(t *testing.T) {
	expiresAt := time.Now().UTC().Add(time.Hour)
	service := &managedTenantServiceStub{tenant: &types.Tenant{
		ID:                     7,
		Plan:                   types.ConsumerPlanFree,
		PlanStatus:             "active",
		ComplimentaryPlan:      types.ConsumerPlanMax,
		ComplimentaryExpiresAt: &expiresAt,
		ComplimentaryGrantID:   "grant-reset-12345",
	}}
	credits := &managedEntitlementServiceStub{current: &types.ConsumerEntitlement{
		ConsumerPlanLimits: types.LimitsForConsumerPlan(types.ConsumerPlanMax),
	}}
	h := &SystemHandler{tenantSvc: service, entitlementSvc: credits}
	r := managedTenantOpsRouter(h)

	w := httptest.NewRecorder()
	r.ServeHTTP(w, httptest.NewRequest(http.MethodPut, "/tenants/7/openrouter-credits", strings.NewReader(`{"reset":true}`)))

	require.Equal(t, http.StatusOK, w.Code)
	assert.Equal(t, int64(5_000_000), credits.setRemaining)
}

func TestGrantManagedTenantComplimentaryPlanValidatesAndAuditsAppliedTransition(t *testing.T) {
	audits := &managedAuditStub{}
	expiresAt := time.Now().UTC().Add(2 * time.Hour).Truncate(time.Second)
	tenant := &types.Tenant{ID: 7, Name: "Workspace", Status: "active", Plan: types.ConsumerPlanFree, PlanStatus: "active"}
	service := &managedTenantServiceStub{tenant: tenant}
	credits := &managedEntitlementServiceStub{
		current: &types.ConsumerEntitlement{
			ConsumerPlanLimits: types.LimitsForConsumerPlan(types.ConsumerPlanPro),
			PlanStatus:         "complimentary",
			PlanSource:         "complimentary",
		},
		grantApplied: true,
	}
	h := &SystemHandler{tenantSvc: service, entitlementSvc: credits, auditSvc: audits}
	r := managedTenantOpsRouter(h)

	requestBody := `{"plan":"pro","expires_at":"` + expiresAt.Format(time.RFC3339) + `","grant_id":"grant-1234567890"}`
	w := httptest.NewRecorder()
	r.ServeHTTP(w, httptest.NewRequest(http.MethodPut, "/tenants/7/complimentary-entitlement", strings.NewReader(requestBody)))

	require.Equal(t, http.StatusOK, w.Code)
	assert.Equal(t, types.ConsumerPlanPro, credits.grantPlan)
	assert.Equal(t, expiresAt, credits.grantExpiry)
	assert.Equal(t, "grant-1234567890", credits.grantID)
	var body map[string]any
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &body))
	assert.Equal(t, true, body["applied"])
	require.Len(t, audits.entries, 1)
	assert.Equal(t, types.AuditActionSystemEntitlementGranted, audits.entries[0].Action)
	assert.Contains(t, string(audits.entries[0].Details), "grant-1234567890")
}

func TestGrantManagedTenantComplimentaryPlanRejectsUnknownFieldsTrailingJSONAndLegacyConfirmation(t *testing.T) {
	tenant := &types.Tenant{ID: 7, Name: "Workspace", Status: "active", Plan: types.ConsumerPlanFree, PlanStatus: "active"}
	credits := &managedEntitlementServiceStub{current: &types.ConsumerEntitlement{}}
	h := &SystemHandler{tenantSvc: &managedTenantServiceStub{tenant: tenant}, entitlementSvc: credits}
	r := managedTenantOpsRouter(h)
	expiresAt := time.Now().UTC().Add(time.Hour).Format(time.RFC3339)

	cases := []string{
		`{"plan":"pro","expires_at":"` + expiresAt + `","grant_id":"grant-1234567890","plan_status":"active"}`,
		`{"plan":"pro","expires_at":"` + expiresAt + `","grant_id":"grant-1234567890"}{}`,
		`{"plan":"pro","expires_at":"` + expiresAt + `","grant_id":"grant-1234567890","confirmation":"GRANT:7"}`,
		`{"plan":"pro","expires_at":"2030-01-01T12:00:00","grant_id":"grant-1234567890"}`,
	}
	for i, payload := range cases {
		w := httptest.NewRecorder()
		r.ServeHTTP(w, httptest.NewRequest(http.MethodPut, "/tenants/7/complimentary-entitlement", strings.NewReader(payload)))
		assert.Equalf(t, http.StatusBadRequest, w.Code, "case %d response=%s", i, w.Body.String())
	}
	assert.Empty(t, credits.grantID)
}

func TestGrantManagedTenantComplimentaryPlanMapsServiceConflict(t *testing.T) {
	tenant := &types.Tenant{ID: 7, Name: "Workspace", Status: "active", Plan: types.ConsumerPlanFree, PlanStatus: "active"}
	credits := &managedEntitlementServiceStub{
		current:    &types.ConsumerEntitlement{},
		grantError: apperrors.NewConflictError("tenant has a Paddle subscription"),
	}
	h := &SystemHandler{tenantSvc: &managedTenantServiceStub{tenant: tenant}, entitlementSvc: credits}
	r := managedTenantOpsRouter(h)
	expiresAt := time.Now().UTC().Add(time.Hour).Format(time.RFC3339)
	payload := `{"plan":"pro","expires_at":"` + expiresAt + `","grant_id":"grant-1234567890"}`
	w := httptest.NewRecorder()
	r.ServeHTTP(w, httptest.NewRequest(http.MethodPut, "/tenants/7/complimentary-entitlement", strings.NewReader(payload)))
	assert.Equal(t, http.StatusConflict, w.Code)
}

func TestGrantManagedTenantComplimentaryPlanMapsTransientLookupAndServiceFailuresTo503(t *testing.T) {
	expiresAt := time.Now().UTC().Add(time.Hour).Format(time.RFC3339)
	payload := `{"plan":"pro","expires_at":"` + expiresAt + `","grant_id":"grant-1234567890"}`

	lookup := &managedTenantServiceStub{getErr: errors.New("database unavailable")}
	credits := &managedEntitlementServiceStub{current: &types.ConsumerEntitlement{}}
	h := &SystemHandler{tenantSvc: lookup, entitlementSvc: credits}
	w := httptest.NewRecorder()
	managedTenantOpsRouter(h).ServeHTTP(w, httptest.NewRequest(http.MethodPut, "/tenants/7/complimentary-entitlement", strings.NewReader(payload)))
	assert.Equal(t, http.StatusServiceUnavailable, w.Code)
	assert.Empty(t, credits.grantID, "mutation must not run after a transient tenant lookup failure")

	lookup = &managedTenantServiceStub{tenant: &types.Tenant{ID: 7, Plan: types.ConsumerPlanFree}}
	credits = &managedEntitlementServiceStub{grantError: errors.New("database unavailable")}
	h = &SystemHandler{tenantSvc: lookup, entitlementSvc: credits}
	w = httptest.NewRecorder()
	managedTenantOpsRouter(h).ServeHTTP(w, httptest.NewRequest(http.MethodPut, "/tenants/7/complimentary-entitlement", strings.NewReader(payload)))
	assert.Equal(t, http.StatusServiceUnavailable, w.Code)
}

func TestGrantManagedTenantComplimentaryPlanMapsOnlyTenantNotFoundLookupTo404(t *testing.T) {
	expiresAt := time.Now().UTC().Add(time.Hour).Format(time.RFC3339)
	payload := `{"plan":"pro","expires_at":"` + expiresAt + `","grant_id":"grant-1234567890"}`

	lookup := &managedTenantServiceStub{getErr: repository.ErrTenantNotFound}
	h := &SystemHandler{tenantSvc: lookup, entitlementSvc: &managedEntitlementServiceStub{}}
	w := httptest.NewRecorder()
	managedTenantOpsRouter(h).ServeHTTP(w, httptest.NewRequest(http.MethodPut, "/tenants/7/complimentary-entitlement", strings.NewReader(payload)))
	assert.Equal(t, http.StatusNotFound, w.Code)
}

func TestGrantManagedTenantComplimentaryPlanAuditsCommittedProviderSyncFailure(t *testing.T) {
	audits := &managedAuditStub{}
	tenant := &types.Tenant{ID: 7, Name: "Workspace", Status: "active", Plan: types.ConsumerPlanFree, PlanStatus: "active"}
	credits := &managedEntitlementServiceStub{
		grantApplied: true,
		grantError:   apperrors.NewServiceUnavailableError("provider unavailable"),
	}
	h := &SystemHandler{tenantSvc: &managedTenantServiceStub{tenant: tenant}, entitlementSvc: credits, auditSvc: audits}
	r := managedTenantOpsRouter(h)
	expiresAt := time.Now().UTC().Add(time.Hour).Format(time.RFC3339)
	payload := `{"plan":"max","expires_at":"` + expiresAt + `","grant_id":"grant-provider-123"}`
	w := httptest.NewRecorder()
	r.ServeHTTP(w, httptest.NewRequest(http.MethodPut, "/tenants/7/complimentary-entitlement", strings.NewReader(payload)))

	assert.Equal(t, http.StatusServiceUnavailable, w.Code)
	require.Len(t, audits.entries, 1)
	assert.Equal(t, types.AuditActionSystemEntitlementGranted, audits.entries[0].Action)
	assert.Contains(t, string(audits.entries[0].Details), "grant-provider-123")
}

func TestRevokeManagedTenantComplimentaryPlanUsesCompareAndSetIDAndAuditsAppliedTransition(t *testing.T) {
	audits := &managedAuditStub{}
	expiresAt := time.Now().UTC().Add(time.Hour).Truncate(time.Second)
	tenant := &types.Tenant{
		ID: 7, Name: "Workspace", Status: "active", Plan: types.ConsumerPlanFree, PlanStatus: "active",
		ComplimentaryPlan: types.ConsumerPlanPro, ComplimentaryExpiresAt: &expiresAt, ComplimentaryGrantID: "grant-1234567890",
	}
	credits := &managedEntitlementServiceStub{
		current: &types.ConsumerEntitlement{
			ConsumerPlanLimits: types.LimitsForConsumerPlan(types.ConsumerPlanFree),
			PlanStatus:         "active",
			PlanSource:         "free",
		},
		revokeApplied: true,
	}
	h := &SystemHandler{tenantSvc: &managedTenantServiceStub{tenant: tenant}, entitlementSvc: credits, auditSvc: audits}
	r := managedTenantOpsRouter(h)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, httptest.NewRequest(http.MethodDelete, "/tenants/7/complimentary-entitlement", strings.NewReader(`{"grant_id":"grant-1234567890"}`)))

	require.Equal(t, http.StatusOK, w.Code)
	assert.Equal(t, "grant-1234567890", credits.revokeID)
	require.Len(t, audits.entries, 1)
	assert.Equal(t, types.AuditActionSystemEntitlementRevoked, audits.entries[0].Action)
}

func TestRevokeManagedTenantComplimentaryPlanAuditsCommittedProviderSyncFailure(t *testing.T) {
	audits := &managedAuditStub{}
	expiresAt := time.Now().UTC().Add(time.Hour).Truncate(time.Second)
	tenant := &types.Tenant{
		ID: 7, Name: "Workspace", Status: "active", Plan: types.ConsumerPlanFree, PlanStatus: "active",
		ComplimentaryPlan: types.ConsumerPlanPlus, ComplimentaryExpiresAt: &expiresAt, ComplimentaryGrantID: "grant-provider-123",
	}
	credits := &managedEntitlementServiceStub{
		revokeApplied: true,
		revokeError:   apperrors.NewServiceUnavailableError("provider unavailable"),
	}
	h := &SystemHandler{tenantSvc: &managedTenantServiceStub{tenant: tenant}, entitlementSvc: credits, auditSvc: audits}
	r := managedTenantOpsRouter(h)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, httptest.NewRequest(http.MethodDelete, "/tenants/7/complimentary-entitlement", strings.NewReader(`{"grant_id":"grant-provider-123"}`)))

	assert.Equal(t, http.StatusServiceUnavailable, w.Code)
	require.Len(t, audits.entries, 1)
	assert.Equal(t, types.AuditActionSystemEntitlementRevoked, audits.entries[0].Action)
	assert.Contains(t, string(audits.entries[0].Details), "grant-provider-123")
}

func TestRevokeManagedTenantComplimentaryPlanMapsTransientLookupAndServiceFailuresTo503(t *testing.T) {
	body := `{"grant_id":"grant-1234567890"}`

	lookup := &managedTenantServiceStub{getErr: errors.New("database unavailable")}
	credits := &managedEntitlementServiceStub{}
	h := &SystemHandler{tenantSvc: lookup, entitlementSvc: credits}
	w := httptest.NewRecorder()
	managedTenantOpsRouter(h).ServeHTTP(w, httptest.NewRequest(http.MethodDelete, "/tenants/7/complimentary-entitlement", strings.NewReader(body)))
	assert.Equal(t, http.StatusServiceUnavailable, w.Code)
	assert.Empty(t, credits.revokeID, "mutation must not run after a transient tenant lookup failure")

	lookup = &managedTenantServiceStub{tenant: &types.Tenant{ID: 7, Plan: types.ConsumerPlanFree}}
	credits = &managedEntitlementServiceStub{revokeError: errors.New("database unavailable")}
	h = &SystemHandler{tenantSvc: lookup, entitlementSvc: credits}
	w = httptest.NewRecorder()
	managedTenantOpsRouter(h).ServeHTTP(w, httptest.NewRequest(http.MethodDelete, "/tenants/7/complimentary-entitlement", strings.NewReader(body)))
	assert.Equal(t, http.StatusServiceUnavailable, w.Code)
}

func TestRevokeManagedTenantComplimentaryPlanMapsOnlyTenantNotFoundLookupTo404(t *testing.T) {
	body := `{"grant_id":"grant-1234567890"}`
	h := &SystemHandler{
		tenantSvc:      &managedTenantServiceStub{getErr: repository.ErrTenantNotFound},
		entitlementSvc: &managedEntitlementServiceStub{},
	}
	w := httptest.NewRecorder()
	managedTenantOpsRouter(h).ServeHTTP(w, httptest.NewRequest(http.MethodDelete, "/tenants/7/complimentary-entitlement", strings.NewReader(body)))
	assert.Equal(t, http.StatusNotFound, w.Code)
}
