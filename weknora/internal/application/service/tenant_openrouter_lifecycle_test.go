package service

import (
	"context"
	"fmt"
	"testing"

	modelopenrouter "github.com/Tencent/WeKnora/internal/models/openrouter"
	"github.com/Tencent/WeKnora/internal/types"
	"github.com/Tencent/WeKnora/internal/types/interfaces"
	"github.com/stretchr/testify/require"
)

type tenantLifecycleRepoStub struct {
	interfaces.TenantRepository
	tenant  *types.Tenant
	deleted bool
}

func cloneTenantForLifecycleTest(in *types.Tenant) *types.Tenant {
	if in == nil {
		return nil
	}
	cp := *in
	if in.Credentials != nil {
		credentials := *in.Credentials
		if in.Credentials.OpenRouter != nil {
			openRouter := *in.Credentials.OpenRouter
			credentials.OpenRouter = &openRouter
		}
		cp.Credentials = &credentials
	}
	return &cp
}

func (r *tenantLifecycleRepoStub) CreateTenant(_ context.Context, tenant *types.Tenant) error {
	if tenant.ID == 0 {
		tenant.ID = 42
	}
	r.tenant = cloneTenantForLifecycleTest(tenant)
	return nil
}

func (r *tenantLifecycleRepoStub) GetTenantByID(_ context.Context, id uint64) (*types.Tenant, error) {
	if r.tenant == nil || r.tenant.ID != id {
		return nil, fmt.Errorf("tenant not found")
	}
	return cloneTenantForLifecycleTest(r.tenant), nil
}

func (r *tenantLifecycleRepoStub) UpdateTenant(_ context.Context, tenant *types.Tenant) error {
	cp := cloneTenantForLifecycleTest(tenant)
	// GORM Updates(struct) ignores nil pointer fields. Preserve the currently
	// stored credentials when the caller is only changing status/name.
	if cp.Credentials == nil && r.tenant != nil {
		cp.Credentials = cloneTenantForLifecycleTest(r.tenant).Credentials
	}
	r.tenant = cp
	return nil
}

func (r *tenantLifecycleRepoStub) DeleteTenant(_ context.Context, id uint64) error {
	if r.tenant != nil && r.tenant.ID == id {
		r.deleted = true
	}
	return nil
}

type tenantLifecycleCreateCall struct {
	name  string
	limit int64
}

type tenantLifecycleKeyManager struct {
	creates []tenantLifecycleCreateCall
	deletes []string
}

func (m *tenantLifecycleKeyManager) CreateKey(_ context.Context, name string, limitMicrousd int64, _ bool) (*modelopenrouter.ManagedKey, error) {
	m.creates = append(m.creates, tenantLifecycleCreateCall{name: name, limit: limitMicrousd})
	n := len(m.creates)
	return &modelopenrouter.ManagedKey{Key: fmt.Sprintf("sk-test-%d", n), Hash: fmt.Sprintf("hash-%d", n)}, nil
}

func (m *tenantLifecycleKeyManager) UpdateKeyLimit(context.Context, string, int64, bool) error {
	return nil
}
func (m *tenantLifecycleKeyManager) GetKey(context.Context, string) (*modelopenrouter.KeyInfo, error) {
	return nil, nil
}
func (m *tenantLifecycleKeyManager) DeleteKey(_ context.Context, hash string) error {
	m.deletes = append(m.deletes, hash)
	return nil
}

func TestCreateTenantDefersOpenRouterKeyUntilFirstInference(t *testing.T) {
	repo := &tenantLifecycleRepoStub{}
	keys := &tenantLifecycleKeyManager{}
	svc := newTenantService(repo, nil, keys)

	tenant, err := svc.CreateTenant(context.Background(), &types.Tenant{Name: "Personal"})
	require.NoError(t, err)
	require.Empty(t, keys.creates)
	require.Nil(t, tenant.Credentials)
}

func TestCreateTenantDiscardsCallerSuppliedOpenRouterKey(t *testing.T) {
	repo := &tenantLifecycleRepoStub{}
	svc := newTenantService(repo, nil, &tenantLifecycleKeyManager{})

	tenant, err := svc.CreateTenant(context.Background(), &types.Tenant{
		Name: "Personal",
		Credentials: &types.CredentialsConfig{OpenRouter: &types.OpenRouterCredentials{
			APIKey: "caller-key", KeyHash: "caller-hash",
		}},
	})
	require.NoError(t, err)
	require.NotNil(t, tenant.Credentials)
	require.Nil(t, tenant.Credentials.OpenRouter)
}

func TestTenantDeleteRemovesProviderKeyBeforeWorkspace(t *testing.T) {
	repo := &tenantLifecycleRepoStub{tenant: &types.Tenant{
		ID:     42,
		Name:   "Personal",
		Status: "active",
		Credentials: &types.CredentialsConfig{OpenRouter: &types.OpenRouterCredentials{
			APIKey: "sk-existing", KeyHash: "hash-existing",
		}},
	}}
	keys := &tenantLifecycleKeyManager{}
	svc := newTenantService(repo, nil, keys)

	err := svc.DeleteTenant(context.Background(), 42)
	require.NoError(t, err)
	require.Equal(t, []string{"hash-existing"}, keys.deletes)
	require.True(t, repo.deleted)
	require.Nil(t, repo.tenant.Credentials.OpenRouter)
}

func TestTenantSuspendPreservesProviderKey(t *testing.T) {
	repo := &tenantLifecycleRepoStub{tenant: &types.Tenant{
		ID:     42,
		Name:   "Personal",
		Status: "active",
		Plan:   types.ConsumerPlanPro,
		Credentials: &types.CredentialsConfig{OpenRouter: &types.OpenRouterCredentials{
			APIKey: "sk-existing", KeyHash: "hash-existing",
		}},
	}}
	keys := &tenantLifecycleKeyManager{}
	svc := newTenantService(repo, nil, keys)

	_, err := svc.UpdateTenant(context.Background(), &types.Tenant{ID: 42, Name: "Personal", Status: "suspended", Plan: types.ConsumerPlanPro})
	require.NoError(t, err)
	require.Empty(t, keys.deletes)
	require.Empty(t, keys.creates)
	require.Equal(t, "hash-existing", repo.tenant.Credentials.OpenRouter.KeyHash)
}

func TestTenantUpdateOfOtherCredentialsPreservesProviderKey(t *testing.T) {
	repo := &tenantLifecycleRepoStub{tenant: &types.Tenant{
		ID:   42,
		Name: "Personal",
		Credentials: &types.CredentialsConfig{OpenRouter: &types.OpenRouterCredentials{
			APIKey: "sk-existing", KeyHash: "hash-existing",
		}},
	}}
	svc := newTenantService(repo, nil, &tenantLifecycleKeyManager{})

	updated, err := svc.UpdateTenant(context.Background(), &types.Tenant{
		ID:   42,
		Name: "Personal",
		Credentials: &types.CredentialsConfig{WeKnoraCloud: &types.WeKnoraCloudCredentials{
			AppID: "app", AppSecret: "secret",
		}},
	})
	require.NoError(t, err)
	require.Equal(t, "hash-existing", updated.Credentials.OpenRouter.KeyHash)
	require.Equal(t, "app", updated.Credentials.WeKnoraCloud.AppID)
}
