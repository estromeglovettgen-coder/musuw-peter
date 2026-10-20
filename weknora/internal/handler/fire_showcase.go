package handler

import (
	"bytes"
	"context"
	"crypto/subtle"
	"encoding/json"
	"errors"
	"io"
	"log"
	"net/http"
	"net/http/httputil"
	"net/url"
	"os"
	"path"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/Tencent/WeKnora/internal/firebilling"
	"github.com/Tencent/WeKnora/internal/types"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"gorm.io/gorm"
)

const FireShowcaseMediaCookie = "fire_showcase_media"
const showcaseMediaPath = "/api/fire-showcase-assets/"

var showcaseAssetID = regexp.MustCompile(`^sha256_[a-f0-9]{64}$`)

// FireShowcaseHandler is the native identity seam for the reused workbench.
// Provider credentials never enter this module or the browser.
type FireShowcaseHandler struct {
	billing   *firebilling.Service
	target    *url.URL
	secret    string
	transport *http.Transport
}

func NewFireShowcaseHandler(b *firebilling.Service) *FireShowcaseHandler {
	target, err := url.Parse(strings.TrimSpace(os.Getenv("FIRE_SHOWCASE_URL")))
	if err != nil || target == nil || (target.Scheme != "http" && target.Scheme != "https") || target.Host == "" || target.User != nil || target.RawQuery != "" || target.Fragment != "" {
		target = nil
	}
	return &FireShowcaseHandler{billing: b, target: target, secret: os.Getenv("FIRE_SHOWCASE_BRIDGE_TOKEN"), transport: &http.Transport{Proxy: nil, ResponseHeaderTimeout: 90 * time.Second, MaxIdleConnsPerHost: 8, MaxConnsPerHost: 16, IdleConnTimeout: 90 * time.Second}}
}

func (h *FireShowcaseHandler) ready(c *gin.Context) bool {
	if h == nil || !firebilling.Enabled() || !strings.EqualFold(os.Getenv("FIRE_SHOWCASE_ENABLED"), "true") || h.target == nil || len(h.secret) < 32 {
		c.Header("Cache-Control", "no-store")
		c.Header("Vary", "Authorization, Cookie")
		c.AbortWithStatusJSON(503, gin.H{"success": false, "error": "展示面暂时不可用，请稍后重试"})
		return false
	}
	return true
}

type showcaseActor struct {
	ID                  string
	TenantID            uint64
	IsSystemAdmin       bool
	IsActive            bool
	DeletionRequestedAt *time.Time
}

func (h *FireShowcaseHandler) loadActor(ctx context.Context, id string) (showcaseActor, error) {
	var u showcaseActor
	if _, err := uuid.Parse(id); err != nil {
		return u, firebilling.ErrForbidden
	}
	err := h.billing.DB().WithContext(ctx).Table("users").Select("id,tenant_id,is_system_admin,is_active,deletion_requested_at").Where("id = ? AND deleted_at IS NULL", id).Take(&u).Error
	if err != nil {
		return u, err
	}
	if u.TenantID == 0 {
		return u, firebilling.ErrForbidden
	}
	return u, nil
}

func (h *FireShowcaseHandler) actor(ctx context.Context, id string) (showcaseActor, error) {
	u, err := h.loadActor(ctx, id)
	if err == nil && (!u.IsActive || u.DeletionRequestedAt != nil) {
		err = firebilling.ErrForbidden
	}
	return u, err
}

func (h *FireShowcaseHandler) currentActor(c *gin.Context) (showcaseActor, bool) {
	id, _ := types.UserIDFromContext(c.Request.Context())
	u, err := h.actor(c.Request.Context(), id)
	if err != nil {
		c.Header("Cache-Control", "no-store")
		c.Header("Vary", "Authorization, Cookie")
		c.AbortWithStatusJSON(403, gin.H{"success": false, "error": "无权访问展示面"})
		return u, false
	}
	return u, true
}

func (h *FireShowcaseHandler) mediaCookie(c *gin.Context) {
	value := strings.TrimSpace(strings.TrimPrefix(c.GetHeader("Authorization"), "Bearer "))
	if value == "" || !strings.HasPrefix(c.GetHeader("Authorization"), "Bearer ") {
		return
	}
	host := c.Request.URL.Hostname()
	if host == "" {
		host = strings.Split(c.Request.Host, ":")[0]
	}
	local := host == "localhost" || host == "127.0.0.1" || host == "[::1]"
	http.SetCookie(c.Writer, &http.Cookie{Name: FireShowcaseMediaCookie, Value: value, Path: showcaseMediaPath, MaxAge: 300, Expires: time.Now().Add(5 * time.Minute), HttpOnly: true, Secure: !local, SameSite: http.SameSiteStrictMode})
}

func (h *FireShowcaseHandler) Bootstrap(c *gin.Context) {
	c.Header("Cache-Control", "no-store")
	c.Header("Vary", "Authorization, Cookie")
	if !h.ready(c) {
		return
	}
	u, ok := h.currentActor(c)
	if !ok {
		return
	}
	s, err := h.billing.Status(c.Request.Context(), u.ID)
	if err != nil {
		fireResult(c, nil, err)
		return
	}
	h.mediaCookie(c)
	c.JSON(200, gin.H{"success": true, "data": gin.H{"user_id": u.ID, "tenant_id": u.TenantID, "allowance": s}})
}

func showcaseAPIAllowed(method, p string) bool {
	if p != path.Clean(p) || strings.Contains(p, "\\") {
		return false
	}
	if method == http.MethodGet || method == http.MethodHead {
		if p == "/api/config" || p == "/api/generation-tasks" {
			return true
		}
		parts := strings.Split(strings.Trim(p, "/"), "/")
		return len(parts) == 3 && parts[0] == "api" && parts[1] == "generation-tasks" && isShowcaseUUID(parts[2])
	}
	if method != http.MethodPost {
		return false
	}
	if p == "/api/assets" || p == "/api/generation-tasks" || p == "/api/prompt" {
		return true
	}
	parts := strings.Split(strings.Trim(p, "/"), "/")
	return len(parts) == 4 && parts[0] == "api" && parts[1] == "generation-tasks" && isShowcaseUUID(parts[2]) && (parts[3] == "retry" || parts[3] == "cancel")
}

func isShowcaseUUID(s string) bool { u, err := uuid.Parse(s); return err == nil && u.String() == s }

func (h *FireShowcaseHandler) Proxy(c *gin.Context) {
	if !h.ready(c) {
		return
	}
	u, ok := h.currentActor(c)
	if !ok {
		return
	}
	p := "/api" + c.Param("resource")
	if !showcaseAPIAllowed(c.Request.Method, p) {
		c.Header("Cache-Control", "no-store")
		c.Header("Vary", "Authorization, Cookie")
		c.AbortWithStatusJSON(404, gin.H{"error": "接口不存在"})
		return
	}
	h.mediaCookie(c)
	h.serve(c, p, &u, true)
}

func (h *FireShowcaseHandler) Static(c *gin.Context) {
	if !h.ready(c) {
		return
	}
	p := c.Param("resource")
	if p == "/" {
		p = "/index.html"
	}
	if !showcaseStaticPathAllowed(p) {
		c.Header("Cache-Control", "no-store")
		c.AbortWithStatus(404)
		return
	}
	h.serve(c, p, nil, false)
}

func showcaseStaticPathAllowed(p string) bool {
	return p != "" && p == path.Clean(p) && !strings.Contains(p, "\\") && !strings.HasPrefix(p, "/api/") && !strings.HasPrefix(p, "/__") && !strings.HasPrefix(path.Base(p), ".")
}

func showcasePublicStaticResponse(p string, res *http.Response) bool {
	if !showcaseStaticPathAllowed(p) || (res.StatusCode < 200 || res.StatusCode >= 300) && res.StatusCode != http.StatusNotModified || strings.Contains(strings.ToLower(res.Header.Get("Content-Type")), "text/html") {
		return false
	}
	// Only public code, artwork and browser model files may inherit the
	// sidecar's cache policy. HTML and API-shaped data remain uncacheable.
	switch strings.ToLower(path.Ext(p)) {
	case ".js", ".mjs", ".css", ".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg", ".ico", ".woff", ".woff2", ".ttf", ".otf", ".wasm", ".tflite":
	default:
		return false
	}
	policies := res.Header.Values("Cache-Control")
	return len(policies) == 1 && (policies[0] == "public, max-age=31536000, immutable" || policies[0] == "no-cache")
}

func (h *FireShowcaseHandler) Asset(c *gin.Context) {
	if !h.ready(c) {
		return
	}
	u, ok := h.currentActor(c)
	if !ok {
		return
	}
	if c.Param("user_id") != u.ID || !showcaseAssetID.MatchString(c.Param("asset_id")) {
		c.Header("Cache-Control", "no-store")
		c.Header("Vary", "Authorization, Cookie")
		c.AbortWithStatus(404)
		return
	}
	h.serve(c, "/api/assets/"+c.Param("asset_id")+"/content", &u, false)
}

func rewriteShowcaseAssets(value any, uid string) any {
	switch x := value.(type) {
	case string:
		if strings.HasPrefix(x, "/api/assets/") && strings.HasSuffix(x, "/content") {
			id := strings.TrimSuffix(strings.TrimPrefix(x, "/api/assets/"), "/content")
			if showcaseAssetID.MatchString(id) {
				return showcaseMediaPath + uid + "/" + id + "/content"
			}
		}
	case map[string]any:
		for k, v := range x {
			x[k] = rewriteShowcaseAssets(v, uid)
		}
	case []any:
		for i, v := range x {
			x[i] = rewriteShowcaseAssets(v, uid)
		}
	}
	return value
}

func (h *FireShowcaseHandler) serve(c *gin.Context, p string, u *showcaseActor, rewrite bool) {
	proxy := httputil.NewSingleHostReverseProxy(h.target)
	proxy.ErrorLog = log.New(io.Discard, "", 0)
	proxy.Director = func(r *http.Request) {
		r.URL.Scheme = h.target.Scheme
		r.URL.Host = h.target.Host
		r.URL.Path = strings.TrimSuffix(h.target.Path, "/") + p
		r.URL.RawPath = ""
		r.Host = h.target.Host
		for _, k := range []string{"Authorization", "Cookie", "X-API-Key", "X-Fire-User-ID", "X-Fire-Tenant-ID", "X-Fire-Bridge-Token", "X-Forwarded-For", "X-Forwarded-Host", "X-Forwarded-Proto"} {
			r.Header.Del(k)
		}
		r.Header.Set("X-Fire-Bridge-Token", h.secret)
		if u != nil {
			r.Header.Set("X-Fire-User-ID", u.ID)
			r.Header.Set("X-Fire-Tenant-ID", strconv.FormatUint(u.TenantID, 10))
		}
		r.Header.Set("Origin", h.target.Scheme+"://"+h.target.Host)
	}
	proxy.Transport = h.transport
	proxy.ModifyResponse = func(res *http.Response) error {
		res.Header.Del("Set-Cookie")
		if u == nil && !rewrite && (c.Request.Method == http.MethodGet || c.Request.Method == http.MethodHead) && showcasePublicStaticResponse(p, res) {
			// Identity headers were removed before forwarding public requests.
			// Retain genuine content negotiation without splitting by account.
			var vary []string
			for _, field := range res.Header.Values("Vary") {
				for _, name := range strings.Split(field, ",") {
					name = strings.TrimSpace(name)
					if name != "" && !strings.EqualFold(name, "Authorization") && !strings.EqualFold(name, "Cookie") {
						vary = append(vary, name)
					}
				}
			}
			res.Header.Del("Vary")
			if len(vary) > 0 {
				res.Header.Set("Vary", strings.Join(vary, ", "))
			}
		} else {
			res.Header.Del("ETag")
			res.Header.Del("Last-Modified")
			res.Header.Del("Expires")
			res.Header.Del("Age")
			res.Header.Set("Cache-Control", "no-store")
			res.Header.Set("Vary", "Authorization, Cookie")
		}
		res.Header.Set("X-Content-Type-Options", "nosniff")
		if !rewrite || u == nil || !strings.Contains(res.Header.Get("Content-Type"), "application/json") || c.Request.Method == http.MethodHead {
			return nil
		}
		data, err := io.ReadAll(io.LimitReader(res.Body, 8*1024*1024+1))
		_ = res.Body.Close()
		if err != nil || len(data) > 8*1024*1024 {
			return errors.New("invalid workbench response")
		}
		var value any
		if json.Unmarshal(data, &value) != nil {
			return errors.New("invalid workbench response")
		}
		value = rewriteShowcaseAssets(value, u.ID)
		if p == "/api/config" {
			if config, ok := value.(map[string]any); ok {
				if s, err := h.billing.Status(c.Request.Context(), u.ID); err == nil {
					config["fireAllowance"] = s
				}
			}
		}
		data, err = json.Marshal(value)
		if err != nil {
			return err
		}
		res.Body = io.NopCloser(bytes.NewReader(data))
		res.ContentLength = int64(len(data))
		res.Header.Set("Content-Length", strconv.Itoa(len(data)))
		return nil
	}
	proxy.ErrorHandler = func(w http.ResponseWriter, r *http.Request, err error) {
		w.Header().Set("Cache-Control", "no-store")
		w.Header().Set("Vary", "Authorization, Cookie")
		w.Header().Set("Content-Type", "application/json; charset=utf-8")
		w.WriteHeader(502)
		_, _ = w.Write([]byte(`{"error":"展示面暂时不可用，请稍后重试"}`))
	}
	proxy.ServeHTTP(c.Writer, c.Request)
}

func (h *FireShowcaseHandler) Internal(c *gin.Context) {
	if !h.ready(c) {
		return
	}
	provided := c.GetHeader("X-Fire-Bridge-Token")
	if len(provided) != len(h.secret) || subtle.ConstantTimeCompare([]byte(provided), []byte(h.secret)) != 1 {
		c.AbortWithStatus(403)
		return
	}
	var req struct {
		UserID   string `json:"user_id"`
		TenantID uint64 `json:"tenant_id"`
		TaskID   string `json:"task_id"`
		Outcome  string `json:"outcome"`
	}
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, 8192)
	if c.ShouldBindJSON(&req) != nil {
		c.AbortWithStatusJSON(400, gin.H{"error": "请求格式错误"})
		return
	}
	u, err := h.loadActor(c.Request.Context(), req.UserID)
	if errors.Is(err, gorm.ErrRecordNotFound) {
		c.AbortWithStatusJSON(410, gin.H{"error": "账号已移除"})
		return
	}
	if err != nil || u.TenantID != req.TenantID {
		c.AbortWithStatus(403)
		return
	}
	// A task already submitted before an account was disabled must still be
	// accounted for. New submissions and owner cleanup probes remain fenced.
	if c.Param("action") != "settle" && (!u.IsActive || u.DeletionRequestedAt != nil) {
		c.AbortWithStatus(403)
		return
	}
	ctx := context.WithValue(c.Request.Context(), types.UserIDContextKey, u.ID)
	ctx = context.WithValue(ctx, types.TenantIDContextKey, u.TenantID)
	switch c.Param("action") {
	case "owner":
		c.JSON(200, gin.H{"success": true, "data": gin.H{"active": true}})
	case "reserve":
		id, e := h.billing.ReserveImage(ctx, req.TaskID)
		var access *firebilling.AccessError
		if errors.As(e, &access) && access.HTTPStatus() == http.StatusPaymentRequired {
			c.JSON(http.StatusPaymentRequired, gin.H{"success": false, "message": access.Error(), "code": "image_allowance_exhausted"})
			return
		}
		fireResult(c, gin.H{"id": id}, e)
	case "settle":
		fireResult(c, gin.H{"settled": true}, h.billing.SettleImage(ctx, req.TaskID, req.Outcome))
	default:
		c.AbortWithStatus(404)
	}
}
