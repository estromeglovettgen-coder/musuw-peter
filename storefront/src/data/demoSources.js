// Short excerpts and labelled paraphrases only; no full papers or book text.
// Public sources were checked on 2026-09-06. Simulated notes are labelled in UI.
const civilCode = "https://www.moj.gov.cn/pub/sfbgw/zwgkztzl/2025nianzhuanti/2025mfdxcy/2025mfdxcy_mfdql/202505/t20250507_518708.html";
export const DEMO_SOURCES = Object.freeze({
  "cn-copyright": {
    kind: "public", jurisdiction: "CN-mainland", format: "quote", title: "中华人民共和国著作权法", locator: "第19条 · 委托作品",
    url: "https://www.ncac.gov.cn/xxfb/flfg/flfg_532/202103/t20210309_50530.html",
    excerpt: "受委托创作的作品，著作权的归属由委托人和受托人通过合同约定。",
  },
  "cn-portrait": {
    kind: "public", jurisdiction: "CN-mainland", format: "quote", title: "中华人民共和国民法典", locator: "第1019条 · 肖像使用", url: civilCode,
    excerpt: "未经肖像权人同意，肖像作品权利人不得以发表、复制、发行、出租、展览等方式使用或者公开肖像权人的肖像。",
  },
  "cn-licence": {
    kind: "public", jurisdiction: "CN-mainland", format: "quote", title: "中华人民共和国民法典", locator: "第1021条 · 许可条款解释", url: civilCode,
    excerpt: "当事人对肖像许可使用合同中关于肖像使用条款的理解有争议的，应当作出有利于肖像权人的解释。",
  },
  "uk-copyright": {
    kind: "public", jurisdiction: "UK", format: "quote", title: "UK Intellectual Property Office", locator: "Commissioned photographs",
    url: "https://www.gov.uk/government/publications/copyright-notice-digital-images-photographs-and-the-internet/copyright-notice-digital-images-photographs-and-the-internet#i-want-to-use-photos-taken-for-me-by-a-professional-photographer",
    excerpt: "the copyright will usually remain with the photographer",
  },
  "uk-private-photos": {
    kind: "public", jurisdiction: "UK", format: "summary", title: "Copyright, Designs and Patents Act 1988", locator: "Section 85 · Private photographs",
    url: "https://www.legislation.gov.uk/ukpga/1988/48/section/85",
    excerpt: "Someone commissioning photos for private and domestic purposes has protection against their public issue, exhibition, or communication, subject to the statutory exceptions.",
  },
  "uk-consent": {
    kind: "public", jurisdiction: "UK", format: "summary", title: "Copyright, Designs and Patents Act 1988", locator: "Section 87 · Consent and waiver",
    url: "https://www.legislation.gov.uk/ukpga/1988/48/section/87",
    excerpt: "Consent can permit an otherwise restricted act. Rights under this chapter may also be waived by a signed written instrument; its scope matters.",
  },
  longmemeval: {
    kind: "public", format: "summary", title: "LongMemEval", locator: "Abstract · Five memory abilities", url: "https://arxiv.org/abs/2410.10813",
    excerpt: "The benchmark separates information extraction, multi-session reasoning, temporal reasoning, knowledge updates, and abstention.",
    zh: { locator: "摘要 · 五类记忆能力", excerpt: "该基准分别评估信息提取、跨会话推理、时间推理、知识更新与拒答能力。" },
  },
  locomo: {
    kind: "public", format: "summary", title: "LoCoMo", locator: "Abstract · Evaluation tasks", url: "https://aclanthology.org/2024.acl-long.747/",
    excerpt: "Long, multi-session conversations support evaluation through question answering, event summarization, and multimodal dialogue generation.",
    zh: { locator: "摘要 · 评估任务", excerpt: "研究使用长跨度、多会话对话，设置问答、事件总结和多模态对话生成等评估任务。" },
  },
  "research-plan": {
    kind: "simulated", format: "fixture", title: "Memory evaluation plan", locator: "Research note · Next experiment",
    excerpt: "Hold the source material and queries constant. Evaluate recall, updates, and temporal reasoning separately. This is a proposed test, not a reported experimental result.",
    zh: { title: "长期记忆评估方案", locator: "研究笔记 · 待验证", excerpt: "固定资料与查询条件，分别检查事实召回、信息更新和时间推理。这是验证计划，不是已经完成的实验结论。" },
  },
  interviews: {
    kind: "simulated", format: "fixture", title: "New-user interviews", locator: "Finding · Before the first exercise",
    excerpt: "New users describe uncertainty about which course to choose and where to start their first exercise. The interviews suggest friction; they do not prove causality.",
    zh: { title: "新用户访谈", locator: "发现 · 首次练习之前", excerpt: "新用户反复提到不确定该选哪门课，以及如何开始首次练习。访谈提供阻力线索，不单独证明流失原因。" },
  },
  support: {
    kind: "simulated", format: "fixture", title: "Support feedback by user cohort", locator: "Finding · Active users",
    excerpt: "Requests for more courses come mainly from people already using the product regularly. This group should not be treated as equivalent to new users who drop off.",
    zh: { title: "客服反馈分层", locator: "发现 · 活跃用户", excerpt: "扩充课程的诉求主要来自已经持续使用产品的用户，不能直接将这组诉求视为新用户流失的原因。" },
  },
  funnel: {
    kind: "simulated", format: "fixture", title: "First-exercise funnel", locator: "Finding · First-use path",
    excerpt: "The largest early drop-off is before the first completed exercise. Test a shorter path, measure exercise completion, and then check week-one retention.",
    zh: { title: "首次练习漏斗", locator: "发现 · 初次使用路径", excerpt: "早期流失主要集中在完成首次练习之前。优先测试路径改进，先观察练习完成率，再检查首周留存。" },
  },
  "little-prince": {
    kind: "public", format: "summary", title: "Le Petit Prince", locator: "Chapters XIII, XX-XXI",
    url: "https://gutenberg.net.au/ebooks03/0300771h.html",
    excerpt: "Reading connections between characters, care, time, and responsibility are interpretations anchored in the chapters, not quotations or a definitive reading.",
    zh: { locator: "第13、20-21章", excerpt: "人物、照料、时间与责任之间的关系是基于章节的阅读理解，不是原文引语，也不代表唯一解释。" },
  },
});

export function getDemoSource(id, locale = "en") {
  const source = DEMO_SOURCES[id];
  if (!source) throw new Error(`Unknown demo source: ${id}`);
  const zh = locale === "zh" || locale === "zh-CN";
  return { ...source, ...(zh ? source.zh : {}), id, reviewedAt: source.kind === "public" ? "2026-09-06" : null };
}

export function getSourceLabels(locale = "en") {
  const zh = locale === "zh" || locale === "zh-CN";
  return zh
    ? { close: "关闭来源", open: "查看完整来源", quote: "原文摘录", summary: "来源要点（转述）", fixture: "模拟资料摘录", reviewed: "资料核验", label: "引用来源" }
    : { close: "Close source", open: "Open full source", quote: "Source excerpt", summary: "Source summary (paraphrased)", fixture: "Simulated source excerpt", reviewed: "Source checked", label: "Cited source" };
}
