## 1. Contract Tests

- [x] 1.1 Add failing frontend source-contract tests for the reduced knowledge-base and agent editors, agent cards, chat selector, and MCP settings visibility
- [x] 1.2 Add failing backend Lite-gate tests for native agent CRUD/chat and MCP route access while preserving native authorization

## 2. Knowledge-Base Settings

- [x] 2.1 Expose the agreed native knowledge-base fields in create and edit using the existing request contracts
- [x] 2.2 Hide expert controls, keep graph platform-owned, and remove any UI promise or call to the unimplemented whole-library rebuild route
- [x] 2.3 Reject Lite creation when both visible strategies are disabled
- [x] 2.4 Restore the native asynchronous content-copy action and consume its existing progress contract without adding another copy mechanism

## 3. Agent Experience

- [x] 3.1 Mechanically translate the reference agent list/cards and lifecycle controls into the active Vue/TDesign surface
- [x] 3.2 Reduce the native agent editor to basic information, model, one system prompt, knowledge scope, and smart-only MCP selection
- [x] 3.3 Add the reference-style native agent selector to the chat composer

## 4. MCP Settings

- [x] 4.1 Mechanically translate the reference MCP service list and complete editor into the existing native MCP settings surface
- [x] 4.2 Restore the MCP Settings navigation and keep native tenant-admin mutation controls, credentials, OAuth, testing, and approvals

## 5. Lite Policy

- [x] 5.1 Narrow the Lite backend gate for the required existing agent, MCP, OAuth, approval, attachment, and chat payload paths
- [x] 5.2 Restore the matching frontend route, menu, settings, and Lite chat-state visibility without bypassing route-level permissions
- [x] 5.3 Reject every FAQ route in Lite, hide historical FAQ cards/manager, audit retained rows at startup, and preserve Standard behavior
- [x] 5.4 Force web search on at the Lite router and runtime seams while hiding its toggle and preserving Standard request behavior

## 6. Verification

- [x] 6.1 Run focused frontend and backend tests, frontend type-check/build, and formatting checks
- [x] 6.2 Perform one consolidated adversarial review and fix current blockers only
- [x] 6.3 Start the local stack and browser-test knowledge create/edit, agent CRUD/cards/chat selection, and MCP settings flows

## 7. Native-Restoration and Pixel-Parity Correction

- [x] 7.1 Diff every affected production component against the clean WeKnora 0.7.2 tree and restore native state, handlers, persistence, validation, authorization, and execution paths before styling
- [x] 7.2 Mechanically translate the reference combined chat capsule and agent list/editor presentation while delegating to native Agent, Model, and reasoning controls
- [x] 7.3 Mechanically translate the reference MCP list and full drawer while preserving native CRUD, credentials, OAuth, testing, and permissions
- [x] 7.4 Mechanically translate the reference knowledge create/edit dialog and card overflow edit entry while preserving native create/update behavior
- [x] 7.5 Add and run light/dark visual contracts for all affected surfaces, including loading, empty, error, selected, disabled, hover, and focus states
- [x] 7.6 Run full frontend tests, type-check, i18n check, production build, relevant backend tests, OpenSpec validation, and diff checks
- [x] 7.7 Browser-test all flows in light and dark mode at fixed viewports and compare screenshots to the reference before one consolidated corrective review

## 8. Authoritative Source Pixel-Parity Correction

- [x] 8.1 Replace stale visual contracts with failing source contracts derived from `musnow-ai-workspace (7).zip`, including shared modal geometry, semantic light/dark surfaces, segmented controls, agent search/create controls, and primary-button icon rules
- [x] 8.2 Mechanically align the agent directory header, search field, create action, and shared card-adjacent presentation in both themes without changing native behavior
- [x] 8.3 Mechanically align the agent editor shell, navigation, headers, basic-information layout, rows, controls, dropdowns, and footer to the authoritative source while preserving native save and permission contracts
- [x] 8.4 Mechanically align the lower-left account settings shell, user-information page, usage page, and shared primitives to the same authoritative geometry and light/dark tokens
- [x] 8.5 Run focused contracts, full frontend tests, type-check, i18n audit, production build, and fixed-viewport browser acceptance in both themes
- [x] 8.6 Perform one bounded adversarial review of the completed correction and fix current blockers only
