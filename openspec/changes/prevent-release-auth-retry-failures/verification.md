# Verification Report: prevent-release-auth-retry-failures

Verified locally through 2026-08-21. CI, push, and deployment remain deferred by explicit instruction.

- The browser's persisted Supabase session is issued by the Musuw Staging project, while the production runtime points at the distinct Musuw Production issuer.
- The active Supabase identity and WeKnora business token carry the same normalized email. Their UUIDs intentionally differ: the retained WeKnora OIDC contract looks up or provisions the local user by email and issues its own local user ID; no cross-environment UUID equality is expected.
- Both Supabase projects have healthy Auth databases, no orphan identity rows, and no public application tables. The local WeKnora database has matching Staging account email hashes and valid tenant memberships.
- A host-memory interruption had stopped only the authentication Vite process on port 4191. The workspace on 4190 and backend on 18090 remained healthy, explaining why an existing session continued while a new login could fail. After restoring the same auth process and Staging public configuration, direct and same-origin auth-shell probes returned HTTP 200.
- Fresh in-app-browser acceptance opened `http://localhost:4190/auth/start`, reused the valid native session, and returned to the local knowledge-base route without visiting the production domain or `/auth/error`.
