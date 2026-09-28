package types

// AccountErasureTaskPayload deliberately carries only the opaque local user
// identifier. Email, Paddle identifiers, provider subjects, and credentials
// are resolved from fenced server-side state at execution time and therefore
// never enter the queue payload or logs. The generic dead-letter row may carry
// this opaque ID temporarily and is deleted by the final account purge.
type AccountErasureTaskPayload struct {
	UserID string `json:"user_id"`
}
