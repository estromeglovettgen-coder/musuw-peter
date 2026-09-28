package service

import (
	"context"
	"testing"

	"github.com/Tencent/WeKnora/internal/types"
	"github.com/Tencent/WeKnora/internal/types/interfaces"
)

type stubEmbedChannelRepo struct {
	interfaces.EmbedChannelRepository
	ch      *types.EmbedChannel
	created *types.EmbedChannel
}

func (r *stubEmbedChannelRepo) Create(_ context.Context, ch *types.EmbedChannel) error {
	cp := *ch
	r.created = &cp
	return nil
}

func (r *stubEmbedChannelRepo) GetByID(_ context.Context, id string) (*types.EmbedChannel, error) {
	if r.ch == nil || r.ch.ID != id {
		return nil, nil
	}
	cp := *r.ch
	return &cp, nil
}

func (r *stubEmbedChannelRepo) Update(_ context.Context, ch *types.EmbedChannel) error {
	cp := *ch
	r.ch = &cp
	return nil
}

func TestEmbedChannelUpdateAgentID(t *testing.T) {
	repo := &stubEmbedChannelRepo{
		ch: &types.EmbedChannel{
			ID:       "ch-1",
			TenantID: 42,
			AgentID:  "agent-old",
			Name:     "Support",
		},
	}
	svc := &embedChannelService{
		repo: repo,
		agentService: &stubAgentForEmbed{
			agent: &types.CustomAgent{ID: "agent-new", TenantID: 42},
		},
	}
	enabled := true
	updated, err := svc.Update(
		context.Background(),
		42,
		"ch-1",
		&types.EmbedChannel{AgentID: "agent-new"},
		&enabled, nil, nil, nil, nil, nil, nil,
	)
	if err != nil {
		t.Fatalf("Update() error = %v", err)
	}
	if updated.AgentID != "agent-new" {
		t.Fatalf("updated.AgentID = %q, want agent-new", updated.AgentID)
	}
	if repo.ch.AgentID != "agent-new" {
		t.Fatalf("persisted AgentID = %q, want agent-new", repo.ch.AgentID)
	}
}

func TestEmbedChannelCreateRejectsAgentFromAnotherTenant(t *testing.T) {
	repo := &stubEmbedChannelRepo{}
	svc := &embedChannelService{
		repo: repo,
		agentService: &stubAgentForEmbed{
			agent: &types.CustomAgent{ID: "foreign-agent", TenantID: 99},
		},
	}

	_, _, err := svc.Create(
		context.Background(),
		42,
		"foreign-agent",
		&types.EmbedChannel{Name: "must-not-exist"},
	)
	if err == nil {
		t.Fatal("Create() error = nil, want foreign-tenant agent rejection")
	}
	if repo.created != nil {
		t.Fatalf("Create() persisted a channel for foreign agent: %#v", repo.created)
	}
}
