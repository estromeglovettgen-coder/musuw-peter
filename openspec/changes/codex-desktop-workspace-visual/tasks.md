## 1. Visual contract and isolation

- [x] 1.1 Replace the previous global presentation-token contract with one
  Codex-inspired system token layer that does not override TDesign tokens at
  `:root`.
- [x] 1.2 Add an explicit visual isolation state for the Wiki graph tab and a
  graph-specific class for its teleported search popup.
- [x] 1.3 Update the visual contract test to reject global graph-affecting
  selectors and verify the single token/import authority.

## 2. Workspace presentation

- [x] 2.1 Implement system typography, neutral light/dark color tokens, and
  compact control geometry for normal workspace containers.
- [x] 2.2 Restyle the Musuw sidebar as a compact Codex-inspired navigation
  tree while preserving all existing navigation, session, and account actions.
- [x] 2.3 Restyle chat, new chat, composer, citations, reference panels,
  knowledge-base list/detail, documents, and known non-graph teleported
  dialogs, drawers, and menus.
- [x] 2.4 Verify the existing Inter/Noto Sans SC/JetBrains Mono imports and
  preserve explicit user font preferences without adding another font stack.
- [x] 2.5 Move the existing knowledge-base create action into the final grid
  slot, remove only the requested decorative card metadata, and preserve all
  handlers, permissions, grouping data, uploads, and knowledge logic.
- [x] 2.6 Render chat reasoning with one aligned progress rail and preserve all
  existing reasoning, tool, citation, collapse, retry, and stop states.
- [x] 2.7 Use saved locale first, then the storefront country signal, browser
  language, and English fallback for product/auth first render without
  changing authentication behavior.

## 3. Verification and release

- [x] 3.1 Run focused visual and managed-experience regression tests, type
  checking, and production build.
- [x] 3.2 Run fixed-viewport visual verification for default light/dark
  workspace surfaces when browser automation is available, including a graph
  isolation check.
- [x] 3.3 Complete a bounded adversarial review of the final visual delta and
  verify the frontend-only release candidate locally. Remote CI/deployment is
  deferred at the user's request while the GitHub Actions allowance is exhausted.
