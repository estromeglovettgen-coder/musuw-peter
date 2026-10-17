import { selectInitialModelId, type ModelDefaultCandidate } from './modelDefaults'

/** Peter's hidden processing profile for newly created document resources. */
export function createPeterProcessingDefaults(customer: boolean) {
  const example = customer
    ? {
        text: '小林和阿远在朋友聚会上认识。小林说这周工作忙，约好周六一起去看展。',
        tags: ['认识于', '约定', '表达', '参与', '关注', '提到'],
        nodes: [
          { name: '小林', attributes: ['表示这周工作忙', '约好周六看展'] },
          { name: '阿远', attributes: ['在朋友聚会上与小林认识'] },
          { name: '朋友聚会', attributes: ['小林和阿远相识的场合'] },
          { name: '周六看展', attributes: ['双方约定的活动，尚未确认发生'] },
        ],
        relations: [
          { node1: '小林', node2: '朋友聚会', type: '认识于' },
          { node1: '阿远', node2: '朋友聚会', type: '认识于' },
          { node1: '小林', node2: '周六看展', type: '约定' },
          { node1: '阿远', node2: '周六看展', type: '约定' },
        ],
      }
    : {
        text: '林然负责星河项目，星河项目使用蓝图工具整理资料。',
        tags: ['负责', '使用', '属于', '包含', '相关', '提出', '影响'],
        nodes: [
          { name: '林然', attributes: ['星河项目负责人'] },
          { name: '星河项目', attributes: ['使用蓝图工具整理资料的项目'] },
          { name: '蓝图工具', attributes: ['星河项目使用的工具'] },
        ],
        relations: [
          { node1: '林然', node2: '星河项目', type: '负责' },
          { node1: '星河项目', node2: '蓝图工具', type: '使用' },
        ],
      }
  return {
    multimodalConfig: { enabled: true, vllmModelId: '', descriptionLanguage: '', customInstructions: '' },
    asrConfig: { enabled: true, modelId: '', language: '' },
    indexingStrategy: { vectorEnabled: true, keywordEnabled: true, wikiEnabled: true, graphEnabled: true },
    wikiConfig: { extractionGranularity: 'standard' as const },
    nodeExtractConfig: { enabled: true, ...example, customInstructions: '' },
  }
}

export function selectPeterMediaModelIds(
  models: readonly ModelDefaultCandidate[],
  preferredVisionModelId = '',
  preferredAsrModelId = '',
) {
  return {
    visionModelId: selectInitialModelId(models, 'VLLM', preferredVisionModelId) || '',
    asrModelId: selectInitialModelId(models, 'ASR', preferredAsrModelId) || '',
  }
}

/** Keep a customer's own extraction schema when applying a saved template. */
export function withPeterGraphExtractionDefaults(config: Record<string, any> | undefined, customer: boolean) {
  const fallback = createPeterProcessingDefaults(customer).nodeExtractConfig
  return {
    ...fallback,
    ...config,
    enabled: true,
    text: config?.text || fallback.text,
    tags: config?.tags?.length ? config.tags : fallback.tags,
    nodes: config?.nodes?.length ? config.nodes : fallback.nodes,
    relations: config?.relations?.length ? config.relations : fallback.relations,
  }
}
