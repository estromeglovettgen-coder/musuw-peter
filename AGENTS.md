# Musuw Peter workspace

- Read README.md. This repository is Peter's private customization, based on the attributed Musuw source import recorded in third_party/weknora/v0.7.2-provenance.json.
- `weknora/` remains the application authority. Reuse native agent and model APIs/components instead of creating a parallel configuration engine.
- Run `npm run dev` for the isolated local workspace. Ports: frontend 4217, backend 18187. Persistent local data, keys and logs live in ignored `.runtime/peter/`.
- Current scope: full applicable agent editing and browser model configuration, with the limited Peter navigation. Billing, marketplace and unrelated platform administration stay hidden. Preserve native authorization checks.
- No server deployment is part of this phase. Do not use inherited Musuw production scripts or credentials. `auth/` and `storefront/` are historical imported sources, not Peter's local login or landing page.
- Never commit provider keys, local accounts, databases or `.runtime/`. Preserve source licenses and provenance.
- Tests: frontend in `weknora/frontend`, Go in `weknora`. `npm run peter:acceptance` uses the separately started local fixture and ignored preview account. Do not spend live provider quota in automated tests.
- Durable scope and acceptance evidence: `openspec/changes/expand-peter-agent-diy/` and `docs/PETER_LOCAL_ACCEPTANCE.md`.
