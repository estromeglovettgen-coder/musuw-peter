package handler

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/Tencent/WeKnora/internal/types"
	"github.com/Tencent/WeKnora/internal/types/interfaces"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
)

type memoryExportStub struct {
	interfaces.MemoryService
	items []*types.MemoryItem
	total int64
	calls []struct {
		status string
		limit  int
		offset int
	}
}

func (s *memoryExportStub) ListItems(
	_ context.Context, status string, limit, offset int,
) ([]*types.MemoryItem, int64, error) {
	s.calls = append(s.calls, struct {
		status string
		limit  int
		offset int
	}{status: status, limit: limit, offset: offset})
	if offset >= len(s.items) {
		return nil, s.total, nil
	}
	end := offset + limit
	if end > len(s.items) {
		end = len(s.items)
	}
	return s.items[offset:end], s.total, nil
}

func runMemoryExport(t *testing.T, service interfaces.MemoryService) *httptest.ResponseRecorder {
	t.Helper()
	gin.SetMode(gin.TestMode)
	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	ctx.Request = httptest.NewRequest(http.MethodGet, "/api/v1/memory/export", nil)
	(&MemoryHandler{memoryService: service}).Export(ctx)
	return recorder
}

func TestMemoryExportPagesEveryStatusAndPreservesUnicode(t *testing.T) {
	items := make([]*types.MemoryItem, 501)
	for i := range items {
		items[i] = &types.MemoryItem{
			ID:      fmt.Sprintf("id-%d", i),
			Kind:    types.MemoryKindFact,
			Content: fmt.Sprintf("中文记忆 %d", i),
			Status:  types.MemoryStatusActive,
		}
	}
	stub := &memoryExportStub{items: items, total: int64(len(items))}
	recorder := runMemoryExport(t, stub)

	require.Equal(t, http.StatusOK, recorder.Code)
	require.Equal(t, `attachment; filename="weknora-memories.json"`, recorder.Header().Get("Content-Disposition"))
	var payload struct {
		Success   bool                `json:"success"`
		Total     int64               `json:"total"`
		Truncated bool                `json:"truncated"`
		Data      []*types.MemoryItem `json:"data"`
	}
	require.NoError(t, json.Unmarshal(recorder.Body.Bytes(), &payload))
	require.True(t, payload.Success)
	require.Equal(t, int64(501), payload.Total)
	require.False(t, payload.Truncated)
	require.Len(t, payload.Data, 501)
	require.Equal(t, "中文记忆 0", payload.Data[0].Content)
	require.Equal(t, "中文记忆 500", payload.Data[500].Content)
	require.Equal(t, []struct {
		status string
		limit  int
		offset int
	}{
		{status: "", limit: memoryExportPageSize, offset: 0},
		{status: "", limit: memoryExportPageSize, offset: 500},
	}, stub.calls)
}

func TestMemoryExportEmptyStoreIsAnHonestNoDataSnapshot(t *testing.T) {
	stub := &memoryExportStub{total: 0}
	recorder := runMemoryExport(t, stub)

	require.Equal(t, http.StatusOK, recorder.Code)
	var payload struct {
		Success   bool                `json:"success"`
		Total     int64               `json:"total"`
		Truncated bool                `json:"truncated"`
		Data      []*types.MemoryItem `json:"data"`
	}
	require.NoError(t, json.Unmarshal(recorder.Body.Bytes(), &payload))
	require.True(t, payload.Success)
	require.Zero(t, payload.Total)
	require.False(t, payload.Truncated)
	require.Empty(t, payload.Data)
	require.Len(t, stub.calls, 1)
}

func TestMemoryExportMarksSafetyCeilingAsTruncated(t *testing.T) {
	items := make([]*types.MemoryItem, memoryExportMaxItems+1)
	for i := range items {
		items[i] = &types.MemoryItem{ID: fmt.Sprintf("id-%d", i), Content: "记忆"}
	}
	stub := &memoryExportStub{items: items, total: int64(len(items))}
	recorder := runMemoryExport(t, stub)

	require.Equal(t, http.StatusOK, recorder.Code)
	var payload struct {
		Total     int64               `json:"total"`
		Truncated bool                `json:"truncated"`
		Data      []*types.MemoryItem `json:"data"`
	}
	require.NoError(t, json.Unmarshal(recorder.Body.Bytes(), &payload))
	require.Equal(t, int64(memoryExportMaxItems+1), payload.Total)
	require.True(t, payload.Truncated)
	require.Len(t, payload.Data, memoryExportMaxItems)
}
