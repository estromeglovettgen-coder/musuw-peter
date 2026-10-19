// fire-provision-existing explicitly grants the configured Taylor/course to
// named existing accounts. It never creates identities or changes plans.
package main

import (
	"context"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"os"
	"strings"
	"time"

	"github.com/Tencent/WeKnora/internal/application/repository"
	"github.com/Tencent/WeKnora/internal/application/service"
	"github.com/Tencent/WeKnora/internal/container"
	"github.com/Tencent/WeKnora/internal/types"
	"github.com/google/uuid"
)

const confirmation = "grant-taylor-course-to-explicit-users"

type options struct {
	actorID   string
	targetIDs []string
}

func parseOptions(args []string, getenv func(string) string) (options, error) {
	var out options
	fs := flag.NewFlagSet("fire-provision-existing", flag.ContinueOnError)
	fs.SetOutput(io.Discard)
	actor := fs.String("actor-user-id", "", "existing active system administrator UUID")
	targets := fs.String("target-user-ids", "", "explicit comma-separated existing user UUIDs")
	if err := fs.Parse(args); err != nil {
		return out, err
	}
	if fs.NArg() != 0 || uuid.Validate(strings.TrimSpace(*actor)) != nil || strings.TrimSpace(*targets) == "" {
		return out, errors.New("provide --actor-user-id UUID and --target-user-ids UUID,UUID; wildcard/all selection is not supported")
	}
	out.actorID = strings.TrimSpace(*actor)
	seen := map[string]bool{}
	for _, raw := range strings.Split(*targets, ",") {
		id := strings.TrimSpace(raw)
		if uuid.Validate(id) != nil || seen[id] {
			return options{}, errors.New("target user IDs must be unique UUIDs")
		}
		seen[id] = true
		out.targetIDs = append(out.targetIDs, id)
	}
	if len(out.targetIDs) > 100 {
		return options{}, errors.New("at most 100 explicitly named accounts are allowed per run")
	}
	if getenv("FIRE_PROVISION_EXISTING_CONFIRM") != confirmation {
		return options{}, errors.New("set FIRE_PROVISION_EXISTING_CONFIRM=grant-taylor-course-to-explicit-users to authorize this explicit maintenance action")
	}
	return out, nil
}

func run(args []string) error {
	opts, err := parseOptions(args, os.Getenv)
	if err != nil {
		return err
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)
	defer cancel()
	db, err := container.OpenExistingDatabaseForMaintenance(ctx)
	if err != nil {
		return err
	}
	sqlDB, err := db.DB()
	if err != nil {
		return err
	}
	defer sqlDB.Close()
	fire, err := service.NewFireWorkspaceService(db)
	if err != nil || !fire.Enabled() {
		return errors.New("all explicit FIRE_SOURCE_TENANT_ID, FIRE_COURSE_KB_ID and FIRE_TAYLOR_AGENT_ID settings are required")
	}
	actor, err := repository.NewUserRepository(db).GetUserByID(ctx, opts.actorID)
	if err != nil || actor == nil || !actor.IsSystemAdmin || !actor.IsActive || actor.DeletionRequestedAt != nil {
		return service.ErrFireProvisionForbidden
	}
	// Derive the context from the real persisted administrator, not a flag.
	// The service locks and rechecks this identity in every target transaction.
	ctx = context.WithValue(ctx, types.UserIDContextKey, actor.ID)
	ctx = context.WithValue(ctx, types.SystemAdminContextKey, true)
	encoder := json.NewEncoder(os.Stdout)
	for _, targetID := range opts.targetIDs {
		result, err := fire.ProvisionExistingAccount(ctx, actor.ID, targetID)
		if err != nil {
			return fmt.Errorf("target %s was not provisioned; earlier successful rows are safe to rerun: %w", targetID, err)
		}
		if err := encoder.Encode(result); err != nil {
			return err
		}
	}
	return nil
}

func main() {
	if err := run(os.Args[1:]); err != nil {
		fmt.Fprintln(os.Stderr, "fire-provision-existing:", err)
		os.Exit(1)
	}
}
