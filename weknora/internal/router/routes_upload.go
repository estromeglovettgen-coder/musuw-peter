package router

import (
	"net/http"

	"github.com/gin-gonic/gin"

	"github.com/Tencent/WeKnora/internal/handler"
	"github.com/Tencent/WeKnora/internal/types/interfaces"
)

// RegisterDirectUploadRoutes exposes a KB-scoped S3/R2 browser upload
// handshake. The object bytes never enter the Go request body: the handler
// returns short-lived presigned PUT (or multipart part URLs), then verifies
// the completed object with HeadObject and, when configured, adopts it as a
// normal Knowledge row. Provider-specific capability is optional; non-S3
// tenants receive a bounded 503 rather than falling back to a buffered upload.
func RegisterDirectUploadRoutes(
	r *gin.RouterGroup,
	resolver interfaces.StorageBackendResolver,
	kbService interfaces.KnowledgeBaseService,
	creator interfaces.StoredKnowledgeCreator,
	g *rbacGuards,
) {
	uploadHandler := handler.NewDirectUploadHandlerForKnowledge(resolver, kbService, creator)
	// Keep this endpoint under the existing KB mutation guards. A global
	// /uploads route would let a Contributor sign objects for another KB before
	// the token's tenant check ran; :id is resolved by OwnedKBOrAdmin/KBAccessWrite.
	uploads := g.apiKeyGroup(r.Group("/knowledge-bases/:id/knowledge/uploads"), apiKeyIngest(apiKeyFullAccess()))
	uploads.POST("", g.OwnedKBOrAdmin(), g.KBAccessWrite("id"), uploadHandler.Create)
	uploads.POST("/:upload_id/complete", g.OwnedKBOrAdmin(), g.KBAccessWrite("id"), uploadHandler.Complete)
	g.apiKeyRoute(
		r,
		http.MethodHead,
		"/knowledge-bases/:id/knowledge/uploads/:upload_id",
		apiKeyRetrieve(apiKeyFullAccess()),
		g.OwnedKBOrAdmin(),
		g.KBAccessWrite("id"),
		uploadHandler.Verify,
	)
}
