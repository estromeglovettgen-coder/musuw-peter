package service

import (
	"context"
	"strings"
	"testing"

	"github.com/Tencent/WeKnora/internal/types"
	"github.com/stretchr/testify/require"
)

func TestResolveManualCuratedFields(t *testing.T) {
	trueValue := true
	falseValue := false
	previous := &types.ManualKnowledgeMetadata{
		CuratedSummary:     "原有人工摘要",
		SkipAutoEnrichment: true,
	}
	tests := []struct {
		name    string
		payload types.ManualKnowledgePayload
		before  *types.ManualKnowledgeMetadata
		want    string
		skip    bool
		invalid bool
	}{
		{name: "ordinary document", payload: types.ManualKnowledgePayload{}},
		{name: "curated document", payload: types.ManualKnowledgePayload{
			CuratedSummary: "人工摘要", SkipAutoEnrichment: &trueValue,
		}, want: "人工摘要", skip: true},
		{
			name: "ordinary editor preserves curation", before: previous,
			payload: types.ManualKnowledgePayload{}, want: "原有人工摘要", skip: true,
		},
		{
			name: "explicit opt out", before: previous,
			payload: types.ManualKnowledgePayload{SkipAutoEnrichment: &falseValue},
		},
		{name: "missing summary", payload: types.ManualKnowledgePayload{
			SkipAutoEnrichment: &trueValue,
		}, invalid: true},
		{name: "summary without curation", payload: types.ManualKnowledgePayload{
			CuratedSummary: "人工摘要",
		}, invalid: true},
		{name: "oversized summary", payload: types.ManualKnowledgePayload{
			CuratedSummary: strings.Repeat("文", 2001), SkipAutoEnrichment: &trueValue,
		}, invalid: true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			summary, skip, err := resolveManualCuratedFields(&tt.payload, tt.before)
			if tt.invalid {
				require.Error(t, err)
				return
			}
			require.NoError(t, err)
			require.Equal(t, tt.want, summary)
			require.Equal(t, tt.skip, skip)
		})
	}
}

func TestCuratedManualDescriptionEditPreservesSummaryAndOverrides(t *testing.T) {
	manual := types.NewManualKnowledgeMetadata("# public content", types.ManualKnowledgeStatusPublish, 1)
	manual.CuratedSummary = "旧摘要"
	manual.SkipAutoEnrichment = true
	record := &types.Knowledge{
		ID: "curated-1", TenantID: 7, Type: types.KnowledgeTypeManual,
		Description: manual.CuratedSummary, SummaryStatus: types.SummaryStatusCompleted,
	}
	require.NoError(t, record.SetManualMetadata(manual))
	falseValue := false
	require.NoError(t, record.SetProcessOverrides(&types.KnowledgeProcessOverrides{
		GraphEnabled: &falseValue,
	}))
	repo := &createKnowledgeFileRepoStub{knowledgeByID: record}
	service := &knowledgeService{repo: repo}
	ctx := context.WithValue(context.Background(), types.TenantIDContextKey, uint64(7))
	require.NoError(t, service.UpdateKnowledge(ctx, &types.Knowledge{
		ID: "curated-1", Description: "更新后的人工摘要", DescriptionSpecified: true,
	}))
	require.Equal(t, "更新后的人工摘要", repo.updatedKnowledge.Description)
	got, err := repo.updatedKnowledge.ManualMetadata()
	require.NoError(t, err)
	require.Equal(t, "更新后的人工摘要", got.CuratedSummary)
	require.True(t, got.SkipAutoEnrichment)
	overrides, err := repo.updatedKnowledge.ProcessOverrides()
	require.NoError(t, err)
	require.NotNil(t, overrides)
	require.False(t, *overrides.GraphEnabled)
	require.ErrorIs(t, enqueueSummaryRefresh(ctx, nil, nil, nil, nil, repo.updatedKnowledge),
		ErrCuratedManualEnrichmentDisabled)
	require.ErrorIs(t, rejectCuratedManualEnrichment(repo.updatedKnowledge),
		ErrCuratedManualEnrichmentDisabled)
}
