package handler

import (
	"context"
	"net/http"
	"os"
	"strings"

	"github.com/Tencent/WeKnora/internal/application/service"
	apperrors "github.com/Tencent/WeKnora/internal/errors"
	"github.com/Tencent/WeKnora/internal/logger"
	"github.com/Tencent/WeKnora/internal/types"
	"github.com/Tencent/WeKnora/internal/types/interfaces"
	"github.com/gin-gonic/gin"
)

// usableSkillLister returns the installed skills a chat turn can actually
// invoke on one sandbox config. The @ picker and the agent editor both read
// this set so they cannot offer a skill the running image does not carry.
type usableSkillLister interface {
	ListUsableSkills(ctx context.Context, tenantID uint64, configID string) []*types.TenantSkillEntity
}

// SkillHandler handles skill-related HTTP requests
type SkillHandler struct {
	usableSkills usableSkillLister
	catalog      skillCatalogService
	// preloadedSkills is retained for deployments that still use the legacy
	// environment-only Docker backend. Named sandbox configs never consult it:
	// their picker is scoped to tenant-installed skills in the selected image.
	preloadedSkills interfaces.SkillService
}

type skillCatalogService interface {
	ListCatalog(ctx context.Context, tenantID uint64) ([]service.SkillCatalogView, error)
	RegisterCatalogFromArchive(ctx context.Context, tenantID uint64, archive []byte) (*types.TenantSkillCatalogEntity, error)
	RegisterCatalogFromSource(ctx context.Context, tenantID uint64, source string) (*types.TenantSkillCatalogEntity, error)
	InstallCatalogToConfigs(ctx context.Context, tenantID uint64, catalogID string, configIDs []string) (*service.CatalogInstallResult, error)
	DeleteCatalog(ctx context.Context, tenantID uint64, catalogID string) error
	ListCatalogFiles(ctx context.Context, tenantID uint64, catalogID string) ([]service.SkillFileEntry, error)
	ReadCatalogFile(ctx context.Context, tenantID uint64, catalogID, relativePath string) (*service.SkillFileContent, error)
}

// NewSkillHandler creates a new skill handler. catalog may be nil in tests
// that only exercise the chat picker. The optional preloaded service restores
// the legacy /skills listing for env-only Docker deployments while preserving
// the two-argument constructor used by older embedders.
func NewSkillHandler(
	usableSkills usableSkillLister,
	catalog skillCatalogService,
	preloaded ...interfaces.SkillService,
) *SkillHandler {
	h := &SkillHandler{
		usableSkills: usableSkills,
		catalog:      catalog,
	}
	if len(preloaded) > 0 {
		h.preloadedSkills = preloaded[0]
	}
	return h
}

// SkillInfoResponse represents the skill info returned to frontend
type SkillInfoResponse struct {
	Name        string `json:"name"`
	Description string `json:"description"`
}

// ListSkills godoc
// @Summary      获取当前沙箱配置上可执行的 Skills
// @Description  返回指定沙箱配置镜像内、智能体实际能调用的已安装技能（ready 且启用）。未指定配置时，旧版环境 Docker 部署返回预装技能。
// @Tags         Skills
// @Accept       json
// @Produce      json
// @Param        sandbox_config_id  query     string  false  "Sandbox config ID"
// @Success      200  {object}  map[string]interface{}  "Skills列表"
// @Security     Bearer
// @Security     ApiKeyAuth
// @Router       /skills [get]
func (h *SkillHandler) ListSkills(c *gin.Context) {
	configID := strings.TrimSpace(c.Query("sandbox_config_id"))
	if configID == "" || configID == types.SandboxConfigIDGlobalDefault {
		if h.preloadedSkills != nil && legacyDockerSkillsAvailable() {
			metadata, err := h.preloadedSkills.ListPreloadedSkills(c.Request.Context())
			if err != nil {
				logger.ErrorWithFields(c.Request.Context(), err, nil)
				_ = c.Error(apperrors.NewInternalServerError("Failed to list skills: " + err.Error()))
				return
			}
			response := make([]SkillInfoResponse, 0, len(metadata))
			for _, meta := range metadata {
				if meta == nil {
					continue
				}
				response = append(response, SkillInfoResponse{
					Name:        meta.Name,
					Description: meta.Description,
				})
			}
			c.JSON(http.StatusOK, gin.H{
				"success":          true,
				"data":             response,
				"skills_available": true,
			})
			return
		}
		c.JSON(http.StatusOK, gin.H{
			"success":          true,
			"data":             []SkillInfoResponse{},
			"skills_available": false,
		})
		return
	}

	rows := h.usableSkills.ListUsableSkills(
		c.Request.Context(), sandboxConfigTenantID(c), configID,
	)
	response := make([]SkillInfoResponse, 0, len(rows))
	for _, row := range rows {
		if row == nil {
			continue
		}
		response = append(response, SkillInfoResponse{
			Name:        row.Name,
			Description: row.Description,
		})
	}

	c.JSON(http.StatusOK, gin.H{
		"success":          true,
		"data":             response,
		"skills_available": true,
	})
}

// legacyDockerSkillsAvailable mirrors the compatibility manager's narrow
// environment contract. Host preloaded skills are advertised only when the
// deployment explicitly selected Docker; local process execution was removed
// for security and disabled/unknown modes stay fail-closed.
func legacyDockerSkillsAvailable() bool {
	return strings.EqualFold(strings.TrimSpace(os.Getenv("WEKNORA_SANDBOX_MODE")), "docker")
}
