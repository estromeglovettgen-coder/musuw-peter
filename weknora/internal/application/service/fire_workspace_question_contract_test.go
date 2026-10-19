package service

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"testing"

	"github.com/Tencent/WeKnora/internal/types"
	"github.com/stretchr/testify/require"
)

func TestFireAccountLegacyFingerprintAndExplicitZeroQuestions(t *testing.T) {
	s := fireFixture(t)
	req := &types.AdminCreateUserRequest{OperationID: "legacy-question-retry", FireDurationDays: 30, FireTokens: 5000}
	// Freeze the pre-question contract, including field order and null password.
	legacy, err := json.Marshal(struct {
		Username         string  `json:"username"`
		Email            string  `json:"email"`
		Password         *string `json:"password"`
		OperationID      string  `json:"operation_id,omitempty"`
		FirePlanID       string  `json:"fire_plan_id,omitempty"`
		FireDurationDays int     `json:"fire_duration_days,omitempty"`
		FireTokens       int64   `json:"fire_tokens,omitempty"`
	}{req.Username, req.Email, req.Password, req.OperationID, req.FirePlanID, req.FireDurationDays, req.FireTokens})
	require.NoError(t, err)
	current, err := json.Marshal(req)
	require.NoError(t, err)
	require.Equal(t, string(legacy), string(current))
	mac := hmac.New(sha256.New, []byte(getJwtSecret()))
	_, err = mac.Write(legacy)
	require.NoError(t, err)
	created, err := s.CreateAccount(fireAdminContext(), req, nil)
	require.NoError(t, err)
	var grant types.FireWorkspaceAccount
	require.NoError(t, s.db.Where("user_id = ?", created.User.ID).Take(&grant).Error)
	require.Equal(t, hex.EncodeToString(mac.Sum(nil)), grant.RequestFingerprint)
	replayed, err := s.CreateAccount(fireAdminContext(), req, nil)
	require.NoError(t, err)
	require.True(t, replayed.Existing)
	zero := int64(0)
	req.FireQuestions = &zero
	_, err = s.CreateAccount(fireAdminContext(), req, nil)
	require.ErrorIs(t, err, ErrFireCreateConflict)
}
