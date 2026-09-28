package retriever

import (
	"context"
	"errors"
	"net/http"
	"strings"
	"testing"

	"github.com/Tencent/WeKnora/internal/models/embedding"
	modelopenrouter "github.com/Tencent/WeKnora/internal/models/openrouter"
	"github.com/Tencent/WeKnora/internal/types"
	"github.com/Tencent/WeKnora/internal/types/interfaces"
)

type capturingEmbedder struct {
	embedding.Embedder
	text       string
	batchTexts []string
}

func (e *capturingEmbedder) Embed(ctx context.Context, text string) ([]float32, error) {
	e.text = text
	return []float32{1}, nil
}

func (e *capturingEmbedder) BatchEmbedWithPool(
	ctx context.Context,
	model embedding.Embedder,
	texts []string,
) ([][]float32, error) {
	e.batchTexts = append([]string(nil), texts...)
	embeddings := make([][]float32, len(texts))
	for i := range texts {
		embeddings[i] = []float32{1}
	}
	return embeddings, nil
}

type saveOnlyRepository struct {
	interfaces.RetrieveEngineRepository
}

type retryProbeEmbedder struct {
	embedding.Embedder
	calls      int
	failures   int
	err        error
	embeddings [][]float32
}

func (e *retryProbeEmbedder) BatchEmbedWithPool(
	context.Context,
	embedding.Embedder,
	[]string,
) ([][]float32, error) {
	e.calls++
	if e.calls <= e.failures {
		return nil, e.err
	}
	return e.embeddings, nil
}

func TestBatchEmbedWithBackoffDoesNotRetryTerminalOpenRouterErrors(t *testing.T) {
	tests := []struct {
		name string
		err  error
	}{
		{name: "allowance renewal pending", err: modelopenrouter.ErrAllowanceRenewalPending},
		{name: "credits exhausted", err: &modelopenrouter.CreditExhaustedError{StatusCode: http.StatusPaymentRequired}},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			embedder := &retryProbeEmbedder{failures: embedRetryAttempts, err: tt.err}
			_, err := batchEmbedWithBackoff(context.Background(), embedder, []string{"x"})
			if modelopenrouter.ErrorCode(err) != modelopenrouter.ErrorCode(tt.err) {
				t.Fatalf("batchEmbedWithBackoff error = %v, want terminal code %q", err, modelopenrouter.ErrorCode(tt.err))
			}
			if embedder.calls != 1 {
				t.Fatalf("terminal error calls = %d, want 1", embedder.calls)
			}
		})
	}
}

func TestBatchEmbedWithBackoffStillRetriesOrdinaryErrors(t *testing.T) {
	embedder := &retryProbeEmbedder{
		failures:   1,
		err:        errors.New("billing_renewal_pending from unrelated provider text"),
		embeddings: [][]float32{{1}},
	}

	embeddings, err := batchEmbedWithBackoff(context.Background(), embedder, []string{"x"})
	if err != nil {
		t.Fatalf("batchEmbedWithBackoff returned ordinary error after recovery: %v", err)
	}
	if len(embeddings) != 1 {
		t.Fatalf("batchEmbedWithBackoff embeddings = %v, want one result", embeddings)
	}
	if embedder.calls != 2 {
		t.Fatalf("ordinary error calls = %d, want 2", embedder.calls)
	}
}

func (r *saveOnlyRepository) Save(ctx context.Context, indexInfo *types.IndexInfo, params map[string]any) error {
	return nil
}

func (r *saveOnlyRepository) BatchSave(
	ctx context.Context,
	indexInfoList []*types.IndexInfo,
	params map[string]any,
) error {
	return nil
}

func TestIndexRemovesInlineImagePayloadBeforeEmbedding(t *testing.T) {
	ctx := context.Background()
	embedder := &capturingEmbedder{}
	service := &KeywordsVectorHybridRetrieveEngineService{indexRepository: &saveOnlyRepository{}}
	payload := strings.Repeat("A", 300)
	content := "before <img src=\"data:image/png;base64," + payload + "\"> after"

	err := service.Index(ctx, embedder, &types.IndexInfo{
		Content:  content,
		SourceID: "source-1",
	}, []types.RetrieverType{types.VectorRetrieverType})
	if err != nil {
		t.Fatalf("Index returned error: %v", err)
	}
	assertImagePayloadRemoved(t, embedder.text, payload)
}

func TestBatchIndexRemovesInlineImagePayloadBeforeEmbedding(t *testing.T) {
	ctx := context.Background()
	embedder := &capturingEmbedder{}
	service := &KeywordsVectorHybridRetrieveEngineService{indexRepository: &saveOnlyRepository{}}
	payload := strings.Repeat("A", 300)
	content := "before ![chart](data:image/png;base64," + payload + ") after"

	err := service.BatchIndex(ctx, embedder, []*types.IndexInfo{{
		Content:  content,
		SourceID: "source-1",
	}}, []types.RetrieverType{types.VectorRetrieverType})
	if err != nil {
		t.Fatalf("BatchIndex returned error: %v", err)
	}
	if len(embedder.batchTexts) != 1 {
		t.Fatalf("expected one embedding input, got %d", len(embedder.batchTexts))
	}
	assertImagePayloadRemoved(t, embedder.batchTexts[0], payload)
}

func TestBatchIndexTruncatesOversizedEmbeddingInput(t *testing.T) {
	ctx := context.Background()
	embedder := &capturingEmbedder{}
	service := &KeywordsVectorHybridRetrieveEngineService{indexRepository: &saveOnlyRepository{}}

	err := service.BatchIndex(ctx, embedder, []*types.IndexInfo{{
		Content:  strings.Repeat("x", safetyMaxChars+10),
		SourceID: "source-1",
	}}, []types.RetrieverType{types.VectorRetrieverType})
	if err != nil {
		t.Fatalf("BatchIndex returned error: %v", err)
	}
	if len(embedder.batchTexts) != 1 {
		t.Fatalf("expected one embedding input, got %d", len(embedder.batchTexts))
	}
	if got := len([]rune(embedder.batchTexts[0])); got > safetyMaxChars {
		t.Fatalf("embedding input length = %d, want <= %d", got, safetyMaxChars)
	}
}

func assertImagePayloadRemoved(t *testing.T, content string, payload string) {
	t.Helper()
	if strings.Contains(content, "data:image/png;base64") || strings.Contains(content, payload) {
		t.Fatalf("embedding input still contains inline image payload: %q", content)
	}
	if !strings.Contains(content, "before") || !strings.Contains(content, "after") {
		t.Fatalf("embedding input should preserve surrounding text, got %q", content)
	}
}
