import { get, put } from '@/utils/request'
import { deleteKnowledgeBase, getKnowledgeBaseById, updateKnowledgeBase, uploadKnowledgeFile } from './knowledge-base'
import type { createKnowledgeBase } from './knowledge-base'
import { createSessions } from './chat'

export interface CustomerProfile {
  status: string
  tags: string[]
  contact: string
  note: string
  shared_knowledge_base_ids: string[]
  wiki_slug: string
}

export const CUSTOMER_EXTRACTION = '围绕当前目标及其社交互动，识别有原文依据的人物、关系、具体经历、情绪表达、关注点、沟通方式、意愿和明确边界。保留说话人、上下文与互动先后；同一人物的不同称呼谨慎归并。只将表达或行为记录为事实，心理与动机推测不得作为已确认属性。不能把用户的期待、课程观点或 AI 建议当成对方事实，不从泛称或孤立词语硬建实体。'
export const CUSTOMER_CONTENT = '围绕当前目标整理人物背景、双方关系与互动阶段、重要经历、表达出的情绪与需求、沟通变化、意愿与边界。人物页持续汇总来源，结合真实互动时间更新现状，已被后续资料取代的判断保留为历史。心理和意图只能作为有依据、待验证的可能解释，不能写成读心结论或心理诊断。重要判断保留原文引用，区分对方原话、用户备注、课程方法和分析推断；信息不足明确待确认，不编造好感、关系承诺或经历。依据实际内容建立有独立检索价值的实体与概念，同义知识增量融合，不为每句话硬拆页面，不用重复段落凑内容。'
export const emptyCustomerProfile = (): CustomerProfile => ({ status: '', tags: [], contact: '', note: '', shared_knowledge_base_ids: [], wiki_slug: '' })

/** Apply only the requested labels, including labels stored in the old status field. */
export function changedCustomerTags(profile: CustomerProfile, mode: 'add' | 'remove', labels: string[]): string[] {
  const changes = new Set(labels.map(label => label.trim()).filter(Boolean))
  const existing = [...new Set([profile.status, ...(profile.tags || [])].map(label => label?.trim()).filter((label): label is string => !!label))]
  const tags = mode === 'add' ? [...new Set([...existing, ...changes])] : existing.filter(label => !changes.has(label))
  if (tags.length > 30 || tags.some(label => new TextEncoder().encode(label).length > 100)) {
    throw new Error('目标标签最多 30 个，单个标签请缩短')
  }
  return tags
}

export async function changeCustomerTags(id: string, mode: 'add' | 'remove', labels: string[]) {
  const response: any = await getKnowledgeBaseById(id)
  const customer = response.data
  if (!customer?.customer_profile) throw new Error('未找到目标项目')
  if (!customer.chunking_config || !customer.image_processing_config) throw new Error('目标处理配置未能完整读取，请刷新后重试')
  const profile = { ...emptyCustomerProfile(), ...customer.customer_profile }
  // Read the latest profile before changing labels; never replace notes or contacts with the list snapshot.
  const result: any = await updateKnowledgeBase(id, {
    name: customer.name,
    description: customer.description || '',
    config: {
      // The native update contract replaces these two value structs even when omitted.
      chunking_config: customer.chunking_config,
      image_processing_config: customer.image_processing_config,
      customer_profile: { ...profile, status: '', tags: changedCustomerTags(profile, mode, labels) },
    },
  })
  if (result?.success === false) throw new Error(result.message || '目标标签保存失败')
  return result
}

export async function deleteCustomer(id: string) {
  const response: any = await getKnowledgeBaseById(id)
  if (!response.data?.customer_profile) throw new Error('未找到目标项目')
  const result: any = await deleteKnowledgeBase(id)
  if (result?.success === false) throw new Error(result.message || '删除目标失败')
  return result
}

// Keep the saved snapshot on the native create contract, not editor-only state.
const templateSettingKeys = [
  'chunking_config', 'embedding_model_id', 'summary_model_id', 'vector_store_id',
  'storage_backend_id', 'storage_provider_config', 'vlm_config', 'asr_config',
  'extract_config', 'question_generation_config', 'auto_tag_config', 'wiki_config', 'indexing_strategy',
] as const
export type CustomerTemplateConfig = Pick<Parameters<typeof createKnowledgeBase>[0], typeof templateSettingKeys[number]> & {
  customer_profile: Pick<CustomerProfile, 'status' | 'tags' | 'note' | 'shared_knowledge_base_ids'>
}
export interface CustomerTemplate { id: string; name: string; description: string; config: CustomerTemplateConfig }
export interface CustomerConfig { statuses: string[]; tags: string[]; templates: CustomerTemplate[] }

export function customerTemplateConfig(data: Parameters<typeof createKnowledgeBase>[0]): CustomerTemplateConfig {
  const profile = data.customer_profile || emptyCustomerProfile()
  return JSON.parse(JSON.stringify({
    ...Object.fromEntries(templateSettingKeys.map(key => [key, data[key]])),
    customer_profile: { status: profile.status, tags: profile.tags, note: profile.note, shared_knowledge_base_ids: profile.shared_knowledge_base_ids },
  }))
}
export interface CustomerUploadItem {
  file: File
  status: 'pending' | 'uploading' | 'success' | 'error'
  progress: number
  error?: string
}
export async function getCustomerConfig(): Promise<CustomerConfig> {
  const response: any = await get('/api/v1/tenants/kv/customer-config')
  if (!response.success || !response.data) throw new Error('目标设置加载失败')
  return { ...response.data, templates: response.data.templates || [] }
}
export async function saveCustomerConfig(config: CustomerConfig): Promise<CustomerConfig> {
  const response: any = await put('/api/v1/tenants/kv/customer-config', config)
  if (!response.success || !response.data) throw new Error('目标设置保存失败')
  return { ...response.data, templates: response.data.templates || [] }
}

export async function customerSessions(id: string, page = 1) {
  return get(`/api/v1/sessions?customer_knowledge_base_id=${encodeURIComponent(id)}&page=${page}&page_size=50`)
}

export async function newCustomerSession(id: string, name: string) {
  const response: any = await createSessions({ title: `${name} · 目标分析`, customer_knowledge_base_id: id })
  if (!response.data?.id) throw new Error('创建目标会话失败')
  return response.data
}

export async function mentionedCustomer(items: any[]): Promise<any | null> {
  const ids = [...new Set(items.filter(item => item.type === 'kb').map(item => item.id as string))]
  const customers: any[] = []
  for (const id of ids) {
    const response: any = await getKnowledgeBaseById(id)
    if (response.data?.customer_profile) customers.push(response.data)
  }
  if (customers.length > 1) throw new Error('一次会话只能选择一个目标，请分别开启目标会话')
  return customers[0] || null
}

// Reuse original File objects for durable archival, rather than the temporary
// attachment's question-specific caption. A retry in the same composer skips
// files already saved successfully to this customer.
const archivedFiles = new WeakMap<File, Set<string>>()
export async function archiveCustomerFiles(id: string, images: File[], attachments: any[], progress: (message: string) => void) {
  const originals = [...images, ...attachments.map(item => item.file)].filter((file): file is File => file instanceof File)
  const failures: string[] = []
  for (let index=0; index<originals.length; index++) {
    const file = originals[index]
    if (archivedFiles.get(file)?.has(id)) continue
    progress(`正在保存目标资料 ${index+1}/${originals.length}：${file.name}`)
    try {
      const response = await uploadKnowledgeFile(id, {file})
      if (response?.success !== true) throw new Error('目标资料保存失败')
      const saved = archivedFiles.get(file) || new Set<string>()
      saved.add(id)
      archivedFiles.set(file, saved)
    }
    catch { failures.push(file.name) }
  }
  if (originals.length) progress(failures.length ? `未归档：${failures.join('、')}。请在目标资料页重新上传。` : `已将 ${originals.length} 份原始资料保存到目标库`)
}
