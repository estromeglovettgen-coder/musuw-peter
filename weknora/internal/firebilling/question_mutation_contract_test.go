package firebilling

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestQuestionMutationPreservesLegacyFingerprintOnRetry(t *testing.T) {
	s, admin := questionFixture(t)
	req := Mutation{OperationID: "old-operation", Kind: "grant", DurationDays: 30, Tokens: 1000, Note: "legacy"}
	// Exact old declaration order is part of persisted operation fingerprints.
	old := struct {
		OperationID  string `json:"operation_id"`
		Kind         string `json:"kind"`
		PlanID       string `json:"plan_id,omitempty"`
		DurationDays int    `json:"duration_days,omitempty"`
		Tokens       int64  `json:"tokens,omitempty"`
		Note         string `json:"note,omitempty"`
	}{req.OperationID, req.Kind, req.PlanID, req.DurationDays, req.Tokens, req.Note}
	legacy, err := json.Marshal(struct {
		UserID   string
		Mutation any
	}{"alice", old})
	require.NoError(t, err)
	current, err := json.Marshal(struct {
		UserID   string
		Mutation Mutation
	}{"alice", req})
	require.NoError(t, err)
	require.Equal(t, string(legacy), string(current))
	_, err = s.Apply(admin, "alice", req)
	require.NoError(t, err)
	digest := sha256.Sum256(legacy)
	var adjustment Adjustment
	require.NoError(t, s.db.Where("operation_id = ?", req.OperationID).Take(&adjustment).Error)
	require.Equal(t, hex.EncodeToString(digest[:]), adjustment.Fingerprint)
	_, err = s.Apply(admin, "alice", req)
	require.NoError(t, err)
	zero := int64(0)
	req.Questions = &zero
	_, err = s.Apply(admin, "alice", req)
	require.ErrorIs(t, err, ErrConflict)
	req.Questions = nil
	req.QuestionLimit = &zero
	changed, err := json.Marshal(struct {
		UserID   string
		Mutation Mutation
	}{"alice", req})
	require.NoError(t, err)
	require.NotEqual(t, string(legacy), string(changed))
}
