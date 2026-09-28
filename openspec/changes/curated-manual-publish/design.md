## Design

The manual API stores a human-written `curated_summary` and `skip_auto_enrichment` in existing knowledge metadata. The summary is also the document description. The flag is scoped to that manual document and defaults off. When the native manual worker finishes chunk/index persistence, its postprocess stage sees the flag and completes without spawning model-driven enrichment or automatic Wiki ingest. Reparse keeps the description and leaves manually published Wiki pages alone.

The importer first checks `GET /api/v1/system/capabilities` for `curated_manual_publish_v1=true`; older servers silently ignore unknown JSON fields and would otherwise start model work. It publishes one existing draft by ID, waits for completed/enabled plus nonempty chunks and a search hit, and checks the existing Wiki page ID, source references and public content. Only then does it continue in bounded batches. The original review files and hashes remain private audit evidence; user-visible Markdown contains the creator's ideas, examples, timestamps and source link.

## Rollback

The backend fields are optional and old documents keep previous behavior. On a failed canary, stop the importer and leave remaining drafts unchanged. A failed release uses the existing immutable image rollback. Public content updates retain stable document and Wiki IDs.
