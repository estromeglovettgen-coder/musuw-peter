package handler

import (
	"encoding/json"
	"net/http"

	"github.com/Tencent/WeKnora/internal/types"
	"github.com/gin-gonic/gin"
)

// writeWikiReadResponse retains the native Wiki shape but strips internal
// ownership and arbitrary metadata from the purchased read-only projection.
func writeWikiReadResponse(c *gin.Context, payload any) {
	if _, ok := types.MarketplaceScopeFromContext(c.Request.Context()); !ok {
		c.JSON(http.StatusOK, payload)
		return
	}
	raw, err := json.Marshal(payload)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Wiki response is unavailable"})
		return
	}
	var projected any
	if err := json.Unmarshal(raw, &projected); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Wiki response is unavailable"})
		return
	}
	stripMarketplaceWikiMetadata(projected)
	c.JSON(http.StatusOK, projected)
}

func stripMarketplaceWikiMetadata(value any) {
	switch row := value.(type) {
	case map[string]any:
		for _, key := range []string{
			"tenant_id", "last_editor_id", "editor_id", "created_by", "page_metadata", "source_refs", "chunk_refs",
		} {
			delete(row, key)
		}
		for _, child := range row {
			stripMarketplaceWikiMetadata(child)
		}
	case []any:
		for _, child := range row {
			stripMarketplaceWikiMetadata(child)
		}
	}
}
