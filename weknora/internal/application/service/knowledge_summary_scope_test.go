package service

import (
	"context"
	"strings"
	"testing"

	"github.com/Tencent/WeKnora/internal/config"
	"github.com/Tencent/WeKnora/internal/types"
	"github.com/Tencent/WeKnora/internal/types/interfaces"
)

type summaryScopeKB struct {
	interfaces.KnowledgeBaseService
}

func (summaryScopeKB) GetKnowledgeBaseByID(context.Context, string) (*types.KnowledgeBase, error) {
	return &types.KnowledgeBase{WikiConfig: &types.WikiConfig{ContentInstructions: "只用写出：姓名，其他一概不要写"}}, nil
}

func TestDocumentSummaryReceivesKnowledgeBaseContentScope(t *testing.T) {
	svc := &knowledgeService{config: &config.Config{Conversation: &config.ConversationConfig{GenerateSummaryPrompt: "全面总结教育、工作和家庭信息"}}, chunkRepo: summaryImageInfoChunkRepo{}, kbService: summaryScopeKB{}}
	model := &summaryContentCaptureChat{response: "杨迪"}
	_, _, err := svc.getSummary(context.Background(), model, &types.Knowledge{ID: "doc", KnowledgeBaseID: "kb"}, []*types.Chunk{{ID: "c", Content: "姓名杨迪，毕业于某大学，从事销售工作。", EndAt: 22}})
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(model.messages[0].Content, "只用写出：姓名，其他一概不要写") {
		t.Fatalf("内容范围未传入摘要模型：%s", model.messages[0].Content)
	}
	if !strings.Contains(model.messages[0].Content, "优先于默认模板的内容广度和长度") {
		t.Fatal("没有明确内容范围优先级")
	}
}
