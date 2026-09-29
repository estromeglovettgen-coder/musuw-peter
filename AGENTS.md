# Musuw Peter workspace

- Read README.md. This repository is Peter's private customization, based on the attributed Musuw source import recorded in third_party/weknora/v0.7.2-provenance.json.
- `weknora/` remains the application authority. Reuse native agent and model APIs/components instead of creating a parallel configuration engine.
- Run `npm run dev` for the isolated local workspace. Ports: frontend 4217, backend 18187. Persistent local data, keys and logs live in ignored `.runtime/peter/`.
- Current scope: full applicable agent editing and browser model configuration, with the limited Peter navigation. Billing, marketplace and unrelated platform administration stay hidden. Preserve native authorization checks.
- Server delivery is now authorized on `62.234.188.55` only. The user explicitly authorized deleting its old business contents without backup. Keep the OS, SSH and cloud management agents. Do not use inherited Musuw production scripts or credentials. `auth/` and `storefront/` are historical imports, not Peter's login or landing page.
- Never commit provider keys, local accounts, databases or `.runtime/`. Preserve source licenses and provenance.
- Tests: frontend in `weknora/frontend`, Go in `weknora`. `npm run peter:acceptance` uses the local fixture and ignored preview account. Server acceptance is explicitly authorized to use the existing DeepSeek test key for bounded real end-to-end calls. Routine unit tests remain offline.
- Current server delivery scope and evidence: `openspec/changes/deploy-peter-skills-server/`. Expose native skills, sandbox and personal skill credentials while preserving authorization, customer separation and the hidden billing/marketplace policy.
- Durable scope and acceptance evidence: `openspec/changes/expand-peter-agent-diy/` and `docs/PETER_LOCAL_ACCEPTANCE.md`.
- Customer workspace first-version scope: `openspec/changes/add-peter-customer-workspace/` and `docs/PETER_CUSTOMER_PREVIEW.md`. One customer is one document KB; native sessions bind immutably to a customer. The user is performing functional acceptance for this preview.
