package handler

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/Tencent/WeKnora/internal/types"
	"github.com/Tencent/WeKnora/internal/types/interfaces"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
)

type storageQuotaTenantServiceStub struct {
	interfaces.TenantService
	quotaBytes int64
}

func (s *storageQuotaTenantServiceStub) BulkSetStorageQuota(_ context.Context, quotaBytes int64) (int64, error) {
	s.quotaBytes = quotaBytes
	return 1, nil
}

type storageQuotaSettingServiceStub struct {
	interfaces.SystemSettingService
}

func (s *storageQuotaSettingServiceStub) GetInt(_ context.Context, _ string, _ string, def int64) int64 {
	return def
}

func TestApplyDefaultStorageQuotaUsesFreePlanWhenSettingIsMissing(t *testing.T) {
	gin.SetMode(gin.TestMode)
	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	ctx.Request = httptest.NewRequest("POST", "/system/admin/tenants/apply-default-storage-quota", nil)

	tenantSvc := &storageQuotaTenantServiceStub{}
	h := &SystemHandler{
		tenantSvc:        tenantSvc,
		systemSettingSvc: &storageQuotaSettingServiceStub{},
	}
	h.ApplyDefaultStorageQuotaToAllTenants(ctx)

	require.Equal(t, http.StatusOK, recorder.Code)
	require.Equal(t, types.LimitsForConsumerPlan(types.ConsumerPlanFree).StorageBytes, tenantSvc.quotaBytes)
}
