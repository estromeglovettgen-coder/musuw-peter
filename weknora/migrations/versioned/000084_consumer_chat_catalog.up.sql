-- The consumer catalog retired the old Qwen Flash entry in favour of the
-- platform's single free/default DeepSeek Flash model. Keep existing
-- knowledge bases on that same live catalog entry instead of retaining a
-- hidden reference to a soft-deleted model.

UPDATE knowledge_bases
SET summary_model_id = 'builtin-deepseek-v4-flash',
    wiki_config = jsonb_set(
        COALESCE(wiki_config, '{}'::jsonb),
        '{synthesis_model_id}',
        '"builtin-deepseek-v4-flash"'::jsonb,
        true
    ),
    updated_at = CURRENT_TIMESTAMP
WHERE deleted_at IS NULL
  AND type = 'document'
  AND (
      summary_model_id IN (
          'builtin-openrouter-qwen-flash',
          'builtin-openrouter-glm',
          'builtin-openrouter-kimi',
          'builtin-openrouter-mistral'
      )
      OR wiki_config->>'synthesis_model_id' IN (
          'builtin-openrouter-qwen-flash',
          'builtin-openrouter-glm',
          'builtin-openrouter-kimi',
          'builtin-openrouter-mistral'
      )
  );

UPDATE sessions
SET agent_config = jsonb_set(
        COALESCE(agent_config, '{}'::jsonb),
        '{model_id}',
        '"builtin-deepseek-v4-flash"'::jsonb,
        true
    ),
    updated_at = CURRENT_TIMESTAMP
WHERE deleted_at IS NULL
  AND agent_config->>'model_id' IN (
      'builtin-openrouter-qwen-flash',
      'builtin-openrouter-glm',
      'builtin-openrouter-kimi',
      'builtin-openrouter-mistral'
  );
