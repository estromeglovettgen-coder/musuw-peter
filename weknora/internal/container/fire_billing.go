package container

import (
	"context"
	"github.com/Tencent/WeKnora/internal/firebilling"
	"github.com/Tencent/WeKnora/internal/logger"
	"github.com/Tencent/WeKnora/internal/models/tokenmeter"
	"gorm.io/gorm"
	"time"
)

func newFireBillingService(db *gorm.DB) *firebilling.Service {
	s := firebilling.NewService(db)
	if !firebilling.Enabled() {
		return s
	}
	tokenmeter.Configure(s)
	go func() {
		tick := time.NewTicker(5 * time.Minute)
		defer tick.Stop()
		for {
			ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
			e := s.RecoverPending(ctx)
			cancel()
			if e != nil {
				logger.Errorf(context.Background(), "[FireBilling] pending usage recovery failed: %v", e)
			}
			<-tick.C
		}
	}()
	return s
}
