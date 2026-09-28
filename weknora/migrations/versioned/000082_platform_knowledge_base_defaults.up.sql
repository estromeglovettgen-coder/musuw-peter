-- Give every live document knowledge base the same server-owned consumer
-- profile as newly-created bases.  The consumer UI deliberately does not
-- expose model or pipeline switches, so legacy rows must not retain a hidden
-- partial configuration.
--
-- This is data-only and additive: it neither changes a KB's type nor touches
-- documents, chunks, wiki pages, graph data, or deleted KB rows.  The model
-- ids point at config/builtin_models.yaml; startup reconciles that catalog
-- after migrations and keeps provider credentials in backend-only secrets.

UPDATE knowledge_bases
SET
    embedding_model_id = 'builtin-openrouter-embedding',
    summary_model_id = 'builtin-deepseek-v4-pro',
    image_processing_config = jsonb_build_object(
        'model_id', 'builtin-openrouter-vlm'
    ),
    vlm_config = jsonb_build_object(
        'enabled', true,
        'model_id', 'builtin-openrouter-vlm'
    ),
    asr_config = jsonb_build_object(
        'enabled', true,
        'model_id', 'builtin-openrouter-asr'
    ),
    indexing_strategy = jsonb_build_object(
        'vector_enabled', true,
        'keyword_enabled', true,
        'wiki_enabled', true,
        'graph_enabled', true
    ),
    extract_config = jsonb_build_object(
        'enabled', true,
        'text', '"Romeo and Juliet" is a tragedy written by William Shakespeare and set in Verona.',
        'tags', jsonb_build_array('Author', 'Alias', 'Setting'),
        'nodes', jsonb_build_array(
            jsonb_build_object(
                'name', 'Romeo and Juliet',
                'attributes', jsonb_build_array('A tragedy')
            ),
            jsonb_build_object(
                'name', 'William Shakespeare',
                'attributes', jsonb_build_array('English playwright')
            ),
            jsonb_build_object(
                'name', 'Verona',
                'attributes', jsonb_build_array('City in Italy')
            )
        ),
        'relations', jsonb_build_array(
            jsonb_build_object(
                'node1', 'Romeo and Juliet',
                'node2', 'William Shakespeare',
                'type', 'Author'
            ),
            jsonb_build_object(
                'node1', 'Romeo and Juliet',
                'node2', 'Verona',
                'type', 'Setting'
            )
        )
    ),
    wiki_config = jsonb_build_object(
        'synthesis_model_id', 'builtin-deepseek-v4-pro',
        'extraction_granularity', 'standard'
    ),
    updated_at = CURRENT_TIMESTAMP
WHERE deleted_at IS NULL
  AND type = 'document';
