package container

import (
	"testing"

	"go.uber.org/dig"
)

// DryRun validates the actual startup registration and eager invocation order
// without opening databases, provider clients, workers, or model connections.
func TestBuildContainerWiringBeforeEagerInvokes(t *testing.T) {
	for _, mode := range []struct {
		name  string
		redis string
	}{
		{name: "sync_tasks"},
		{name: "redis_tasks", redis: "dry-run-only:6379"},
	} {
		t.Run(mode.name, func(t *testing.T) {
			t.Setenv("REDIS_ADDR", mode.redis)
			defer func() {
				if failure := recover(); failure != nil {
					t.Fatalf("production startup dependency graph failed: %v", failure)
				}
			}()
			BuildContainer(dig.New(dig.DryRun(true)))
		})
	}
}
