## Why

Creator video notes were saved as manual drafts to avoid automatic model analysis. Drafts cannot be retrieved through ordinary document search, and their internal review notes were copied into visible Wiki pages. A creator knowledge base must publish the reviewed public text without replacing its human-authored summary or Wiki.

## What Changes

- Add optional curated-summary and skip-auto-enrichment fields to the existing manual knowledge create/update API.
- Keep the native manual chunking and index pipeline, but skip automatic summary, question, graph, tag and Wiki tasks for explicitly curated manual documents.
- Preserve curated metadata through ordinary edits and reparse, and advertise the capability so the production importer refuses to publish against an older server.
- Replace the affected public manual/Wiki content with a reviewed public projection while retaining private source evidence separately.

## Impact

The existing manual knowledge endpoint and JSON metadata gain optional fields; old requests keep their behavior. No schema migration or new ingestion service is required. Vector and keyword indexing still use the configured embedding model; video understanding and postprocessing LLMs are not used for curated documents.
