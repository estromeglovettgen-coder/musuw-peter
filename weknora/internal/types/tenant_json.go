package types

import "encoding/json"

// MarshalJSON makes server-only tenant credentials impossible to leak through
// an accidental direct JSON serialization of a Tenant. Normal tenant HTTP
// responses already go through DTO/redaction helpers, but create paths have
// historically returned the freshly-created Tenant object itself.
//
// Keep database persistence unchanged: Tenant.Credentials is still stored by
// GORM through CredentialsConfig.Value; this hook applies only when a Tenant is
// serialized as JSON for an HTTP response or another JSON consumer.
func (t Tenant) MarshalJSON() ([]byte, error) {
	type tenantJSON Tenant
	out := tenantJSON(t)
	// Generic Tenant JSON is never a credential retrieval surface. OpenRouter is
	// removed entirely and other provider secrets are returned only as the
	// existing redaction placeholder.
	out.Credentials = CredentialsConfigForResponse(t.Credentials, true)
	return json.Marshal(out)
}
