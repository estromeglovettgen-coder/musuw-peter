package service

import (
	"context"
	"strings"
	"testing"

	"github.com/Tencent/WeKnora/internal/config"
	"github.com/Tencent/WeKnora/internal/models/chat"
	"github.com/Tencent/WeKnora/internal/types"
	"github.com/Tencent/WeKnora/internal/types/interfaces"
)

type summaryContentCaptureChat struct {
	messages []chat.Message
	response string
}

func (m *summaryContentCaptureChat) Chat(
	_ context.Context,
	messages []chat.Message,
	_ *chat.ChatOptions,
) (*types.ChatResponse, error) {
	m.messages = append([]chat.Message(nil), messages...)
	response := m.response
	if response == "" {
		response = "summary"
	}
	return &types.ChatResponse{Content: response}, nil
}

func (m *summaryContentCaptureChat) ChatStream(
	context.Context,
	[]chat.Message,
	*chat.ChatOptions,
) (<-chan types.StreamResponse, error) {
	return nil, nil
}

func (m *summaryContentCaptureChat) GetModelName() string { return "summary-capture" }
func (m *summaryContentCaptureChat) GetModelID() string   { return "summary-capture" }

type summaryImageInfoChunkRepo struct {
	interfaces.ChunkRepository
}

func (summaryImageInfoChunkRepo) ListChunksByParentIDs(
	context.Context, uint64, []string,
) ([]*types.Chunk, error) {
	return nil, nil
}

func TestGetSummaryReconstructsTableChunksWithSyntheticHeaders(t *testing.T) {
	header := "| Country | Capital |\n| --- | --- |\n"
	rowOne := "| Alpha Republic | North City |\n"
	rowTwo := "| Beta Federation | East Harbor |\n"
	rowThree := "| Gamma State | South Port |\n"
	want := header + rowOne + rowTwo + rowThree

	firstContent := header + rowOne + rowTwo
	service := &knowledgeService{
		config: &config.Config{Conversation: &config.ConversationConfig{
			GenerateSummaryPrompt: "Summarize the document.",
		}},
		chunkRepo: summaryImageInfoChunkRepo{},
	}
	model := &summaryContentCaptureChat{}

	_, _, err := service.getSummary(context.Background(), model, &types.Knowledge{ID: "knowledge-1"}, []*types.Chunk{
		{
			ID: "first", Content: firstContent, ChunkIndex: 0,
			StartAt: 0, EndAt: len([]rune(firstContent)),
		},
		{
			// The repeated header is synthetic: StartAt points at row two in the source.
			ID: "second", Content: header + rowTwo + rowThree, ChunkIndex: 1,
			StartAt: len([]rune(header + rowOne)), EndAt: len([]rune(want)),
		},
	})
	if err != nil {
		t.Fatalf("getSummary() error = %v", err)
	}
	if len(model.messages) != 2 {
		t.Fatalf("summary model received %d messages, want 2", len(model.messages))
	}
	if got := model.messages[1].Content; got != want {
		t.Fatalf("summary content mismatch:\n got: %q\nwant: %q", got, want)
	}
}

func TestGetSummaryUsesSameModelCallForAutomaticURLTitle(t *testing.T) {
	const source = "https://v.douyin.com/example/"
	service := &knowledgeService{
		config: &config.Config{Conversation: &config.ConversationConfig{
			GenerateSummaryPrompt: "Summarize the document.",
		}},
		chunkRepo: summaryImageInfoChunkRepo{},
	}
	model := &summaryContentCaptureChat{
		response: "# 减脂期肉丝汤面做法\n\n视频展示了一道适合减脂期的肉丝汤面，并说明了主要食材和步骤。",
	}

	summary, title, err := service.getSummary(
		context.Background(), model,
		&types.Knowledge{ID: "knowledge-social", Type: "url", Source: source, Title: source},
		[]*types.Chunk{{ID: "first", Content: "肉丝、青菜和面条煮成一碗汤面。", StartAt: 0, EndAt: 16}},
	)
	if err != nil {
		t.Fatalf("getSummary() error = %v", err)
	}
	if title != "减脂期肉丝汤面做法" {
		t.Fatalf("title = %q", title)
	}
	if summary != "视频展示了一道适合减脂期的肉丝汤面，并说明了主要食材和步骤。" {
		t.Fatalf("summary = %q", summary)
	}
	if len(model.messages) != 2 || !strings.Contains(model.messages[0].Content, "level-1 Markdown heading") {
		t.Fatalf("summary prompt did not request the shared title contract: %#v", model.messages)
	}
}

func TestSplitGeneratedSummaryTitleDropsInvalidHeadingButKeepsSummary(t *testing.T) {
	title, summary := splitGeneratedSummaryTitle(
		"# 整段文案不应该当标题 #文案 #日落\n\n这才是有用的 AI 摘要。",
	)
	if title != "" {
		t.Fatalf("invalid title = %q, want empty", title)
	}
	if summary != "这才是有用的 AI 摘要。" {
		t.Fatalf("summary = %q", summary)
	}

	title, summary = splitGeneratedSummaryTitle("# 只有标题")
	if title != "" || summary != "" {
		t.Fatalf("heading-only output = (%q, %q), want empty", title, summary)
	}
}
