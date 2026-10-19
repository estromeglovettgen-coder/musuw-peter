package handler

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http/httptest"
	"path/filepath"
	"testing"

	"github.com/Tencent/WeKnora/internal/firebilling"
	"github.com/Tencent/WeKnora/internal/types"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

func TestFireQuestionPlanHTTPContract(t *testing.T) {
	t.Setenv("PETER_TOKEN_BILLING_ENABLED", "true")
	db, err := gorm.Open(sqlite.Open(filepath.Join(t.TempDir(), "plans.db")), &gorm.Config{})
	require.NoError(t, err)
	sqlDB, err := db.DB()
	require.NoError(t, err)
	t.Cleanup(func() { _ = sqlDB.Close() })
	require.NoError(t, db.Exec("CREATE TABLE users (id TEXT PRIMARY KEY,tenant_id INTEGER,is_system_admin BOOLEAN,is_active BOOLEAN)").Error)
	require.NoError(t, db.Exec("INSERT INTO users VALUES ('admin',1,true,true),('ordinary',2,false,true)").Error)
	require.NoError(t, db.AutoMigrate(&firebilling.Plan{}))
	h := NewFireBillingHandler(firebilling.NewService(db))
	actor := "admin"
	r := gin.New()
	r.Use(func(c *gin.Context) {
		c.Request = c.Request.WithContext(context.WithValue(c.Request.Context(), types.UserIDContextKey, actor))
	})
	r.POST("/plans", h.SavePlan)
	r.PUT("/plans/:id", h.SavePlan)
	send := func(method, path string, questions any) *httptest.ResponseRecorder {
		body := map[string]any{"name": "十问体验", "duration_days": 30, "token_limit": 100000, "active": true}
		if questions != nil {
			body["question_limit"] = questions
		}
		data, err := json.Marshal(body)
		require.NoError(t, err)
		req := httptest.NewRequest(method, path, bytes.NewReader(data))
		req.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)
		return w
	}
	actor = "ordinary"
	require.Equal(t, 403, send("POST", "/plans", 10).Code)
	actor = "admin"
	w := send("POST", "/plans", 10)
	require.Equal(t, 200, w.Code, w.Body.String())
	var result struct {
		Data firebilling.Plan `json:"data"`
	}
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &result))
	require.EqualValues(t, 10, result.Data.QuestionLimit)
	id := result.Data.ID
	w = send("PUT", "/plans/"+id, 0)
	require.Equal(t, 200, w.Code, w.Body.String())
	var saved firebilling.Plan
	require.NoError(t, db.Where("id = ?", id).Take(&saved).Error)
	require.Zero(t, saved.QuestionLimit)
	for _, value := range []any{-1, firebilling.MaxQuestions + 1, 1.5} {
		require.Equal(t, 400, send("POST", "/plans", value).Code)
	}
	w = send("POST", "/plans", nil)
	require.Equal(t, 200, w.Code, w.Body.String())
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &result))
	require.Zero(t, result.Data.QuestionLimit)
}
