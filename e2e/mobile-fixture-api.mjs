// Deterministic, local-only layout fixture. Writes are rejected.
// Run alongside Vite with VITE_DEV_PROXY_TARGET=http://127.0.0.1:4194.
import { createServer } from 'node:http'

const created_at = '2026-09-19T08:00:00Z'
const kb = { id: 'mobile-kb', tenant_id: 42, creator_id: 'mobile-user', name: '我的知识库',
  description: '管理和组织文档，快速检索与问答', type: 'document', knowledge_count: 4,
  created_at, updated_at: created_at, indexing_strategy: { wiki_enabled: true, rag_enabled: true }, capabilities: { ready: true, storage_ready: true } }
const documents = Array.from({ length: 4 }, (_, n) => ({
  id: `mobile-doc-${n + 1}`, knowledge_base_id: kb.id, tenant_id: 42,
  title: ['普通地质学学习笔记.md', '移动端阅读与使用说明.md', '课程资料整理.md', '文档摘要与来源.md'][n],
  file_name: ['普通地质学学习笔记.md', '移动端阅读与使用说明.md', '课程资料整理.md', '文档摘要与来源.md'][n],
  type: 'file', file_type: 'md', folder_path: n > 1 ? '课程资料' : '',
  parse_status: 'completed', summary_status: 'completed', created_at, updated_at: created_at,
  description: '**阅读笔记**\n\n整理文档中的重要概念、实际案例与来源，方便随时查阅。\n\n手机上也可以快速搜索、筛选和打开文档。',
}))
const session = { id: 'mobile-session', title: '如何整理我的学习资料？', created_at, updated_at: created_at }
const model = { id: 'mobile-model', name: 'DeepSeek V4 Flash', type: 'KnowledgeQA', source: 'remote', is_default: true, status: 'active' }
const models = [model, ...Array.from({ length: 29 }, (_, index) => ({ ...model, id: `layout-model-${index}`, name: `验收模型 ${index + 2}`, is_default: false }))]
const agent = { id: 'mobile-agent', tenant_id: 42, name: '知识助手', description: '结合知识库回答问题，整理文档中的重要概念与来源。', created_by: 'mobile-user', is_builtin: false, created_at, updated_at: created_at, config: { model_id: model.id, kb_ids: [kb.id], agent_mode: 'quick-answer' } }
const wiki = { id: 'mobile-wiki', slug: 'reading', title: '资料整理与阅读', page_type: 'concept', status: 'active', summary: '整理学习资料中的重要概念，建立可以查阅的知识体系。', content: '# 资料整理与阅读\n\n手机阅读也应保留完整的正文内容。\n\n## 整理步骤\n\n' + '先整理文件，再核对资料中的来源与重要概念。\n\n'.repeat(8), aliases: [], source_refs: [], in_links: [], out_links: [], page_metadata: {}, version: 1, created_at, updated_at: created_at }

createServer((req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1')
  const path = url.pathname.replace('/api/v1', '')
  const send = (data, extra = {}) => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ success: true, data, ...extra })) }
  if (req.method !== 'GET') { res.statusCode = 405; return send(null, { success: false, message: '验收页面不保存数据' }) }
  if (path === '/entitlements/current') return send({ plan: 'max', plan_status: 'active', max_documents_per_kb: 0, storage_bytes: 107374182400, storage_used: 1024, video_upload: true })
  if (path === '/knowledge-bases') return send([kb], { total: 1 })
  if (path === `/knowledge-bases/${kb.id}`) return send(kb)
  if (path.endsWith('/wiki/stats')) return send({ total_pages: 1, pages_by_type: { concept: 1 }, total_links: 0, orphan_count: 1, pending_tasks: 0, recent_updates: [wiki] })
  if (path.endsWith('/wiki/pages')) return send({ pages: [wiki], total: 1, page: 1, page_size: 20, total_pages: 1 })
  if (path.includes('/wiki/pages/')) return send(wiki)
  if (path.endsWith('/wiki/index')) return send({ intro: '知识库中的学习资料与概念。', version: 1, groups: [{ type: 'concept', total: 1, items: [wiki] }] })
  if (path.endsWith('/wiki/folders')) return send({ folders: [], parent_id: '' })
  if (path.endsWith('/wiki/graph')) return send({ nodes: [{ slug: wiki.slug, title: wiki.title, page_type: 'concept', link_count: 0 }], edges: [], meta: { mode: 'overview', total: 1, returned: 1, truncated: false } })
  if (path.endsWith('/folders')) return send({ total_document_count: 4, root_document_count: 2, folders: [{ path: '课程资料', name: '课程资料', document_count: 2, total_count: 2, children: [] }] })
  if (path.endsWith('/knowledge')) {
    const folder = url.searchParams.get('folder_path') || ''
    const word = url.searchParams.get('keyword') || ''
    const type = url.searchParams.get('file_type') || ''
    const status = url.searchParams.get('parse_status') || ''
    const data = documents.filter(doc => doc.folder_path === folder && doc.title.includes(word) && (!type || doc.file_type === type) && (!status || doc.parse_status === status))
    return send(data, { total: data.length })
  }
  if (path.endsWith('/parser-engines')) return send([{ Name: 'builtin', Available: true, FileTypes: ['md', 'pdf'] }])
  const doc = documents.find(doc => path === `/knowledge/${doc.id}`)
  if (doc) return send(doc)
  if (path.endsWith('/chunks')) return send([{ id: 'chunk-1', content: '# 阅读笔记\n\n这是本地验收用的文档内容。\n\n## 重要概念\n\n**完整保留原来的样式**，根据手机的宽度重新安排布局。\n\n' + '文档正文应该完整可读，不能被屏幕边缘裁切。\n\n'.repeat(15), chunk_index: 0 }], { total: 1 })
  if (path.endsWith('/preview')) { res.setHeader('Content-Type', 'text/markdown'); return res.end('# 学习资料\n\n**阅读笔记**\n\n' + '文档正文应该完整可读，不能被屏幕边缘裁切。\n\n'.repeat(20)) }
  if (path === '/sessions') return send([session], { total: 1 })
  if (path === `/sessions/${session.id}`) return send(session)
  if (path.endsWith('/load')) return send([
    { id: 'question-1', role: 'user', content: session.title, is_completed: true, created_at },
    { id: 'answer-1', role: 'assistant', content: '可以先按主题整理文件夹，再用搜索和标签找到需要的文档。\n\n## 整理步骤\n\n1. 上传资料到知识库。\n2. 按课程归档。\n3. 提问时核对文档来源。', is_completed: true, created_at },
  ])
  if (path === '/models') return send(models)
  if (path.startsWith('/models/scene-options/')) return send({ scene: path.split('/').at(-1), effective_model_id: model.id, options: models.map(item => ({ model_id: item.id, display_name: item.name, model_type: item.type, selectable: true, locked: false, required_plan: 'free', is_scene_default: item.is_default, is_effective: item.is_default })) })
  if (path === '/agents' || path === '/agents/accessible') return send([agent], { total: 1 })
  if (path === `/agents/${agent.id}`) return send(agent)
  if (path.endsWith('/suggested-questions')) return send({ questions: [] })
  if (path.endsWith('/system/info')) return send({ edition: 'lite' })
  return send([], { total: 0 })
}).listen(4194, '127.0.0.1', () => console.log('Mobile fixture API: http://127.0.0.1:4194 (GET only)'))
