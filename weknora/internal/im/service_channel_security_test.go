package im

import (
	"testing"

	"github.com/Tencent/WeKnora/internal/types"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestCreateChannelDuplicateBotErrorDoesNotLeakForeignTenantMetadata(t *testing.T) {
	db := newLifecycleTestDB(t)
	existing := &IMChannel{
		ID:          "foreign-channel-sensitive-id",
		TenantID:    99,
		AgentID:     "foreign-agent",
		Platform:    "mattermost",
		Name:        "foreign-channel-sensitive-name",
		Enabled:     false,
		Credentials: types.JSON(`{"outgoing_token":"shared-sensitive-bot-key"}`),
	}
	require.NoError(t, db.Create(existing).Error)

	svc := newLifecycleTestService(db, nil, "instance-one")
	t.Cleanup(svc.Stop)
	candidate := &IMChannel{
		ID:          "local-channel",
		TenantID:    42,
		AgentID:     "local-agent",
		Platform:    "mattermost",
		Name:        "local channel",
		Enabled:     false,
		Credentials: types.JSON(`{"outgoing_token":"shared-sensitive-bot-key"}`),
	}

	err := svc.CreateChannel(candidate)
	require.ErrorIs(t, err, ErrDuplicateBot)
	assert.Equal(t, "this bot is already bound to another channel", err.Error())
	assert.NotContains(t, err.Error(), existing.ID)
	assert.NotContains(t, err.Error(), existing.Name)
	assert.NotContains(t, err.Error(), "shared-sensitive-bot-key")
}
