## 1. Reference and contract

- [x] 1.1 Record the minimum TikHub package structure, fonts, and excluded customer-service/runtime assets
- [x] 1.2 Add failing SSR/source/CSS contract tests for the split shell, three-part copy, provider ordering, shared states, and runtime boundary

## 2. View implementation

- [x] 2.1 Add the shared desktop/mobile split shell and Musuw narrative to `AuthApp`
- [x] 2.2 Place Google and email-code entry after the divider while preserving existing handlers
- [x] 2.3 Render pending, registration, OTP, reset, acknowledgement, recovery, success, and error states inside the shared shell

## 3. Visual implementation

- [x] 3.1 Add only the single Geist font asset used by the authentication shell
- [x] 3.2 Replace auth styles with the reference geometry, responsive layout, dark mode, focus treatment, black high-contrast fluid background, and original-color characters
- [x] 3.3 Ensure no TikHub customer-service component, script, identity API, or duplicate runtime is shipped

## 4. Verification

- [x] 4.1 Run focused red/green auth contract tests and the complete auth test suite
- [x] 4.2 Run auth type checking and production build with a test-safe public config
- [x] 4.3 Inspect desktop, mobile, dark, reset, and success states in a browser and perform one bounded adversarial review
