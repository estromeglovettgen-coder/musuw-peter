package service

import (
	"github.com/Tencent/WeKnora/internal/firebilling"
	"github.com/Tencent/WeKnora/internal/types"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
	"testing"
)

func TestFireAccountImageSignupInheritanceExplicitZeroAndOverride(t *testing.T) {
	s := fireFixture(t)
	ctx := fireAdminContext()
	require.NoError(t, s.db.AutoMigrate(&firebilling.Plan{}, &firebilling.Membership{}, &firebilling.Adjustment{}, &firebilling.Call{}, &firebilling.QuestionCall{}, &firebilling.ImageCall{}))
	require.NoError(t, s.db.Create(&firebilling.Plan{ID: "image-account-plan", Name: "图片套餐", DurationDays: 30, TokenLimit: 1000, ImageLimit: 7, Active: true}).Error)
	zero, two := int64(0), int64(2)
	for _, row := range []struct {
		operation string
		images    *int64
		want      int64
	}{{"images-inherit", nil, 7}, {"images-zero", &zero, 0}, {"images-two", &two, 2}} {
		req := &types.AdminCreateUserRequest{OperationID: row.operation, FirePlanID: "image-account-plan", FireImages: row.images}
		created, e := s.CreateAccount(ctx, req, func(tx *gorm.DB, user *types.User) error {
			_, e := firebilling.NewService(tx).Apply(ctx, user.ID, firebilling.Mutation{OperationID: "account:" + req.OperationID, Kind: "grant", PlanID: req.FirePlanID, Images: req.FireImages})
			return e
		})
		require.NoError(t, e)
		st, e := firebilling.NewService(s.db).Status(ctx, created.User.ID)
		require.NoError(t, e)
		require.Equal(t, row.want, st.ImageLimit)
		req.FireImages = &two
		if row.want == 2 {
			req.FireImages = nil
		}
		_, e = s.CreateAccount(ctx, req, nil)
		require.ErrorIs(t, e, ErrFireCreateConflict)
	}
}
