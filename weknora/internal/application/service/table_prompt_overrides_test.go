package service

import (
	"context"
	"database/sql"
	"encoding/json"
	"strings"
	"testing"

	"github.com/Tencent/WeKnora/internal/models/chat"
	"github.com/Tencent/WeKnora/internal/models/embedding"
	"github.com/Tencent/WeKnora/internal/types"
	"github.com/Tencent/WeKnora/internal/types/interfaces"
	_ "github.com/duckdb/duckdb-go/v2"
	"github.com/hibiken/asynq"
	"github.com/stretchr/testify/require"
)

type tablePromptKnowledgeService struct {
	interfaces.KnowledgeService
	knowledge *types.Knowledge
}

func (s tablePromptKnowledgeService) GetKnowledgeByID(context.Context, string) (*types.Knowledge, error) {
	return s.knowledge, nil
}

func (s tablePromptKnowledgeService) GetKnowledgeByIDOnly(context.Context, string) (*types.Knowledge, error) {
	return s.knowledge, nil
}

type tablePromptKBService struct {
	interfaces.KnowledgeBaseService
}

func (tablePromptKBService) GetKnowledgeBaseByID(context.Context, string) (*types.KnowledgeBase, error) {
	return &types.KnowledgeBase{ID: "table-kb"}, nil
}

type tablePromptTenantService struct {
	interfaces.TenantService
	tenant *types.Tenant
}

func (s tablePromptTenantService) GetTenantByID(context.Context, uint64) (*types.Tenant, error) {
	return s.tenant, nil
}

type tablePromptModelService struct {
	*generatedTitleModelService
}

func (tablePromptModelService) GetEmbeddingModel(context.Context, string) (embedding.Embedder, error) {
	return embeddingFailureEmbedder{}, nil
}

type tablePromptChunkService struct {
	*multimodalFailureChunkService
}

func (tablePromptChunkService) UpdateChunks(context.Context, []*types.Chunk) error { return nil }

type tablePromptModel struct {
	*summaryContentCaptureChat
	prompts []string
}

func (m *tablePromptModel) Chat(ctx context.Context, messages []chat.Message, options *chat.ChatOptions) (*types.ChatResponse, error) {
	m.prompts = append(m.prompts, messages[0].Content)
	return m.summaryContentCaptureChat.Chat(ctx, messages, options)
}

func TestTableSummaryWorkerRestoresWorkspacePrompts(t *testing.T) {
	const knowledgeID = "d7006a67-ab38-4d4a-a271-f0f06d79fdd6"
	db, err := sql.Open("duckdb", ":memory:")
	require.NoError(t, err)
	t.Cleanup(func() { _ = db.Close() })
	model := &tablePromptModel{summaryContentCaptureChat: &summaryContentCaptureChat{response: "仅记录姓名字段"}}
	chunks := &multimodalFailureChunkService{}
	svc := &DataTableSummaryService{
		knowledgeService: tablePromptKnowledgeService{knowledge: &types.Knowledge{
			ID: knowledgeID, TenantID: 7, KnowledgeBaseID: "table-kb", FileType: "csv", FilePath: "local://customers.csv",
		}},
		knowledgeBaseService: tablePromptKBService{},
		tenantService: tablePromptTenantService{tenant: &types.Tenant{
			ID: 7,
			RetrieverEngines: types.RetrieverEngines{Engines: []types.RetrieverEngineParams{
				{RetrieverEngineType: types.PostgresRetrieverEngineType, RetrieverType: types.VectorRetrieverType},
			}},
			SystemPromptConfig: types.SystemPromptConfig{
				"table.description": "工作区表格摘要：{{table_name}} {{schema}} {{samples}} 只描述姓名字段。",
				"table.columns":     "工作区列说明：{{table_name}} {{schema}} {{samples}} 只描述姓名字段。",
			},
		}},
		modelService:   tablePromptModelService{generatedTitleModelService: &generatedTitleModelService{model: model}},
		fileService:    multimodalFailureFileService{data: []byte("name\nPeter\n")},
		chunkService:   tablePromptChunkService{multimodalFailureChunkService: chunks},
		retrieveEngine: &embeddingFailureRegistry{engine: &embeddingFailureEngine{}},
		sqlDB:          db,
	}
	body, err := json.Marshal(DataTableSummaryPayload{TenantID: 7, KnowledgeID: knowledgeID, SummaryModel: "chat-1", EmbeddingModel: "embed-1"})
	require.NoError(t, err)
	err = svc.Handle(context.Background(), asynq.NewTask(types.TypeDataTableSummary, body))
	require.NoError(t, err)
	require.Len(t, model.prompts, 2)
	require.Contains(t, model.prompts[0], "工作区表格摘要：")
	require.Contains(t, model.prompts[1], "工作区列说明：")
	for _, prompt := range model.prompts {
		require.Contains(t, prompt, "Peter", "CSV source values must reach the model with the edited rules")
		require.NotContains(t, prompt, "{{", "runtime variables must be rendered")
	}
	require.Len(t, chunks.chunks, 2, "both generated descriptions must be stored")
}

func TestTablePromptOverridesRenderBeforeModelCall(t *testing.T) {
	ctx := context.WithValue(context.Background(), types.TenantIDContextKey, uint64(7))
	ctx = context.WithValue(ctx, types.TenantInfoContextKey, &types.Tenant{
		ID: 7,
		SystemPromptConfig: types.SystemPromptConfig{
			"table.description": "表 {{table_name}} 的结构 {{schema}}，样本 {{samples}}。100% 只记录姓名。",
			"table.columns":     "为 {{table_name}} 按 {{schema}} 和 {{samples}} 生成列说明，100% 忠于字段。",
		},
	})
	svc := &DataTableSummaryService{}
	for key, generate := range map[string]func(context.Context, chat.Chat, string, string, string, string) (string, error){
		"table.description": svc.generateTableDescription,
		"table.columns":     svc.generateColumnDescriptions,
	} {
		t.Run(key, func(t *testing.T) {
			model := &summaryContentCaptureChat{}
			_, err := generate(ctx, model, "customers", "name: text", "Peter", "只记录姓名")
			if err != nil {
				t.Fatal(err)
			}
			if len(model.messages) != 1 {
				t.Fatalf("model received %d messages, want 1", len(model.messages))
			}
			prompt := model.messages[0].Content
			for _, value := range []string{"customers", "name: text", "Peter", "100%", "只记录姓名"} {
				if !strings.Contains(prompt, value) {
					t.Fatalf("runtime model request lost %q: %s", value, prompt)
				}
			}
			if strings.Contains(prompt, "{{") || strings.Contains(prompt, "%!") {
				t.Fatalf("runtime model request contains unrendered variables: %s", prompt)
			}
		})
	}
}
