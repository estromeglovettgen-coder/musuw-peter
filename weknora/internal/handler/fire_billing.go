package handler

import (
	"errors"
	"net/http"
	"strconv"
	"strings"

	"github.com/Tencent/WeKnora/internal/firebilling"
	"github.com/Tencent/WeKnora/internal/types"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"gorm.io/gorm"
)

type FireBillingHandler struct{ billing *firebilling.Service }

func NewFireBillingHandler(b *firebilling.Service) *FireBillingHandler {
	return &FireBillingHandler{billing: b}
}
func (h *FireBillingHandler) enabled(c *gin.Context, admin bool) bool {
	c.Header("Cache-Control", "no-store")
	if !firebilling.Enabled() {
		c.AbortWithStatusJSON(404, gin.H{"success": false, "message": "功能未启用"})
		return false
	}
	if admin {
		if e := h.billing.RequireAdmin(c.Request.Context()); e != nil {
			c.AbortWithStatusJSON(403, gin.H{"success": false, "message": "仅管理员可操作"})
			return false
		}
	}
	return true
}
func fireResult(c *gin.Context, data any, e error) {
	if e != nil {
		code := http.StatusInternalServerError
		message := "操作失败，请重试"
		switch {
		case errors.Is(e, firebilling.ErrForbidden):
			code = 403
			message = e.Error()
		case errors.Is(e, firebilling.ErrConflict):
			code = 409
			message = e.Error()
		case errors.Is(e, gorm.ErrRecordNotFound):
			code = 404
			message = "记录不存在"
		}
		c.JSON(code, gin.H{"success": false, "message": message})
		return
	}
	c.JSON(200, gin.H{"success": true, "data": data})
}
func firePage(c *gin.Context) (int, int) {
	p, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	n, _ := strconv.Atoi(c.DefaultQuery("page_size", "20"))
	return max(1, min(p, 100000)), max(1, min(n, 100))
}
func (h *FireBillingHandler) Current(c *gin.Context) {
	if !h.enabled(c, false) {
		return
	}
	id, ok := types.UserIDFromContext(c.Request.Context())
	if !ok {
		c.AbortWithStatus(401)
		return
	}
	s, e := h.billing.Status(c.Request.Context(), id)
	fireResult(c, s, e)
}
func (h *FireBillingHandler) Usage(c *gin.Context) {
	if !h.enabled(c, false) {
		return
	}
	id, _ := types.UserIDFromContext(c.Request.Context())
	p, n := firePage(c)
	var items []firebilling.Call
	var total int64
	q := h.billing.DB().WithContext(c.Request.Context()).Model(&firebilling.Call{}).Where("user_id = ? AND status = ?", id, "settled")
	e := q.Count(&total).Error
	if e == nil {
		e = q.Order("created_at DESC").Offset((p - 1) * n).Limit(n).Find(&items).Error
	}
	fireResult(c, gin.H{"items": items, "total": total, "page": p, "page_size": n}, e)
}
func (h *FireBillingHandler) Plans(c *gin.Context) {
	if !h.enabled(c, true) {
		return
	}
	plans := []firebilling.Plan{}
	e := h.billing.DB().WithContext(c.Request.Context()).Order("created_at DESC").Find(&plans).Error
	fireResult(c, plans, e)
}
func (h *FireBillingHandler) SavePlan(c *gin.Context) {
	if !h.enabled(c, true) {
		return
	}
	var p firebilling.Plan
	if c.ShouldBindJSON(&p) != nil || strings.TrimSpace(p.Name) == "" || len(p.Name) > 100 || p.DurationDays < 1 || p.DurationDays > 36500 || p.TokenLimit < 1 || p.TokenLimit > firebilling.MaxTokens || p.QuestionLimit < 0 || p.QuestionLimit > firebilling.MaxQuestions || p.ImageLimit < 0 || p.ImageLimit > firebilling.MaxImages {
		c.JSON(400, gin.H{"success": false, "message": "请输入有效名称、1–36500天、正数Token额度和非负问答条数"})
		return
	}
	db := h.billing.DB().WithContext(c.Request.Context())
	id := c.Param("id")
	var e error
	if id == "" {
		p.ID = uuid.NewString()
		e = db.Create(&p).Error
	} else {
		var existing firebilling.Plan
		e = db.First(&existing, "id = ?", id).Error
		if e == nil {
			existing.Name = strings.TrimSpace(p.Name)
			existing.DurationDays = p.DurationDays
			existing.TokenLimit = p.TokenLimit
			existing.QuestionLimit = p.QuestionLimit
			existing.ImageLimit = p.ImageLimit
			existing.Active = p.Active
			e = db.Save(&existing).Error
			p = existing
		}
	}
	fireResult(c, p, e)
}

func (h *FireBillingHandler) Users(c *gin.Context) {
	if !h.enabled(c, true) {
		return
	}
	p, n := firePage(c)
	q := h.billing.DB().WithContext(c.Request.Context()).Table("users").Where("deleted_at IS NULL")
	query := strings.TrimSpace(c.Query("query"))
	if query != "" {
		q = q.Where("LOWER(username) LIKE ? OR LOWER(email) LIKE ?", "%"+strings.ToLower(query)+"%", "%"+strings.ToLower(query)+"%")
	}
	var total int64
	var rows []types.User
	e := q.Count(&total).Error
	if e == nil {
		e = q.Order("created_at DESC").Offset((p - 1) * n).Limit(n).Find(&rows).Error
	}
	items := make([]gin.H, 0, len(rows))
	for _, u := range rows {
		s, se := h.billing.Status(c.Request.Context(), u.ID)
		if se != nil && u.IsActive {
			e = se
			break
		}
		items = append(items, gin.H{"id": u.ID, "username": u.Username, "email": u.Email, "tenant_id": u.TenantID, "created_at": u.CreatedAt, "is_system_admin": u.IsSystemAdmin, "membership": s})
	}
	fireResult(c, gin.H{"items": items, "total": total, "page": p, "page_size": n}, e)
}
func (h *FireBillingHandler) User(c *gin.Context) {
	if !h.enabled(c, true) {
		return
	}
	id := c.Param("user_id")
	var u types.User
	db := h.billing.DB().WithContext(c.Request.Context())
	e := db.First(&u, "id = ?", id).Error
	if e != nil {
		fireResult(c, nil, e)
		return
	}
	s, e := h.billing.Status(c.Request.Context(), id)
	var usage []firebilling.Call
	var adjustments []firebilling.Adjustment
	imageCalls := []firebilling.ImageCall{}
	if e == nil {
		e = db.Where("user_id = ? AND status = ?", id, "settled").Order("created_at DESC").Limit(50).Find(&usage).Error
	}
	if e == nil {
		e = db.Where("user_id = ?", id).Order("created_at DESC").Limit(100).Find(&adjustments).Error
	}
	if e == nil {
		e = db.Where("user_id = ? AND status IN ?", id, []string{"reserved", "unknown"}).Order("created_at ASC").Find(&imageCalls).Error
	}
	if e == nil {
		var completed []firebilling.ImageCall
		e = db.Where("user_id = ? AND status IN ?", id, []string{"succeeded", "failed"}).Order("created_at DESC").Limit(100).Find(&completed).Error
		imageCalls = append(imageCalls, completed...)
	}
	fireResult(c, gin.H{"user": u.ToUserInfo(), "membership": s, "usage": usage, "adjustments": adjustments, "image_calls": imageCalls}, e)
}
func (h *FireBillingHandler) Adjust(c *gin.Context) {
	if !h.enabled(c, true) {
		return
	}
	var req firebilling.Mutation
	if c.ShouldBindJSON(&req) != nil {
		c.JSON(400, gin.H{"success": false, "message": "请求格式错误"})
		return
	}
	s, e := h.billing.Apply(c.Request.Context(), c.Param("user_id"), req)
	if e != nil && !errors.Is(e, firebilling.ErrConflict) && !errors.Is(e, firebilling.ErrForbidden) && !errors.Is(e, gorm.ErrRecordNotFound) {
		c.JSON(400, gin.H{"success": false, "message": e.Error()})
		return
	}
	fireResult(c, s, e)
}
func (h *FireBillingHandler) Overview(c *gin.Context) {
	if !h.enabled(c, true) {
		return
	}
	db := h.billing.DB().WithContext(c.Request.Context())
	var users, active, expired, total int64
	e := db.Table("users").Where("deleted_at IS NULL").Count(&users).Error
	if e == nil {
		e = db.Model(&firebilling.Membership{}).Where("suspended = ? AND expires_at > CURRENT_TIMESTAMP AND token_limit > used_tokens + reserved_tokens AND (question_limit = 0 OR question_limit > used_questions)", false).Count(&active).Error
	}
	if e == nil {
		e = db.Model(&firebilling.Membership{}).Where("expires_at <= CURRENT_TIMESTAMP").Count(&expired).Error
	}
	if e == nil {
		e = db.Model(&firebilling.Call{}).Select("COALESCE(SUM(total_tokens),0)").Where("status = ?", "settled").Scan(&total).Error
	}
	fireResult(c, gin.H{"users_total": users, "active_users": active, "expired_users": expired, "total_tokens": total}, e)
}
