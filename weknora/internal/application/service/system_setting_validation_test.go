package service

import (
	"context"
	"encoding/json"
	"sync"
	"testing"

	"github.com/Tencent/WeKnora/internal/types"
)

func TestValidateWorkerConcurrencyMinimums(t *testing.T) {
	tests := []struct {
		name    string
		key     string
		value   any
		wantErr bool
	}{
		{name: "core zero", key: "asynq.core_concurrency", value: 0, wantErr: true},
		{name: "core minimum", key: "asynq.core_concurrency", value: 1},
		{name: "postprocess minimum", key: "asynq.postprocess_concurrency", value: 1},
		{name: "enrichment minimum", key: "asynq.enrichment_concurrency", value: 1},
		{name: "maintenance minimum", key: "asynq.maintenance_concurrency", value: 1},
		{name: "shared minimum", key: "asynq.shared_concurrency", value: 1},
		{name: "wiki zero", key: "asynq.wiki_concurrency", value: 0, wantErr: true},
		{name: "wiki minimum", key: "asynq.wiki_concurrency", value: 1},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := validateRegistryEntry(tt.key, tt.value)
			if tt.wantErr && err == nil {
				t.Fatal("expected validation error")
			}
			if !tt.wantErr && err != nil {
				t.Fatalf("unexpected validation error: %v", err)
			}
		})
	}
}

func TestDefaultStorageSettingMatchesFreePlan(t *testing.T) {
	spec, ok := registry["tenant.default_storage_quota_gb"]
	if !ok {
		t.Fatal("tenant.default_storage_quota_gb is not registered")
	}
	want := types.LimitsForConsumerPlan(types.ConsumerPlanFree).StorageBytes / (1024 * 1024 * 1024)
	if got, ok := spec.Default.(int64); !ok || got != want {
		t.Fatalf("default storage setting = %#v, want %d GiB", spec.Default, want)
	}
}

type consumerSceneSettingRepository struct {
	mu   sync.RWMutex
	rows map[string]*types.SystemSetting
}

func (r *consumerSceneSettingRepository) Get(_ context.Context, key string) (*types.SystemSetting, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	return r.rows[key], nil
}

func (r *consumerSceneSettingRepository) List(context.Context) ([]*types.SystemSetting, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	rows := make([]*types.SystemSetting, 0, len(r.rows))
	for _, row := range r.rows {
		rows = append(rows, row)
	}
	return rows, nil
}

func (r *consumerSceneSettingRepository) Upsert(_ context.Context, setting *types.SystemSetting) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	if r.rows == nil {
		r.rows = make(map[string]*types.SystemSetting)
	}
	r.rows[setting.Key] = setting
	return nil
}

func (r *consumerSceneSettingRepository) Delete(_ context.Context, key string) (bool, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	if _, ok := r.rows[key]; !ok {
		return false, nil
	}
	delete(r.rows, key)
	return true, nil
}

func (r *consumerSceneSettingRepository) value(key string) types.JSON {
	r.mu.RLock()
	defer r.mu.RUnlock()
	if row := r.rows[key]; row != nil {
		return append(types.JSON(nil), row.Value...)
	}
	return nil
}

func TestConsumerSceneSettingsPreserveOrderAndRejectWrongType(t *testing.T) {
	repo := &consumerSceneSettingRepository{rows: map[string]*types.SystemSetting{}}
	svc := NewSystemSettingService(repo, nil, nil, nil)
	ctx := context.Background()
	want := []string{"builtin-deepseek-v4-pro", types.CheapestChatModelID}
	row, err := svc.Update(ctx, "consumer_models.chat.paid_options", want)
	if err != nil {
		t.Fatalf("Update returned error: %v", err)
	}
	got, err := row.AsStringList()
	if err != nil {
		t.Fatalf("AsStringList returned error: %v", err)
	}
	if len(got) != len(want) || got[0] != want[0] || got[1] != want[1] {
		t.Fatalf("order changed: got %#v want %#v", got, want)
	}
	if _, err := svc.Update(ctx, "consumer_models.chat.free_default", []string{types.CheapestChatModelID}); err == nil {
		t.Fatal("expected wrong value type to be rejected")
	}

	encoded, err := json.Marshal(want)
	if err != nil {
		t.Fatal(err)
	}
	persisted := repo.value("consumer_models.chat.paid_options")
	if string(persisted) != string(encoded) {
		t.Fatalf("repository order changed: got %s want %s", persisted, encoded)
	}
}
