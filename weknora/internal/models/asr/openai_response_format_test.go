package asr

import (
	"context"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/Tencent/WeKnora/internal/types"
	"github.com/stretchr/testify/require"
)

func TestTranscribeUsesConfiguredJSONFormatAndKeepsWhisperSegments(t *testing.T) {
	for _, format := range []string{"json", "verbose_json"} {
		t.Run(format, func(t *testing.T) {
			withASRSSRFWhitelist(t, "127.0.0.1")
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				require.Equal(t, "/audio/transcriptions", r.URL.Path)
				require.NoError(t, r.ParseMultipartForm(1024))
				defer func() { require.NoError(t, r.MultipartForm.RemoveAll()) }()
				w.Header().Set("Content-Type", "application/json")
				if r.FormValue("response_format") != format {
					w.WriteHeader(http.StatusBadRequest)
					_, _ = fmt.Fprint(w, `{"error":{"message":"unsupported response format"}}`)
					return
				}
				if format == "json" {
					_, _ = fmt.Fprint(w, `{"text":"Musuw 742"}`)
				} else {
					_, _ = fmt.Fprint(w,
						`{"text":"Musuw 742","segments":[{"start":0,"end":1,"text":"Musuw 742"}]}`)
				}
			}))
			defer server.Close()
			model := &types.Model{
				Name: "transcription-model", Parameters: types.ModelParameters{BaseURL: server.URL},
			}
			if format == "json" {
				model.Parameters.ExtraConfig = map[string]string{"response_format": "json"}
			}
			client, err := NewASR(ConfigFromModel(model))
			require.NoError(t, err)
			result, err := client.Transcribe(context.Background(), []byte("test audio"), "audit.wav")
			require.NoError(t, err)
			require.Equal(t, "Musuw 742", result.Text)
			if format == "verbose_json" {
				require.Len(t, result.Segments, 1)
			}
		})
	}
}
