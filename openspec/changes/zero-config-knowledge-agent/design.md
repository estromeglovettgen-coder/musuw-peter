## Context

WeKnora already owns the required mechanisms: `builtin_models.yaml` is seeded
at startup, `builtin_agents.yaml` defines built-in agents, and
`CreateKnowledgeBase` applies a complete document-knowledge-base default.  The
production incident came from a UI-only release that exposed two new IDs while
the running application had never seeded those models.  The current standard
knowledge-base list still treats an old or incomplete row as a reason to send
the user to a configuration editor.

The change must reuse those mechanisms.  It must not introduce a second agent
registry, a database-backed capability profile, a new permission model, or a
new provider abstraction.

## Goals / Non-Goals

**Goals:**

- A name-only document knowledge-base creation either persists the existing
  complete default or fails before persistence because a required built-in
  model is unavailable.
- The standard chat surface always uses the existing smart-reasoning built-in
  agent with its complete in-tenant RAG, Wiki, graph, and document tool set.
- The consumer chooses only a server-approved model and that model's supported
  reasoning effort. The selected model is applied request-scoped to the fixed
  full-capability agent and title generation.
- Standard user navigation does not reveal model, parser, storage, graph, or
  other knowledge-base configuration screens.
- This change is deployed as a complete app release with its builtin YAML,
  never as an isolated frontend change.

**Non-Goals:**

- Provisioning a provider account, testing third-party providers from a user
  create request, or pretending an unconfigured connector is available.
- Changing tenant/resource authorization, exposing secrets, or allowing
  cross-tenant tool access.
- Adding a new migration or silent repair subsystem.  The existing full-release
  migration `000082_platform_knowledge_base_defaults` already converges live
  document knowledge bases to these same defaults; intentional preset test
  data can be deliberately removed during acceptance testing.
- Replacing WeKnora's built-in agents with a new agent framework.

## Decisions

### Reuse the existing built-in YAML and service defaults

The knowledge-base create service remains the single writer of the default
model IDs and indexing configuration.  It will verify the same existing
model-service records after defaults are applied and before it calls the
repository.  A missing/inactive record returns the existing service-unavailable
form of error, so no row exists to look initialized while upload later fails.

The server, rather than the browser, retains ownership of the default fields.
The existing client already sends only a name in create mode; create-request
configuration is not made into a new public standard-user contract.

Alternative considered: add a provisioning state table and asynchronous model
health worker.  It adds a new state machine without fixing the catalog-release
mismatch, so it is rejected.

### Reuse the existing full-capability built-in agent

`builtin-smart-reasoning` already owns the complete consumer RAG and tool
pipeline. Musuw Lite fixes every normal web conversation to that agent and
removes the answer-mode selector; `builtin-quick-answer` remains an upstream
compatibility asset but is not a consumer choice.

The existing session resolver remains authoritative for the pipeline. It
validates the requested model against the server catalog, then applies that
model and reasoning effort to a request-scoped copy of the full-capability
agent and to title generation. Persisted built-in agent configuration is not
mutated, custom agents in Standard WeKnora keep their own model, and Lite
cannot use hidden Skill or shared-agent overrides. Later native-agent exposure
permits tenant-local Agent/MCP selection and makes web search a mandatory
server-owned Lite capability.

Alternative considered: create a persistent custom agent per tenant.  That
duplicates the built-in registry and creates lifecycle/migration work, so it
is rejected.

### Remove configuration entrances rather than recreate a simplified editor

The existing name-only create modal is retained.  The list no longer renders
the uninitialized-model banner, routes a card to configuration, or renders the
knowledge-base Settings action.  The normal detail page stays the entry for
file upload and content operations.  Existing administration APIs and editor
components are not deleted in this change; they simply cease to be reachable
from the standard flow.

Alternative considered: build a parallel user-only knowledge-base editor.
That would duplicate a mature component and is rejected.

### Release the catalog and UI together

The backend image copies the builtin YAML and reconciles it at startup.  This
change therefore requires the existing full release path, followed by an
operator check that the two chat models and processing models are present.
The UI-only updater gets a lightweight source contract check so it refuses a
frontend that names a managed model absent from the release source's builtin
catalog.  It is a guardrail, not a new deployment system.

## Risks / Trade-offs

- [A provider credential is invalid despite an active model row] → creation
  can validate catalog availability but cannot safely make paid external calls
  merely to prove provider health; an upload surfaces the provider failure
  honestly and operations fix the existing secret.
- [Legacy incomplete knowledge bases remain] → do not send users to hidden
  configuration; acceptance removes the intentional preconfigured test data.
- [All product tools includes destructive Wiki actions] → use the existing
  scope authorization; Pro may act only on resources the caller can already
  operate.
- [Frontend-only rollout] → ship this change only through the full release
  and validate catalog rows afterward.

## Migration Plan

1. Update existing YAML/defaults/UI entrances and focused tests locally.
2. Build and deploy the full application image after production capacity is
   restored to the previously established 12 GiB release reserve.
3. Let the existing `000082_platform_knowledge_base_defaults` migration
   converge live document knowledge bases, then verify builtin model rows and
   both builtin agents.
4. Create a fresh
   knowledge base, upload representative files, and exercise Flash and Pro.
5. If verification fails, roll back to the previous full release; no schema or
   user-data migration is involved.

## Open Questions

None.
