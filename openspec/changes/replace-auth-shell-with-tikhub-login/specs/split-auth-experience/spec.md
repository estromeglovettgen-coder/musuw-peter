## ADDED Requirements

### Requirement: Public authentication uses the reference split shell
The Musuw public authentication surface SHALL use the downloaded TikHub login package as the structural and visual reference while retaining Musuw branding and a black-and-white primary palette. Desktop SHALL render a two-column shell and compact viewports SHALL collapse to a single form column.

#### Scenario: Desktop sign-in loads
- **WHEN** an unauthenticated visitor opens the public sign-in screen on a desktop viewport
- **THEN** the page presents a left narrative panel and a right authentication panel with the reference proportions, density, typography, and control geometry

#### Scenario: Mobile sign-in loads
- **WHEN** the same visitor opens the page below the desktop breakpoint
- **THEN** the narrative panel is hidden, a compact Musuw brand header remains, and the authentication controls fit without horizontal overflow

### Requirement: Musuw narrative replaces TikHub product copy
The left panel SHALL show “创建你的AI第二大脑”, SHALL keep “把资料转化为” as the fixed headline lead, and SHALL render “会”, “思考的”, and “知识资产” as three independently focused terms. English locale SHALL present an equivalent fixed lead followed by three focused terms.

#### Scenario: Chinese narrative renders
- **WHEN** the resolved auth locale is Chinese
- **THEN** the eyebrow, fixed lead, and all three focused Chinese terms are present, and the three focused terms are independently addressable segments

### Requirement: Desktop narrative motion preserves contrast and character identity
The desktop narrative panel SHALL use a black surface with a high-contrast monochrome fluid effect that responds to pointer movement. The four narrative characters SHALL retain their original purple, dark-blue, orange, and yellow colors instead of being converted to grayscale.

#### Scenario: Visitor moves the pointer over the narrative panel
- **WHEN** a desktop visitor moves the pointer across the left panel
- **THEN** the fluid field responds with visibly distinct monochrome highlights while the four characters retain their original colors

### Requirement: Existing identity methods keep one continuation
Password SHALL remain the primary sign-in form. Google and direct email-code sign-in SHALL appear after the visual divider and SHALL invoke the existing `AuthRuntime` operations. Successful password, Google, and OTP identities SHALL continue through the existing Supabase and WeKnora OIDC path.

#### Scenario: Visitor chooses Google
- **WHEN** the visitor activates Google below the divider
- **THEN** the existing Google PKCE flow starts without a new provider or redirect mechanism

#### Scenario: Visitor chooses email code
- **WHEN** the visitor activates email-code sign-in below the divider
- **THEN** the existing email entry, six-digit code, cooldown, verification, and continuation states are used

#### Scenario: Visitor signs in with password
- **WHEN** the visitor submits valid password credentials
- **THEN** the existing password identity flow and validated pending checkout or authorization continuation remain unchanged

### Requirement: All authentication states share the split experience
Registration, email-code entry, password-reset request, reset-link acknowledgement, password recovery, registration confirmation, success, failure, and pending states SHALL reuse the same responsive split shell. The shell MUST NOT render TikHub customer-service UI.

#### Scenario: Password reset is requested
- **WHEN** a visitor enters the password-reset flow
- **THEN** the right panel shows the appropriate reset form or acknowledgement while the same left narrative shell remains visible on desktop

#### Scenario: Password is recovered
- **WHEN** a valid recovery session reaches the new-password screen
- **THEN** the right panel shows the existing new-password and confirmation behavior in the shared shell

#### Scenario: Auth operation is pending
- **WHEN** an auth callback, consent, logout, recovery, identity, or start operation is pending
- **THEN** the right panel exposes a localized busy status without replacing the page with an unrelated card

#### Scenario: Customer service is absent
- **WHEN** any public authentication state renders
- **THEN** no floating chat, support launcher, or TikHub customer-service script is present

### Requirement: Accessibility and theme behavior remain complete
The split shell SHALL retain visible labels, autocomplete tokens, keyboard focus, disabled busy actions, bounded error messages, direct Terms and Privacy links, reduced-motion behavior, and light/dark theme support.

#### Scenario: Alternative input mode is active
- **WHEN** the visitor uses keyboard navigation, dark mode, reduced motion, or a narrow viewport
- **THEN** authentication remains operable, readable, and free of motion or contrast dependencies
