package memory

import (
	"context"
	"testing"

	"github.com/Tencent/WeKnora/internal/types"
	"github.com/stretchr/testify/require"
)

type workerPromptTenantRepo struct {
	*stubTenantRepo
	prompts types.SystemPromptConfig
}

func (r workerPromptTenantRepo) GetTenantByID(ctx context.Context, id uint64) (*types.Tenant, error) {
	tenant, err := r.stubTenantRepo.GetTenantByID(ctx, id)
	if tenant != nil {
		tenant.SystemPromptConfig = r.prompts
	}
	return tenant, err
}

func TestMemoryExtractWorkerRestoresWorkspacePrompt(t *testing.T) {
	svc, tenants, messages, models, _ := newExtractionHarness(t)
	tenants.set(7, &types.MemoryConfig{Enabled: true, WriteMode: types.MemoryWriteAuto})
	svc.tenantRepo = workerPromptTenantRepo{stubTenantRepo: tenants, prompts: types.SystemPromptConfig{
		"memory.extract": "只保存用户明确说出的销售工作偏好，返回约定 JSON。",
	}}
	messages.messages = []*types.Message{{Role: "user", Content: "先给我成交下一步，再解释原因。"}}
	models.response = `{"memories":[]}`

	// Both task executors start with a bare context; the owning workspace must
	// be restored at the worker boundary before making the model request.
	err := svc.Handle(context.Background(), extractTask(t, types.MemoryExtractPayload{
		TenantID: 7, SubjectID: "web_user:alice", SessionID: "s", ChatModelID: "chat-1",
	}))
	require.NoError(t, err)
	require.Contains(t, models.lastPrompt, "只保存用户明确说出的销售工作偏好")
	require.Contains(t, models.lastPrompt, "先给我成交下一步，再解释原因。")
	require.NotEmpty(t, models.lastFormat, "the worker must retain the machine response schema")
}

func TestMemoryExtractOverrideReachesModel(t *testing.T) {
	svc, _, _, models, _ := newExtractionHarness(t)
	models.response = `{"memories":[]}`
	ctx := context.WithValue(context.Background(), types.TenantIDContextKey, uint64(7))
	ctx = context.WithValue(ctx, types.TenantInfoContextKey, &types.Tenant{
		ID: 7,
		SystemPromptConfig: types.SystemPromptConfig{
			"memory.extract": "只提取用户明确说出的销售工作偏好，返回约定 JSON。",
		},
	})
	_, err := svc.completeExtraction(ctx, &stubChatModel{owner: models}, "以后先给我成交下一步，再解释原因。", 600)
	require.NoError(t, err)
	require.Contains(t, models.lastPrompt, "只提取用户明确说出的销售工作偏好")
	require.NotContains(t, models.lastPrompt, "你负责根据用户与助手的交流")
	require.NotEmpty(t, models.lastFormat, "workspace instructions cannot remove the machine response schema")
}
