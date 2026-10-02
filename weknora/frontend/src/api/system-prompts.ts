import { get, put } from '@/utils/request'

export interface SystemPromptItem {
  id: string
  name: string
  group: string
  description: string
  content: string
  default_content: string
  variables: string[]
  customized: boolean
}

export interface SystemPromptsResponse {
  success: boolean
  data?: { items: SystemPromptItem[] }
  message?: string
}

const endpoint = '/api/v1/tenants/kv/system-prompts'

function promptItems(response: SystemPromptsResponse): SystemPromptItem[] {
  if (!response.success || !Array.isArray(response.data?.items)) {
    throw new Error(response.message || '系统提示词返回异常，请重试')
  }
  return response.data.items
}

export async function getSystemPrompts(): Promise<SystemPromptItem[]> {
  return promptItems(await get<SystemPromptsResponse>(endpoint))
}

/** 空白内容由服务端解释为恢复默认；仅保存当前一项，避免覆盖其他模板。 */
export async function updateSystemPrompt(id: string, content: string): Promise<SystemPromptItem[]> {
  return promptItems(await put<SystemPromptsResponse>(endpoint, { id, content }))
}
