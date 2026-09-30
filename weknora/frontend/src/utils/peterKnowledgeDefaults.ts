import { selectInitialModelId, type ModelDefaultCandidate } from './modelDefaults'

/** Peter's hidden processing profile for newly created document resources. */
export function createPeterProcessingDefaults(customer: boolean) {
  const example = customer
    ? {
        text: '客户 Alex 向 Peter 咨询表达课程。Peter 负责跟进 Alex，并记录他的沟通目标。',
        tags: ['咨询', '负责跟进', '关注', '参与', '提出', '解决'],
        nodes: [
          { name: 'Alex', attributes: ['咨询表达课程的客户'] },
          { name: 'Peter', attributes: ['负责跟进的顾问'] },
          { name: '表达课程', attributes: ['Alex 咨询的课程'] },
        ],
        relations: [
          { node1: 'Alex', node2: '表达课程', type: '咨询' },
          { node1: 'Peter', node2: 'Alex', type: '负责跟进' },
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
    indexingStrategy: { graphEnabled: true },
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
