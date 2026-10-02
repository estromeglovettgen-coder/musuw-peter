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

export const CUSTOMER_EXTRACTION = '重点识别这位客户及关联人物、重要经历、需求、顾虑、购买动机和课程疑问。同一客户的不同称呼应结合原文谨慎归并。保留资料依据，不能把销售人员或 AI 的建议当成客户事实。'
export const CUSTOMER_CONTENT = '围绕当前客户整理内容：背景与现状、需求与痛点、顾虑与疑问、沟通进展、待确认事项。客户人物条目应持续汇总相关来源。区分原文事实与分析推断，重要判断保留引用，信息不足时写明待确认。按真实沟通时间呈现变化，不编造姓名、预算或购买意愿。'
export const emptyCustomerProfile = (): CustomerProfile => ({ status: '', tags: [], contact: '', note: '', shared_knowledge_base_ids: [], wiki_slug: '' })

/** Apply only the requested labels, including labels stored in the old status field. */
export function changedCustomerTags(profile: CustomerProfile, mode: 'add' | 'remove', labels: string[]): string[] {
  const changes = new Set(labels.map(label => label.trim()).filter(Boolean))
  const existing = [...new Set([profile.status, ...(profile.tags || [])].map(label => label?.trim()).filter((label): label is string => !!label))]
  const tags = mode === 'add' ? [...new Set([...existing, ...changes])] : existing.filter(label => !changes.has(label))
  if (tags.length > 30 || tags.some(label => new TextEncoder().encode(label).length > 100)) {
    throw new Error('客户标签最多 30 个，单个标签请缩短')
  }
  return tags
}

export async function changeCustomerTags(id: string, mode: 'add' | 'remove', labels: string[]) {
  const response: any = await getKnowledgeBaseById(id)
  const customer = response.data
  if (!customer?.customer_profile) throw new Error('未找到客户项目')
  if (!customer.chunking_config || !customer.image_processing_config) throw new Error('客户处理配置未能完整读取，请刷新后重试')
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
  if (result?.success === false) throw new Error(result.message || '客户标签保存失败')
  return result
}

export async function deleteCustomer(id: string) {
  const response: any = await getKnowledgeBaseById(id)
  if (!response.data?.customer_profile) throw new Error('未找到客户项目')
  const result: any = await deleteKnowledgeBase(id)
  if (result?.success === false) throw new Error(result.message || '删除客户失败')
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
  if (!response.success || !response.data) throw new Error('客户设置加载失败')
  return { ...response.data, templates: response.data.templates || [] }
}
export async function saveCustomerConfig(config: CustomerConfig): Promise<CustomerConfig> {
  const response: any = await put('/api/v1/tenants/kv/customer-config', config)
  if (!response.success || !response.data) throw new Error('客户设置保存失败')
  return { ...response.data, templates: response.data.templates || [] }
}

export async function customerSessions(id: string, page = 1) {
  return get(`/api/v1/sessions?customer_knowledge_base_id=${encodeURIComponent(id)}&page=${page}&page_size=50`)
}

export async function newCustomerSession(id: string, name: string) {
  const response: any = await createSessions({ title: `${name} · 客户分析`, customer_knowledge_base_id: id })
  if (!response.data?.id) throw new Error('创建客户会话失败')
  return response.data
}

export async function mentionedCustomer(items: any[]): Promise<any | null> {
  const ids = [...new Set(items.filter(item => item.type === 'kb').map(item => item.id as string))]
  const customers: any[] = []
  for (const id of ids) {
    const response: any = await getKnowledgeBaseById(id)
    if (response.data?.customer_profile) customers.push(response.data)
  }
  if (customers.length > 1) throw new Error('一次会话只能选择一位客户，请分别开启客户会话')
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
    progress(`正在保存客户资料 ${index+1}/${originals.length}：${file.name}`)
    try {
      const response = await uploadKnowledgeFile(id, {file})
      if (response?.success !== true) throw new Error('客户资料保存失败')
      const saved = archivedFiles.get(file) || new Set<string>()
      saved.add(id)
      archivedFiles.set(file, saved)
    }
    catch { failures.push(file.name) }
  }
  if (originals.length) progress(failures.length ? `未归档：${failures.join('、')}。请在客户资料页重新上传。` : `已将 ${originals.length} 份原始资料保存到客户库`)
}
