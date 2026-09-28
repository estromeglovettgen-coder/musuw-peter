// Public, deterministic marketing fixtures. These are not live customer records.
// A locale selects a pre-authored example, never the visitor's legal jurisdiction.
export const STORY_REVIEW_DATE = "2026-09-06";
export const isChineseStory = (locale) => locale === "zh" || locale === "zh-CN";

function serializeHeroAnswer(sections) {
  return sections.map((section) => {
    const itemLines = (section.items ?? []).map((item) => `• ${item.text}`);
    const tableLines = section.table
      ? [section.table.headers.join(" | "), ...section.table.rows.map((row) => row.join(" | "))]
      : [];
    return [section.title, section.body, ...itemLines, ...tableLines].filter(Boolean).join("\n");
  }).join("\n\n");
}

const heroAnswerSectionsZh = Object.freeze([
  {
    id: "conclusion",
    title: "核心作用 · 固定版本、范围、结论与下一步验证",
    body: "问题台账不是待办清单，而是把每个研究问题固化为可复核的实验单元：同步记录问题版本、证据范围、当前判断与下一步验证，使跨轮次讨论始终沿用同一口径。",
  },
  {
    id: "evidence",
    title: "多源证据",
    items: [
      { sourceId: "longmemeval", text: "LongMemEval 覆盖信息提取、跨会话推理、时间推理、知识更新与拒答五类能力；台账让每个问题都绑定明确的能力维度。" },
      { sourceId: "locomo", text: "LoCoMo 保留长会话中的事件链、时间关系与上下文；台账据此记录问题所处阶段，避免结论脱离原始语境。" },
      { sourceId: "research-plan", text: "当前评估方案固定语料版本、查询集合、评价指标与人工复核规则，使同一问题在资料更新后仍可重复核验。" },
    ],
  },
  {
    id: "impact",
    title: "对长期实验的影响",
    table: {
      headers: ["作用", "证据", "对实验的影响"],
      rows: [
        ["定义研究单元", "问题版本 + 资料范围 + 评价指标", "每轮只改变一个变量，避免结论漂移"],
        ["保留证据链", "来源片段 + 版本 + 人工复核", "可回溯判断依据并重现实验"],
        ["推动下一轮", "当前结论 + 反例 + 待验证假设", "把一次问答转化为连续实验节奏"],
      ],
    },
  },
  {
    id: "trace",
    title: "可追溯结论 · 来源、版本与验证入口",
    body: "综合三类资料，问题台账承担“索引—约束—回溯—迭代”的中枢作用。它不替代研究判断；当证据不足或口径变化时，系统保留不确定性，并把缺口转化为下一轮可执行的核验任务。",
  },
]);

const heroAnswerSectionsEn = Object.freeze([
  {
    id: "conclusion",
    title: "Core role · fixed version, scope, conclusion, next check",
    body: "The ledger is not a to-do list. It turns each research question into a reviewable experimental unit by recording its version, evidence scope, current judgment, and next validation step.",
  },
  {
    id: "evidence",
    title: "Evidence across sources",
    items: [
      { sourceId: "longmemeval", text: "LongMemEval covers information extraction, cross-session reasoning, temporal reasoning, knowledge updates, and abstention; the ledger tags each question to a capability." },
      { sourceId: "locomo", text: "LoCoMo preserves event chains, temporal relations, and context across long sessions, keeping every judgment attached to its original setting." },
      { sourceId: "research-plan", text: "The current plan fixes corpus versions, query sets, metrics, and human review rules so each result can be reproduced after source updates." },
    ],
  },
  {
    id: "impact",
    title: "Impact on the long-running experiment",
    table: {
      headers: ["Role", "Evidence", "Impact on the experiment"],
      rows: [
        ["Define a research unit", "Question version + scope + metric", "Change one variable per round"],
        ["Preserve evidence", "Source passage + version + review", "Trace and reproduce each judgment"],
        ["Drive the next round", "Conclusion + counterexample + open hypothesis", "Turn one answer into a continuous experiment"],
      ],
    },
  },
  {
    id: "trace",
    title: "Traceable conclusion · source, version, next check",
    body: "Across the three sources, the ledger acts as the experiment's index, constraint, audit trail, and iteration loop. It does not replace research judgment; gaps remain explicit and become executable validation tasks.",
  },
]);

export const HERO_STORY = Object.freeze({
  "zh-CN": {
    conversation: "长期课题跟踪实验",
    question: "我的问题台账，在我进行的长期课题跟踪实验里，具体起到了什么作用？",
    placeholder: "随心输入",
    answerSections: heroAnswerSectionsZh,
    answer: serializeHeroAnswer(heroAnswerSectionsZh),
    citations: ["LongMemEval · 五类能力", "LoCoMo · 多会话任务", "我的长期记忆评估方案"],
    sourceIds: ["longmemeval", "locomo", "research-plan"],
    preparation: "正在理解问题…",
    modelPreparation: "正在连接模型并生成回答…",
    pipelineSteps: [
      { phase: "retrieving", title: "检索问题台账与研究资料", summary: "按问题版本、资料范围与实验目标召回相关记录" },
      { phase: "cross-checking", title: "交叉核验多源证据", summary: "对齐 LongMemEval、LoCoMo 与当前验证方案的任务口径" },
      { phase: "drafting", title: "生成结构化回答", summary: "整理作用、证据与实验影响，保留可复核的来源指针" },
      { phase: "tracing", title: "回溯引用与适用边界", summary: "区分资料结论与个人实验假设，标记下一步验证入口" },
    ],
    pipelineStatus: "已完成多源检索与证据溯源",
    pipelineSummary: "问题改写 · 混合召回 · 交叉核验 · 结构化回答 · 引用回溯",
    saveLabel: "存入知识复利",
    savedLabel: "已存入知识复利",
    model: "GPT-6 Astra", effort: "关闭",
  },
  en: {
    conversation: "Long-running research workspace",
    question: "What role does my question ledger play in the long-running research experiments I am tracking?",
    placeholder: "Do anything",
    answerSections: heroAnswerSectionsEn,
    answer: serializeHeroAnswer(heroAnswerSectionsEn),
    citations: ["LongMemEval · five abilities", "LoCoMo · multi-session tasks", "My memory evaluation plan"],
    sourceIds: ["longmemeval", "locomo", "research-plan"],
    preparation: "Understanding the question…",
    modelPreparation: "Connecting to the model and generating the answer…",
    pipelineSteps: [
      { phase: "retrieving", title: "Retrieve ledger entries and research notes", summary: "Recall records by question version, source scope, and experiment objective" },
      { phase: "cross-checking", title: "Cross-check evidence across sources", summary: "Align task definitions from LongMemEval, LoCoMo, and the current evaluation plan" },
      { phase: "drafting", title: "Draft a structured answer", summary: "Organize role, evidence, and experiment impact while retaining reviewable source pointers" },
      { phase: "tracing", title: "Trace citations and decision limits", summary: "Separate reported findings from personal hypotheses and mark the next validation entry point" },
    ],
    pipelineStatus: "Multi-source retrieval and evidence trace complete",
    pipelineSummary: "Query rewrite · hybrid recall · cross-check · structured answer · citation trace",
    saveLabel: "Save to knowledge compounding",
    savedLabel: "Saved to knowledge compounding",
    model: "GPT-6 Astra", effort: "Off",
  },
});

function serializeAnswerSections(sections) {
  return sections.map((section) => {
    const marker = section.ordered ? (index) => `${index + 1}.` : () => "•";
    const itemLines = (section.items ?? []).map((item, index) => `${marker(index)} ${item.text}`);
    return [section.title, section.body, ...itemLines].filter(Boolean).join("\n");
  }).join("\n\n");
}

const reasoningAnswerSectionsZh = Object.freeze([
  {
    id: "conclusion",
    title: "优先判断",
    body: "优先验证注册到首次练习完成的引导路径，暂不把扩充课程作为第一改动。当前证据更一致地指向用户在获得首次价值之前受阻。",
  },
  {
    id: "evidence",
    title: "证据交叉验证",
    items: [
      { sourceId: "interviews", text: "用户访谈显示，新用户在选择内容和找到首次练习入口时反复出现不确定性，支持存在起步阻力这一判断。" },
      { sourceId: "support", text: "客服中的扩课诉求主要来自持续使用的活跃用户，与发生早期流失的新用户不是同一群体，不能直接用于解释本次流失。" },
      { sourceId: "funnel", text: "使用漏斗将主要早期流失定位在首次练习完成之前，与访谈中的起步阻力形成交叉印证。" },
    ],
  },
  {
    id: "alternative",
    title: "备选假设",
    body: "课程供给不足仍值得保留，但现有资料对它的支持弱于路径阻力。应把它作为后续对照假设，而不是先用活跃用户诉求替代新用户证据。",
  },
  {
    id: "validation",
    title: "验证方案",
    ordered: true,
    items: [
      { text: "为新注册用户提供默认路径，并前置首次练习入口；保持其他关键体验不变，隔离路径改动的影响。" },
      { text: "固定新用户口径与观察窗口，以首次练习完成率为主指标，以到达首次练习的时间和首周留存为次级指标。" },
      { text: "按相同口径复核结果；若首练完成率与首周留存均未改善，再回测课程供给和其他阻力假设。" },
    ],
  },
  {
    id: "limits",
    title: "判断边界",
    body: "这是一项由三类资料共同支持的优先级建议，不是因果结论。正式决策前仍需核对样本代表性、时间范围、渠道结构和漏斗埋点完整性。",
  },
]);

const reasoningAnswerSectionsEn = Object.freeze([
  {
    id: "conclusion",
    title: "Priority conclusion",
    body: "Validate the path from sign-up to a completed first exercise before expanding the course catalog. The current evidence more consistently points to friction before users receive initial value.",
  },
  {
    id: "evidence",
    title: "Evidence review",
    items: [
      { sourceId: "interviews", text: "Interviews repeatedly surface uncertainty about choosing content and finding the first exercise, which supports an onboarding-friction hypothesis." },
      { sourceId: "support", text: "Requests for more courses come mainly from active users. That cohort is not equivalent to new users who leave early, so it cannot directly explain this drop-off." },
      { sourceId: "funnel", text: "The usage funnel places the largest early loss before first-exercise completion, corroborating the interview signal." },
    ],
  },
  {
    id: "alternative",
    title: "Alternative hypothesis",
    body: "Insufficient course supply remains plausible, but the retrieved material supports it less strongly than path friction. Keep it as a comparison hypothesis instead of substituting active-user demand for new-user evidence.",
  },
  {
    id: "validation",
    title: "Validation plan",
    ordered: true,
    items: [
      { text: "Provide a default learning path and move the first-exercise entry point forward while holding other major experience changes constant." },
      { text: "Fix the new-user cohort definition and observation window. Use first-exercise completion as the primary measure, with time to first exercise and week-one retention as secondary measures." },
      { text: "Review the result on the same cohort basis. If neither completion nor week-one retention improves, return to course supply and other friction hypotheses." },
    ],
  },
  {
    id: "limits",
    title: "Decision limits",
    body: "This is a priority recommendation supported across three sources, not a causal conclusion. Confirm sample coverage, time range, channel mix, and funnel instrumentation before making a broader rollout decision.",
  },
]);

export const REASONING_STORY = Object.freeze({
  zh: {
    title: "多源检索 · 留存路径诊断",
    question: "最近新用户流失有所上升。结合用户访谈、客服反馈与使用数据，当前最值得优先验证的改进方向是什么？",
    preparation: "正在理解问题…",
    steps: [
      { title: "查询理解与意图识别", summary: "解析用户目标，生成检索改写，并将问题拆成可独立核验的命题" },
      { title: "证据范围锁定", summary: "限定访谈、客服反馈与首次练习漏斗，保留用户群体和时间边界" },
      { title: "混合召回（BM25 + 向量）", summary: "关键词与语义并行召回，经 RRF 融合排序；召回不足时触发 Query Expansion" },
      { title: "Rerank 重排与上下文合并", summary: "按语义相关性重排候选，去重并合并相邻片段，保留来源指针" },
      { title: "关系回溯与证据核验", summary: "核对群体、行为与漏斗关系，保留原始引用，区分交叉印证与待验证因果" },
    ],
    answerSections: reasoningAnswerSectionsZh,
    answer: serializeAnswerSections(reasoningAnswerSectionsZh),
    citation: "访谈 · 客服反馈 · 使用漏斗",
    sourceIds: ["interviews", "support", "funnel"],
    pipelineStatus: "已完成多源检索与证据核验",
    pipelineSummary: "查询改写 · BM25 + 向量 · RRF 融合 · Rerank · 上下文合并 · 引用回溯",
    placeholder: "随心输入", model: "GPT-6 Astra", effort: "关闭",
    copy: "复制回答", save: "添加到知识库", finish: "形成优先级建议", send: "发送", stop: "停止生成",
  },
  en: {
    title: "Hybrid retrieval · Retention path diagnosis",
    question: "New-user drop-off is rising. Based on interviews, support feedback, and usage data, which improvement should we validate first?",
    preparation: "Understanding the question…",
    steps: [
      { title: "Query understanding & intent", summary: "Parse the objective, preserve the original query, and generate independently testable rewrites" },
      { title: "Evidence scope lock", summary: "Limit retrieval to interviews, support feedback, and the first-exercise funnel while retaining cohort and time boundaries" },
      { title: "Hybrid retrieval (BM25 + vector)", summary: "Run lexical and semantic recall in parallel, fuse ranks with RRF, and trigger query expansion only when recall is sparse" },
      { title: "Rerank & context merge", summary: "Rerank candidates by semantic relevance, merge adjacent passages, and retain source pointers" },
      { title: "Relationship trace & evidence check", summary: "Trace cohort, behavior, and funnel relationships back to their sources; separate corroboration from unverified causality" },
    ],
    answerSections: reasoningAnswerSectionsEn,
    answer: serializeAnswerSections(reasoningAnswerSectionsEn),
    citation: "Interviews · Support · Usage funnel",
    sourceIds: ["interviews", "support", "funnel"],
    pipelineStatus: "Multi-source retrieval and evidence checks complete",
    pipelineSummary: "Query rewrite · BM25 + vector · RRF fusion · Rerank · context merge · citation trace",
    placeholder: "Do anything", model: "GPT-6 Astra", effort: "Off",
    copy: "Copy answer", save: "Add to knowledge base", finish: "Recommendation ready", send: "Send", stop: "Stop generation",
  },
});

const zhApp = {
  newChat: "新对话", knowledgeBases: "知识库", agents: "智能体", today: "今天", recent: "近7天",
  userName: "Musuw 演示", userMeta: "个人知识空间",
};
const enApp = {
  newChat: "New chat", knowledgeBases: "Knowledge bases", agents: "Agents", today: "Today", recent: "Last 7 days",
  userName: "Musuw Demo", userMeta: "Personal knowledge",
};
const zhTabs = { knowledgeBases: "知识库", wiki: "Wiki", graph: "图谱" };
const enTabs = { knowledgeBases: "Knowledge bases", wiki: "Wiki", graph: "Graph" };

export const KNOWLEDGE_STORIES = Object.freeze({
  zh: {
    wiki: {
      app: { ...zhApp, userMeta: "研究者知识空间", sessions: ["长期记忆应该如何评估？", "LongMemEval 阅读笔记", "LoCoMo 任务设计", "信息更新与时间推理", "整理评估方案", "跨会话推理研究", "比较文献的评价指标", "研究问题与验证计划"] },
      header: { ...zhTabs, current: "AI Agent 记忆研究", description: "围绕长期记忆的研究问题，组织论文、阅读笔记与评估方案", documents: "文档 (3)" },
      content: {
        search: "搜索 Wiki 页面...", loading: "正在整理知识索引…", index: "索引", indexType: "目录", indexOverview: "AI Agent 记忆研究",
        indexLead: "围绕研究问题组织文献、个人理解与后续验证。", indexHint: "打开页面，查看理解背后的论文与研究笔记。",
        knowledge: "知识 8", summaries: "摘要 1", pageId: "memory-evaluation", back: "记忆系统", pageTitle: "长期记忆评估", type: "研究主题",
        lead: "我目前的理解：长期记忆评估不只看事实召回，还要看跨会话关联、时间变化与信息不足时的回答边界。",
        introBeforeLink: "比较记忆方案时，先对齐 ", inlineLink: "评估任务", introAfterLink: "、资料条件和评价指标，不直接用不同论文的总分排列方法优劣。",
        core: "已有研究提供了什么",
        bullets: ["LongMemEval：分别评估信息提取、跨会话推理、时间推理、知识更新与拒答。", "LoCoMo：通过长跨度、多会话材料，设置问答、事件总结与多模态对话任务。"],
        audienceTitle: "我的研究备注", audience: "区分论文结论与自己的推断；比较结果时，保留任务设置和适用范围。",
        assessmentTitle: "下一步验证", assessment: "在相同资料和查询条件下，分别检查事实召回、信息更新和时间推理，记录方案在哪类问题上失效。",
        linkedFrom: "反向链接", backlinkTitle: "知识更新 · 时间推理 · RAG 评估", sources: "资料来源", sourceTitle: "2 篇论文 · 1 份研究笔记",
        sourceIds: ["longmemeval", "locomo", "research-plan"], updatedAt: "2026/09/06", note: "研究笔记与验证计划为演示内容",
        groups: [
          { label: "研究问题", count: 3, items: ["长期记忆评估", "知识更新", "时间推理"] },
          { label: "文献与方法", count: 3, items: ["LongMemEval", "LoCoMo", "RAG 评估"] },
          { label: "研究笔记", count: 2, items: ["评估任务", "验证计划"] },
        ],
        linkedPage: {
          pageId: "evaluation-tasks", pageTitle: "评估任务", type: "研究笔记", back: "长期记忆评估",
          lead: "评估任务将抽象能力转化为可复现的核验条件，使不同方案的结果具备可比性。",
          introBeforeLink: "本页对照 ", inlineLink: "LongMemEval", introAfterLink: " 与 LoCoMo 的任务设计，统一记录问题类型、资料范围和判定标准。",
          core: "任务维度",
          bullets: ["信息提取：确认系统能否从既有资料中定位并复述关键事实。", "跨会话与时间推理：检查跨轮次关联、时间变化和上下文约束。", "知识更新与拒答：区分资料变更后的更新能力，以及证据不足时的回答边界。"],
          audienceTitle: "使用边界", audience: "结果只对当前资料、查询与评分口径负责；跨数据集或跨版本比较前需先对齐任务设置。",
          assessmentTitle: "验证记录", assessment: "固定资料和查询条件，逐项记录正确性、引用完整性与不确定性，并保留失败样例。",
          linkedFrom: "关联页面", backlinkTitle: "长期记忆评估", sources: "资料来源", sourceTitle: "LongMemEval · LoCoMo · 研究计划",
          sourceIds: ["longmemeval", "locomo", "research-plan"], updatedAt: "2026/09/06",
          destinationPage: {
            pageId: "longmemeval", pageTitle: "LongMemEval", type: "论文笔记", back: "评估任务",
            lead: "LongMemEval 将对话式长程记忆拆解为可追溯的任务单元，并显式检验动态更新、时间约束与证据不足时的回答边界。",
            introBeforeLink: "评测协议联合覆盖 ", inlineLink: "单会话事实、跨会话关联与时间推理", introAfterLink: "，并要求每个答案能够回溯到对应会话片段与时间状态。",
            core: "评测协议",
            bullets: ["样本构造：保留跨会话事件链、时间戳和后续事实更新，避免把长程记忆退化为静态检索。", "判定口径：分别记录答案正确性、证据定位、知识更新和拒答表现，不用单一总分掩盖失败类型。", "误差分析：区分召回缺失、关系绑定错误、时间状态混淆与无证据推断，便于定位系统瓶颈。"],
            audienceTitle: "复现实验记录", audience: "固定语料版本、查询模板、检索配置与评分规则；保存逐题证据、模型输出和人工复核结果。",
            assessmentTitle: "与当前方案的映射", assessment: "把任务维度映射到检索、记忆写入和答案生成链路，分别验证故障发生在哪一层，而不是只比较最终回答。",
            linkedFrom: "关联页面", backlinkTitle: "评估任务 · 长期记忆评估", sources: "资料来源", sourceTitle: "LongMemEval 论文 · 评测说明",
            sourceIds: ["longmemeval", "research-plan"], updatedAt: "2026/09/06",
          },
        },
      },
    },
    graph: {
      app: { ...zhApp, userMeta: "阅读与思考", sessions: ["《小王子》的人物与主题", "狐狸与建立关系", "玫瑰为什么独特？", "第21章阅读笔记", "时间与照料", "责任与驯养", "商人与点灯人", "整理阅读总览"] },
      header: { ...zhTabs, current: "《小王子》阅读笔记", description: "通读全书后，连接人物、章节事件、地点、主题、象征、关系与总结", documents: "文档 (1)" },
      content: {
        search: "搜索整张知识图谱...", overview: "全书阅读图谱", count: "个节点",
        status: "全书章节、事件与阅读关系已关联", playbackRunning: "正在展开全书人物、事件与主题",
      },
    },
  },
  en: {
    wiki: {
      app: { ...enApp, userMeta: "Research workspace", sessions: ["How should long-term memory be evaluated?", "Reading notes: LongMemEval", "LoCoMo task design", "Updates and temporal reasoning", "Draft an evaluation plan", "Cross-session reasoning", "Compare evaluation metrics", "Research questions and next steps"] },
      header: { ...enTabs, current: "Agent Memory Research", description: "Organize papers, reading notes, and evaluation plans around a research question", documents: "Documents (3)" },
      content: {
        search: "Search Wiki pages...", loading: "Building the knowledge index…", index: "Index", indexType: "Directory", indexOverview: "Agent Memory Research",
        indexLead: "Connect the literature, your interpretation, and the questions to test next.", indexHint: "Open a page to inspect the papers and notes behind an understanding.",
        knowledge: "Knowledge 8", summaries: "Summaries 1", pageId: "memory-evaluation", back: "Memory systems", pageTitle: "Memory Evaluation", type: "Research topic",
        lead: "My current understanding: evaluate more than fact recall. Check cross-session connections, changing information, and when the evidence is insufficient.",
        introBeforeLink: "Before comparing systems, align ", inlineLink: "evaluation tasks", introAfterLink: ", source conditions, and metrics. Scores from different papers are not a shared ranking.",
        core: "What the literature contributes",
        bullets: ["LongMemEval tests extraction, cross-session and temporal reasoning, knowledge updates, and abstention.", "LoCoMo uses long, multi-session conversations for question answering, event summarization, and multimodal dialogue."],
        audienceTitle: "My research note", audience: "Separate reported findings from my interpretation. Keep task settings and the scope of each result.",
        assessmentTitle: "What to test next", assessment: "Hold sources and queries constant. Check recall, updates, and temporal reasoning separately, recording where each approach fails.",
        linkedFrom: "Linked from", backlinkTitle: "Knowledge updates · Temporal reasoning · RAG evaluation", sources: "Sources", sourceTitle: "2 papers · 1 research note",
        sourceIds: ["longmemeval", "locomo", "research-plan"], updatedAt: "2026/09/06", note: "Research notes and test plans are illustrative",
        groups: [
          { label: "Research questions", count: 3, items: ["Memory Evaluation", "Knowledge updates", "Temporal reasoning"] },
          { label: "Literature & methods", count: 3, items: ["LongMemEval", "LoCoMo", "RAG evaluation"] },
          { label: "Research notes", count: 2, items: ["Evaluation tasks", "Test plan"] },
        ],
        linkedPage: {
          pageId: "evaluation-tasks", pageTitle: "Evaluation tasks", type: "Research note", back: "Memory Evaluation",
          lead: "Evaluation tasks turn an abstract capability into reproducible checks, so results from different systems remain comparable.",
          introBeforeLink: "This page compares the task design in ", inlineLink: "LongMemEval", introAfterLink: " and LoCoMo, keeping question types, source scope, and decision rules explicit.",
          core: "Task dimensions",
          bullets: ["Information extraction: locate and restate facts already present in the source material.", "Cross-session and temporal reasoning: test links across turns, changing facts, and context constraints.", "Knowledge updates and abstention: separate update behavior after source changes from the boundary where evidence is insufficient."],
          audienceTitle: "Scope", audience: "Results apply only to the current sources, queries, and scoring rules. Align task settings before comparing datasets or versions.",
          assessmentTitle: "Validation record", assessment: "Hold sources and queries constant. Record correctness, citation completeness, uncertainty, and retained failure cases for each task.",
          linkedFrom: "Linked from", backlinkTitle: "Memory Evaluation", sources: "Sources", sourceTitle: "LongMemEval · LoCoMo · Research plan",
          sourceIds: ["longmemeval", "locomo", "research-plan"], updatedAt: "2026/09/06",
          destinationPage: {
            pageId: "longmemeval", pageTitle: "LongMemEval", type: "Paper note", back: "Evaluation tasks",
            lead: "LongMemEval decomposes conversational long-term memory into traceable task units and explicitly tests changing facts, temporal constraints, and abstention when evidence is insufficient.",
            introBeforeLink: "Its protocol jointly covers ", inlineLink: "single-session facts, cross-session links, and temporal reasoning", introAfterLink: ", while requiring each answer to remain traceable to the relevant dialogue evidence and time state.",
            core: "Evaluation protocol",
            bullets: ["Dataset construction retains cross-session event chains, timestamps, and later fact updates instead of reducing long-term memory to static retrieval.", "Scoring records answer accuracy, evidence localization, knowledge updates, and abstention separately so one aggregate score cannot hide distinct failure modes.", "Error analysis separates missing recall, incorrect relation binding, temporal-state confusion, and unsupported inference to localize system bottlenecks."],
            audienceTitle: "Reproduction record", audience: "Freeze the corpus version, query templates, retrieval settings, and scoring rules; retain per-question evidence, model output, and human review.",
            assessmentTitle: "Mapping to the current system", assessment: "Map each task dimension to retrieval, memory writes, and answer generation, then test which layer fails instead of comparing only the final response.",
            linkedFrom: "Linked from", backlinkTitle: "Evaluation tasks · Memory Evaluation", sources: "Sources", sourceTitle: "LongMemEval paper · Evaluation notes",
            sourceIds: ["longmemeval", "research-plan"], updatedAt: "2026/09/06",
          },
        },
      },
    },
    graph: {
      app: { ...enApp, userMeta: "Reading & reflection", sessions: ["The Little Prince: characters and themes", "The fox and forming ties", "What makes the rose unique?", "Chapter 21 reading notes", "Time and care", "Responsibility and taming", "The businessman and the lamplighter", "Organize my reading overview"] },
      header: { ...enTabs, current: "The Little Prince · Reading Notes", description: "A complete-book map of characters, chapter events, places, themes, symbols, relations, and summaries", documents: "Documents (1)" },
      content: {
        search: "Search the knowledge graph...", overview: "Complete reading map", count: "nodes",
        status: "The complete book's chapters, events, and reading connections are linked", playbackRunning: "Revealing the book's characters, events, and themes",
      },
    },
  },
});

export const HOMEPAGE_STORIES = Object.freeze({
  en: {
    hero: {
      eyebrow: "Retrieval · Evidence · Structure · Connections",
      typewriterPhrases: ["Retrieval · Evidence · Structure · Connections", "Trace key claims to their original sources", "Retrieve and verify across multiple sources", "Keep sources, pages, and relationships aligned", "Integrate new material into existing knowledge"],
      titleLine1: "Build your AI knowledge base", titleLine2: "Let knowledge keep growing", titleFocusSegments: ["Let", "knowledge", "keep growing"],
      descriptionLine1: "Turn source material into intelligent knowledge assets",
      descriptionLine2: "",
      getStarted: "Start free", talkToSales: "View demo", dashboardAlt: "A legal question answered from saved copyright and privacy sources, with inspectable citations",
    },
    features: {
      intro: { label: "Core capabilities", title: "Build a verifiable knowledge system that keeps evolving", body: "Multi-source retrieval, evidence verification, structured organization, and relationship discovery share one traceable context." },
      items: [
        { label: "Multi-source reasoning", title: "Support every conclusion with evidence across sources", description: "Retrieve, compare, and synthesize within a defined source scope. Distinguish source evidence, model inference, and missing information.", bullets: ["Cross-source retrieval", "Scope and version controls", "Precise citation locations", "Evidence, inference, and uncertainty"] },
        {},
        { label: "Knowledge graph", title: "Turn relationships into explorable knowledge paths", description: "Map typed relationships among pages, entities, concepts, and sources. Move from the global structure into local context, then trace each path back to evidence.", bullets: ["Typed relationships", "Cross-source connections", "Node-level context", "Evidence-traceable paths"] },
        { label: "Structured Wiki", title: "Keep knowledge structured as it evolves", description: "Organize sources, findings, and context into linked Wiki pages while preserving provenance and version history through every update.", bullets: ["Structured Wiki pages", "Page links and backlinks", "Traceable sources and versions", "Incremental updates"] },
      ],
    },
  },
  "zh-CN": {
    hero: {
      eyebrow: "多源检索 · 证据核验 · 知识组织 · 关系发现",
      typewriterPhrases: ["多源检索 · 证据核验 · 知识组织 · 关系发现", "关键结论可追溯至原始资料", "多种来源统一检索与交叉核验", "资料、页面与关系持续同步", "新增内容自动接入既有知识"],
      titleLine1: "建立你的AI知识库", titleLine2: "让知识持续积累", titleFocusSegments: ["让", "知识", "持续积累"],
      descriptionLine1: "把资料转化为会思考的知识资产",
      descriptionLine2: "",
      getStarted: "建立我的知识库", talkToSales: "查看演示", dashboardAlt: "从已保存的版权与肖像权资料回答生活法律问题，并展示可核验的引用",
    },
    features: {
      intro: { label: "核心能力", title: "构建可验证、可持续演进的知识体系", body: "多源检索、证据核验、结构化组织与关系发现，共享同一套可追溯上下文。" },
      items: [
        { label: "多源推理", title: "以多源证据支撑判断", description: "在限定资料范围内完成检索、比对与归纳，明确区分原文依据、模型推断与信息缺口。", bullets: ["跨来源检索与聚合", "范围与版本约束", "精确引用定位", "事实、推断与不确定性分层"] },
        {},
        { label: "知识图谱", title: "让关系成为可探索的知识路径", description: "以图谱呈现页面、实体、概念与来源之间的有类型关系，从全局结构进入局部上下文，并沿路径返回证据。", bullets: ["呈现有类型的关系", "发现跨资料关联", "展开节点相关上下文", "沿关系路径追溯证据"] },
        { label: "Wiki 组织", title: "让知识以结构持续演进", description: "将资料、结论与来源组织为相互链接的 Wiki 页面，在持续更新中保留上下文和版本关系。", bullets: ["自动生成结构化页面", "页面互链与反向链接", "来源与版本可追溯", "新增资料增量更新"] },
      ],
    },
  },
});
