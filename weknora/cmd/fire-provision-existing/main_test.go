package main

import (
	"testing"

	"github.com/stretchr/testify/require"
)

func TestMaintenanceRequiresExplicitActorTargetsAndConfirmation(t *testing.T) {
	actor := "54c3ff5e-542c-4726-86bb-13c46d50cdf5"
	target := "f2062571-ed8c-4255-bb6e-62bf294e5847"
	valid := []string{"--actor-user-id", actor, "--target-user-ids", target}
	confirmed := func(string) string { return confirmation }
	opts, err := parseOptions(valid, confirmed)
	require.NoError(t, err)
	require.Equal(t, actor, opts.actorID)
	require.Equal(t, []string{target}, opts.targetIDs)
	_, err = parseOptions(valid, func(string) string { return "" })
	require.Error(t, err)
	for _, args := range [][]string{
		nil,
		{"--actor-user-id", actor},
		{"--target-user-ids", target},
		{"--actor-user-id", actor, "--target-user-ids", "all"},
		{"--actor-user-id", actor, "--target-user-ids", target + "," + target},
		{"--actor-user-id", actor, "--target-user-ids", target, "unexpected"},
	} {
		_, err := parseOptions(args, confirmed)
		require.Error(t, err)
	}
}
