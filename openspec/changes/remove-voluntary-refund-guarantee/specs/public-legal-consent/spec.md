## MODIFIED Requirements

### Requirement: Public policies match the live service
The bilingual public legal suite MUST identify the Musuw operator and contact,
describe actual provider roles, and preserve mandatory consumer rights. The
Terms, Refund Policy, and Subscription Policy MUST state that Musuw does not
offer voluntary or routine refunds and completed transactions are generally
final. They MUST preserve refunds required by law or approved under Paddle's
current Refund Policy, MUST link the current Paddle buyer/refund/support routes,
and MUST NOT promise the former 30-day voluntary refund guarantee.

#### Scenario: Visitor reads purchase terms
- **WHEN** a visitor opens the English or Chinese Terms, Refund Policy, or Subscription Policy
- **THEN** the page states the generally non-refundable policy, preserves mandatory and Paddle-approved exceptions, and contains no 30-day voluntary refund guarantee

#### Scenario: Visitor requests a legally required or Paddle-approved refund
- **WHEN** applicable law requires a remedy or Paddle approves a refund under its current policy
- **THEN** the public policy directs the visitor to Paddle or Musuw support and does not claim that those rights are excluded

#### Scenario: Visitor cancels a subscription
- **WHEN** a visitor cancels a recurring subscription
- **THEN** the policy distinguishes stopping future renewals from reversing an already completed transaction
