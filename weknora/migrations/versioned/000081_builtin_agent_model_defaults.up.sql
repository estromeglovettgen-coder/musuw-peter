-- Reconcile existing tenant-local copies of built-in agents with the
-- platform-managed model catalog. New tenants read the same defaults from
-- config/builtin_agents.yaml; this update only closes the legacy-row gap.

UPDATE custom_agents
SET config = config || jsonb_build_object(
        'model_id', 'builtin-deepseek-v4-pro',
        'rerank_model_id', 'builtin-openrouter-rerank',
        'query_understand_model_id', 'builtin-deepseek-v4-pro',
        'vlm_model_id', 'builtin-openrouter-vlm',
        'asr_model_id', 'builtin-openrouter-asr',
        'thinking', true
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
