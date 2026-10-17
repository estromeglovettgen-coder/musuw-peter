package types

import "time"

// FireWorkspaceAccount is a server-issued resource grant, not membership in
// the source tenant. It never contains credentials or provider configuration.
type FireWorkspaceAccount struct {
	UserID                string    `gorm:"type:varchar(36);primaryKey" json:"user_id"`
	TenantID              uint64    `gorm:"uniqueIndex;not null" json:"tenant_id"`
	OperationID           string    `gorm:"type:varchar(100);uniqueIndex;not null" json:"-"`
	RequestFingerprint    string    `gorm:"type:varchar(64);not null" json:"-"`
	SourceTenantID        uint64    `gorm:"not null" json:"-"`
	CourseKnowledgeBaseID string    `gorm:"type:varchar(36);not null" json:"course_knowledge_base_id"`
	SourceAgentID         string    `gorm:"type:varchar(36);not null" json:"-"`
	DefaultAgentID        string    `gorm:"type:varchar(36);not null" json:"default_agent_id"`
	ModelIDsJSON          string    `gorm:"type:text;not null" json:"-"`
	CreatedAt             time.Time `json:"created_at"`
}

const FireDefaultAgentID = "fire-taylor"
