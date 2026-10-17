package service

import (
	"encoding/json"

	"github.com/Tencent/WeKnora/internal/types"
)

// oneWikiInitiatorRows keeps a native batch attributable to one real caller.
// Deduplication remains latest-per-document: all older rows for that document
// travel with its canonical latest operation and are drained together. Other
// actors' rows remain queued (and are released if this was a claim).
func oneWikiInitiatorRows(rows []*types.TaskPendingOp, dedupDocuments bool) ([]*types.TaskPendingOp, []int64) {
	if len(rows) == 0 {
		return rows, nil
	}
	type actorRow struct {
		Initiator   types.TaskInitiator `json:"initiator"`
		KnowledgeID string              `json:"knowledge_id"`
	}
	parsed := make([]actorRow, len(rows))
	latest := make(map[string]types.TaskInitiator)
	for i, row := range rows {
		_ = json.Unmarshal(row.Payload, &parsed[i])
		if parsed[i].KnowledgeID == "" {
			parsed[i].KnowledgeID = row.DedupKey
		}
		if dedupDocuments && parsed[i].KnowledgeID != "" {
			latest[parsed[i].KnowledgeID] = parsed[i].Initiator
		}
	}
	actorFor := func(i int) types.TaskInitiator {
		if dedupDocuments && parsed[i].KnowledgeID != "" {
			return latest[parsed[i].KnowledgeID]
		}
		return parsed[i].Initiator
	}
	actor := actorFor(0).UserID
	selected := make([]*types.TaskPendingOp, 0, len(rows))
	var deferred []int64
	for i, row := range rows {
		if actorFor(i).UserID == actor {
			selected = append(selected, row)
		} else {
			deferred = append(deferred, row.ID)
		}
	}
	return selected, deferred
}
