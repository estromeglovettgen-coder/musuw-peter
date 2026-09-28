package interfaces

import (
	"context"

	"github.com/Tencent/WeKnora/internal/types"
)

// ConsumerModelResolver is the server-authoritative seam for the fixed
// platform consumer scenes. Implementations validate policy against the
// current active builtin OpenRouter catalog for each scene's native type
// before returning a model. Chat remains a hidden runtime compatibility scene.
type ConsumerModelResolver interface {
	ResolveConsumerModel(ctx context.Context, scene types.ConsumerScene, requestedID string) (*types.Model, error)
	ListConsumerModelOptions(ctx context.Context, scene types.ConsumerScene) ([]*types.ConsumerModelOption, error)
	AllowsFreeConsumerModel(ctx context.Context, model *types.Model) (bool, error)
}
