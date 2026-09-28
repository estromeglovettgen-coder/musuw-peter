## 1. Contextual onboarding

- [x] 1.1 Make the empty knowledge-base guide prefer the centered create action and fall back safely on populated lists
- [x] 1.2 Prefill the first available localized Lite knowledge-base name and enable a Lite-compatible create-modal guide ending on submit
- [x] 1.3 Prefill the first available localized Lite custom-agent name while preserving preset and Standard naming
- [x] 1.4 Split knowledge-base detail guidance into separate Add Document and Import Webpage steps
- [x] 1.5 Mount a first-chat guide on the eligible empty new-chat route using metadata-only composer targets
- [x] 1.6 Update all supported guide and default-name locales while preserving per-user completion plus Standard replay behavior

## 2. Account and memory settings

- [x] 2.1 Align account trigger/menu row geometry, constrain long identity content, use the neutral avatar, and restore the free-plan upgrade icon
- [x] 2.2 Hide the unsupported tutorial-replay control for Lite without removing Standard behavior
- [x] 2.3 Replace Lite-visible member/workspace memory wording with accurate neutral single-user wording in every supported locale
- [x] 2.4 Reuse the existing segmented control and authoritative selector styles throughout Long-term Memory
- [x] 2.5 Make successful memory autosaves silent, preserve one explicit failure message, and clear pending debounce work on unmount

## 3. Shared consumer UI authority

- [x] 3.1 Make the shared scene-select bridge exactly match the General Settings selector in light, dark, desktop, and narrow states
- [x] 3.2 Apply the selector authority to all affected non-composer Lite controls and remove double-shell or overlapping popup treatments
- [x] 3.3 Unify knowledge document filters and top actions, prevent fixed-label ellipsis, and implement theme-inverse Add Document styling
- [x] 3.4 Make knowledge-base and agent directories share exact header, divider, content, grid, card, empty-state, breakpoint, and theme values
- [x] 3.5 Replace page-local deletion presentation with one semantic shared confirmation-dialog treatment for agent and knowledge-base deletion

## 4. Contract and browser verification

- [x] 4.1 Add or update targeted guide, account-menu, selector, toolbar, directory-parity, dialog, locale, and memory contract tests
- [x] 4.2 Run frontend unit/contract tests, i18n/static checks available in the repository, type checking, and a production build; fix every in-scope failure
- [x] 4.3 Perform one bounded adversarial review covering omission, theme, viewport, focus, overflow, guide fallback, and Standard preservation risks
- [ ] 4.4 Verify the first-user knowledge and chat flow plus every affected surface in light and dark themes through a real browser

## 5. Integration and staging acceptance

- [ ] 5.1 Refresh required WeKnora provenance records and commit the verified implementation
- [ ] 5.2 Merge the verified branch into `main` without overwriting unrelated work and push the resulting main revision
- [ ] 5.3 Wait for CI and staging deployment, then rerun the critical Lite browser acceptance scenarios on the deployed revision
