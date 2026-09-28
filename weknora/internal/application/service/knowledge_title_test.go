package service

import (
	"context"
	"strings"
	"testing"

	"github.com/Tencent/WeKnora/internal/types"
	"github.com/stretchr/testify/require"
)

func TestConciseAnalysisTitleRejectsCaptionLikeOutput(t *testing.T) {
	t.Parallel()

	for _, raw := range []string{
		"倘若遇到那个人 那就永远不要分开 #文案 #日落",
		"one two three four five six seven eight nine ten eleven",
		strings.Repeat("长", 41),
		strings.Repeat("long", 21),
	} {
		require.Empty(t, conciseAnalysisTitle(raw), "caption-like title must be rejected: %q", raw)
	}
	require.Equal(t, "利用 Claude Code 创建 Instagram Reels", conciseAnalysisTitle("利用 Claude Code 创建 Instagram Reels"))
}

func TestUpdateKnowledgeTitleFromAnalysisUsesOneURLPathForEveryPlatform(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name   string
		source string
		title  string
		want   string
	}{
		{
			name: "youtube", source: "https://youtu.be/example",
			title: "YouTube video summary", want: "YouTube video summary",
		},
		{name: "x", source: "https://x.com/example/status/1", title: "X video summary", want: "X video summary"},
		{
			name: "instagram", source: "https://www.instagram.com/reel/example/",
			title: "Instagram video summary", want: "Instagram video summary",
		},
		{
			name: "douyin", source: "https://v.douyin.com/example/",
			title: "Douyin video summary", want: "Douyin video summary",
		},
		{
			name: "xiaohongshu", source: "https://www.xiaohongshu.com/explore/example",
			title: "XHS video summary", want: "XHS video summary",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			repo := &videoIngestionRepoStub{}
			svc := &knowledgeService{repo: repo}
			knowledge := &types.Knowledge{
				ID:     "knowledge-" + tt.name,
				Type:   "url",
				Source: tt.source,
				Title:  tt.source,
			}

			err := svc.updateKnowledgeTitleFromAnalysis(context.Background(), knowledge, &types.ReadResult{
				Metadata: map[string]string{"title": tt.title},
			})

			require.NoError(t, err)
			require.Equal(t, tt.want, knowledge.Title)
			require.Equal(t, []string{tt.want}, repo.automaticTitleUpdates)
		})
	}
}

func TestUpdateKnowledgeTitleFromAnalysisDoesNotOverwriteManualRename(t *testing.T) {
	t.Parallel()

	repo := &videoIngestionRepoStub{}
	svc := &knowledgeService{repo: repo}
	knowledge := &types.Knowledge{
		ID:     "knowledge-manual-title",
		Type:   "url",
		Source: "https://x.com/example/status/1",
		Title:  "My manual title",
	}

	err := svc.updateKnowledgeTitleFromAnalysis(context.Background(), knowledge, &types.ReadResult{
		Metadata: map[string]string{"title": "AI generated title"},
	})

	require.NoError(t, err)
	require.Equal(t, "My manual title", knowledge.Title)
	require.Empty(t, repo.automaticTitleUpdates)
}

func TestUpdateKnowledgeTitleFromAnalysisIgnoresProviderCaptionHeading(t *testing.T) {
	t.Parallel()

	const source = "https://v.douyin.com/example/"
	repo := &videoIngestionRepoStub{}
	svc := &knowledgeService{repo: repo}
	knowledge := &types.Knowledge{
		ID: "knowledge-provider-caption", TenantID: 1, Type: "url", Source: source, Title: source,
	}

	err := svc.updateKnowledgeTitleFromAnalysis(context.Background(), knowledge, &types.ReadResult{
		MarkdownContent: "# 倘若遇到那个人 那就永远不要分开 #文案 #日落 #2024图文伙伴计划\n\n![image](stored.jpg)",
	})

	require.NoError(t, err)
	require.Equal(t, source, knowledge.Title)
	require.Empty(t, repo.automaticTitleUpdates)
}

func TestUpdateKnowledgeTitleFromAnalysisHonorsConcurrentRename(t *testing.T) {
	t.Parallel()

	source := "https://x.com/example/status/1"
	repo := &videoIngestionRepoStub{rejectAutomaticTitleUpdate: true}
	svc := &knowledgeService{repo: repo}
	knowledge := &types.Knowledge{
		ID:       "knowledge-concurrent-title",
		TenantID: 1,
		Type:     "url",
		Source:   source,
		Title:    source,
	}

	err := svc.updateKnowledgeTitleFromAnalysis(context.Background(), knowledge, &types.ReadResult{
		Metadata: map[string]string{"title": "Late AI title"},
	})

	require.NoError(t, err)
	require.Equal(t, source, knowledge.Title)
	require.Empty(t, repo.automaticTitleUpdates)
}

func (s *videoIngestionRepoStub) UpdateURLKnowledgeTitleIfAutomatic(
	_ context.Context,
	_ uint64,
	_ string,
	_ string,
	title string,
) (bool, error) {
	if s.rejectAutomaticTitleUpdate {
		return false, nil
	}
	s.automaticTitleUpdates = append(s.automaticTitleUpdates, title)
	return true, nil
}
