## Why

The fixed WeKnora main kernel now contains a broad infrastructure and management surface that is inappropriate for Musuw's managed SaaS users. Musuw must retain the complete upstream implementation while exposing only stable, understandable product outcomes and enforcing the same boundary at the server.

## What Changes

- Make Musuw Lite the curated production surface and retain Standard as the internal full-main acceptance surface.
- **BREAKING** for Musuw Lite: every user-created knowledge base is a document knowledge base; FAQ creation, import, editing, listing, and invocation are unavailable.
- Replace the Lite knowledge-base editor with Musuw-styled Basic and Advanced sections; hide raw model, embedding, vector-store, parser, multimodal, audio, chunking, and storage infrastructure controls.
- Expose automatic tag association under Advanced settings with server-owned DeepSeek V4 Flash, a maximum of three existing tags, and preservation of manual tags.
- Use AnyDoc transparently as a managed parser while keeping parser selection out of the consumer interface.
- Expose workspace and personal long-term-memory settings through Musuw's existing settings shell: common controls stay direct and every model, vector, extraction, timing, and instruction field remains available under one Advanced disclosure.
- Retain low-cost document and chat improvements that do not depend on executable infrastructure.
- Disable Sandbox, Skills, environment variables, shell execution, sandbox files, and sandbox-generated artifacts throughout the Musuw Lite UI, deep links, chat requests, and server routes. Do not provision or configure a sandbox provider in the production surface.
- Disable XMind, GitLab, Tencent IMA, Metaso, Exa, new integration-management surfaces, and native password changes in Musuw Lite without deleting upstream Standard implementations.

## Capabilities

### New Capabilities

- `consumer-product-boundary`: Server-authoritative Musuw Lite exposure, role/deep-link behavior, and excluded executable/integration capabilities.
- `consumer-knowledge-experience`: Document-only knowledge bases, Musuw Basic/Advanced UI, automatic tags, transparent parsing, and document enhancements.
- `consumer-memory-chat-experience`: Managed long-term-memory settings and low-cost chat/agent increments without Sandbox, Skills, shell, or generated artifacts.

### Modified Capabilities

None. The repository has no promoted canonical OpenSpec specs; this change records the post-upgrade Musuw product contract as new capabilities.

## Impact

- Frontend: settings navigation and route normalization, knowledge-base editor, advanced settings, user profile, agent editor, chat resources, data-source/search catalogs, and consumer visual tests.
- Backend: Lite product gate, request normalization/rejection, capability response, knowledge-base defaults/validation, automatic-tag model policy, and route tests.
- Data: no destructive FAQ migration; deployment audits unexpected FAQ rows before any one-time treatment.
- Operations: Standard remains available for internal upstream acceptance; production Lite does not configure or provision Sandbox/Skill infrastructure.
