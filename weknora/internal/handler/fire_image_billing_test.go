package handler

import (
	"context"
	"encoding/json"
	"github.com/Tencent/WeKnora/internal/firebilling"
	"github.com/Tencent/WeKnora/internal/types"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"
)

func TestFireImageUserDetailListsOnlyOwnedPendingAndFinalCalls(t *testing.T) {
	t.Setenv("PETER_TOKEN_BILLING_ENABLED", "true")
	db, e := gorm.Open(sqlite.Open(filepath.Join(t.TempDir(), "image-http.db")), &gorm.Config{})
	require.NoError(t, e)
	sqlDB, e := db.DB()
	require.NoError(t, e)
	t.Cleanup(func() { _ = sqlDB.Close() })
	require.NoError(t, db.Exec("CREATE TABLE users (id TEXT PRIMARY KEY,tenant_id INTEGER,is_system_admin BOOLEAN,is_active BOOLEAN,username TEXT,email TEXT,deleted_at DATETIME)").Error)
	require.NoError(t, db.Exec("INSERT INTO users VALUES ('admin',1,true,true,'admin','admin@example.test',NULL),('alice',2,false,true,'alice','alice@example.test',NULL),('bob',3,false,true,'bob','bob@example.test',NULL)").Error)
	require.NoError(t, db.AutoMigrate(&firebilling.Plan{}, &firebilling.Membership{}, &firebilling.Adjustment{}, &firebilling.Call{}, &firebilling.ImageCall{}))
	svc := firebilling.NewService(db)
	admin := context.WithValue(context.Background(), types.UserIDContextKey, "admin")
	images := int64(3)
	for _, u := range []string{"alice", "bob"} {
		_, e = svc.Apply(admin, u, firebilling.Mutation{OperationID: "grant-" + u, Kind: "grant", DurationDays: 30, Tokens: 1000, Images: &images})
		require.NoError(t, e)
	}
	alice := context.WithValue(admin, types.UserIDContextKey, "alice")
	bob := context.WithValue(admin, types.UserIDContextKey, "bob")
	for _, outcome := range []string{"unknown", "reserved", "failed"} {
		task := uuid.NewString()
		_, e = svc.ReserveImage(alice, task)
		require.NoError(t, e)
		if outcome != "reserved" {
			require.NoError(t, svc.SettleImage(alice, task, outcome))
		}
	}
	otherTask := uuid.NewString()
	_, e = svc.ReserveImage(bob, otherTask)
	require.NoError(t, e)
	actor := "admin"
	h := NewFireBillingHandler(svc)
	r := gin.New()
	r.Use(func(c *gin.Context) {
		c.Request = c.Request.WithContext(context.WithValue(c.Request.Context(), types.UserIDContextKey, actor))
	})
	r.GET("/users/:user_id", h.User)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, httptest.NewRequest("GET", "/users/alice", nil))
	require.Equal(t, 200, w.Code, w.Body.String())
	var result struct {
		Data struct {
			ImageCalls []firebilling.ImageCall `json:"image_calls"`
		} `json:"data"`
	}
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &result))
	require.Len(t, result.Data.ImageCalls, 3)
	require.ElementsMatch(t, []string{"reserved", "unknown"}, []string{result.Data.ImageCalls[0].Status, result.Data.ImageCalls[1].Status})
	require.Equal(t, "failed", result.Data.ImageCalls[2].Status)
	for _, call := range result.Data.ImageCalls {
		require.Equal(t, "alice", call.UserID)
		require.NotEqual(t, otherTask, call.TaskID)
	}
	actor = "alice"
	w = httptest.NewRecorder()
	r.ServeHTTP(w, httptest.NewRequest("GET", "/users/alice", nil))
	require.Equal(t, 403, w.Code)
}

func TestFireImageExplicitZeroCannotSilentlyCreateBareAccount(t *testing.T) {
	users := &createUserService{}
	router := createSystemUserRouter(&SystemHandler{userSvc: users}, "admin-user")
	req := httptest.NewRequest("POST", "/system/admin/users/create", strings.NewReader(`{"username":"image-zero","fire_images":0}`))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)
	require.Equal(t, 503, w.Code, w.Body.String())
	require.Nil(t, users.gotReq)
}
