## Context

WeKnora v0.7.2 already implements model CRUD for chat, embedding, rerank, vision, and ASR models, plus a model debugger and a conversation model picker. Musuw retains that code for platform operations, but its consumer edition must expose only the picker over a server-owned catalog.

## Goals / Non-Goals

**Goals:**

- Restore the native conversation picker in the current Musuw visual shell.
- Preserve the native model services for SystemAdmin operations without exposing configuration to consumers.
- Ship only OpenRouter models proven callable from the production region.
- Preserve the full-capability built-in agent and knowledge-base bindings while exposing only model and reasoning-effort choices.

**Non-Goals:**

- Consumer BYOK, tenant-created models, a provider marketplace, dynamic catalog sync, per-model routing service, or fallback graph.
- Migrating existing knowledge-base vector dimensions.
- Exposing unrelated platform administration sections.

## Decisions

- Musuw Lite exposes only General settings. The existing `ModelSettings` code remains available to Standard WeKnora builds; Lite deep links and mutation/provider/debug/credential APIs fail closed.
- Use WeKnora's existing model list/detail and conversation picker. The service filters consumers to active built-in OpenRouter rows and then applies the plan matrix; the browser can only choose from that response and remembers the last still-valid choice.
- Keep WeKnora's existing create/update/default logic behind SystemAdmin for platform catalog maintenance. No new table, preference entity, or catalog service is needed.
- Keep stable IDs for the two managed DeepSeek modes, but call their OpenRouter model slugs. Add only four other chat models that returned HTTP 200 from the production region; omit providers blocked there.
- Keep the existing embedding, rerank, VLM, and ASR IDs and dimensions. The real upload pipeline already proved the embedding binding, so changing it would invalidate existing vectors for no product benefit.
- For the consumer full-capability agent, apply the request's already-authorized selected chat model to the request-scoped built-in agent and title generator. Custom/Standard agents keep their own configured model. This preserves WeKnora's execution pipeline without allowing a hidden YAML default to bypass the plan catalog.

## Risks / Trade-offs

- **A remembered model is no longer in the plan catalog** → resolve to the server-returned fallback before sending and overwrite the stale browser preference.
- **A historical conversation references another model** → the server rejects disallowed runtime use; the picker falls back only to an allowed platform ID.
- **A provider is region-blocked later** → SystemAdmin retains the native debugger/API; no speculative consumer fallback layer is added.

## Migration Plan

No schema migration is required. On release, the existing built-in model reconciler updates the YAML-managed rows. Existing knowledge bases are converged to the stable platform capability IDs so legacy custom rows cannot remain runtime dependencies.

## Open Questions

None.
