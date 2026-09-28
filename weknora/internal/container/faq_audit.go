package container

import (
	"github.com/Tencent/WeKnora/internal/types"
	"gorm.io/gorm"
)

// auditLegacyFAQRows performs a read-only count of FAQ knowledge bases. Lite
// deliberately makes FAQ routes unreachable, but existing databases can still
// contain historical rows. Counting them at startup gives operators a useful
// migration/verification signal without deleting, rewriting, or otherwise
// changing customer data.
func auditLegacyFAQRows(db *gorm.DB) (int64, error) {
	if db == nil || !db.Migrator().HasTable(&types.KnowledgeBase{}) {
		return 0, nil
	}
	var count int64
	if err := db.Model(&types.KnowledgeBase{}).
		Where("type = ?", types.KnowledgeBaseTypeFAQ).
		Count(&count).Error; err != nil {
		return 0, err
	}
	return count, nil
}
