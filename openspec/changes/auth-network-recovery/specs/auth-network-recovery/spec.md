## ADDED Requirements

### Requirement: Incoming login takes precedence over obsolete local credentials
The frontend SHALL process a pending OIDC callback before ordinary startup validation of a previously stored session, while preserving callback validation and normal route authorization.

#### Scenario: Fresh login returns to a browser with expired credentials
- **WHEN** a valid new callback arrives and stored credentials are expired or their refresh is rejected
- **THEN** stale-session preflight SHALL NOT redirect away before the callback can be processed
- **AND** the new session SHALL still follow the existing callback and authorization flow

#### Scenario: Ordinary startup has no callback
- **WHEN** the browser starts with a stored session and no pending callback
- **THEN** existing stored-session validation and invalid-session recovery SHALL remain active

#### Scenario: Temporary refresh failure
- **WHEN** an ordinary refresh fails temporarily rather than rejecting credentials
- **THEN** existing recovery SHALL preserve the session instead of treating that error as a definitive logout

### Requirement: Evidence distinguishes incident facts from hypotheses
The investigation SHALL report confirmed timestamps, status and monitoring coverage without exposing tokens, passwords, OTPs, raw IPs or unrelated customer content.

#### Scenario: Provider success lacks browser correlation
- **WHEN** provider logs show success but no correlated browser trace exists
- **THEN** the report SHALL NOT claim that the user's full login succeeded or that a reproduced defect definitively caused that incident
