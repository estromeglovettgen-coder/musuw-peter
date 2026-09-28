-- Reconcile existing tenant-local copies of built-in agents with the
-- platform's V4 Flash default.  New rows read the same values from
-- config/builtin_agents.yaml; this closes the gap for databases that already
-- applied the earlier model-default migration.

UPDATE custom_agents
SET config = config || jsonb_build_object(
        'model_id', 'builtin-deepseek-v4-flash',
        'query_understand_model_id', 'builtin-deepseek-v4-flash'
    ),
    updated_at = CURRENT_TIMESTAMP
WHERE is_builtin = true
  AND deleted_at IS NULL
  AND id IN (
      'builtin-quick-answer',
      'builtin-smart-reasoning',
      'builtin-data-analyst',
      'builtin-wiki-researcher',
      'builtin-wiki-fixer'
  );
