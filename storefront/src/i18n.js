import { homeLocale } from "./publicRoutes.js";

const en = {
  meta: {
    title: "musuw | Evidence-first personal knowledge base",
    description:
      "musuw preserves your sources, builds connected knowledge, and answers with exact citations you can inspect.",
  },
  brand: { homeLabel: "musuw homepage" },
  nav: {
    primaryAria: "Primary navigation",
    mobileAria: "Mobile navigation",
    openMenu: "Open menu",
    closeMenu: "Close menu",
    login: "Log in",
    getStarted: "Start free",
    openApp: "Open musuw",
    items: [
      { label: "Features" },
      { label: "Pricing" },
      { label: "Security" },
      { label: "Legal" },
      { label: "Contact" },
    ],
  },
  hero: {
    eyebrow: "Evidence-first personal knowledge",
    titleLine1: "Make what you save useful.",
    titleLine2: "Know exactly why.",
    descriptionLine1:
      "Preserve sources, ask naturally, and turn important answers into connected knowledge",
    descriptionLine2: "with exact citations, a native Wiki, and a graph view inside Wiki.",
    getStarted: "Start free",
    talkToSales: "Contact us",
    dashboardAlt: "musuw Wiki page with linked sources and relationships",
    activityAlt: "musuw grounded answer with exact evidence",
    deliverableAlt: "musuw evidence-backed knowledge graph",
  },
  customerStrip: { label: "One accountable knowledge loop" },
  features: {
    intro: {
      label: "How musuw works",
      title: "A knowledge base that can explain itself",
      body: "Ask over your authorized sources, inspect exact evidence, and follow connected knowledge from a Wiki page into its graph.",
    },
    items: [
      {
        label: "Grounded Dialogue",
        title: "Ask naturally. Check every important answer.",
        description:
          "musuw searches the knowledge you authorize, answers in context, and connects important claims to exact source evidence.",
        imageAlt: "musuw grounded answer with exact source citations",
        bullets: [
          "Natural questions",
          "Bounded source scope",
          "Exact citations",
          "Honest uncertainty",
        ],
      },
      {
        label: "Living Knowledge Base",
        title: "Turn saved sources into useful memory.",
        description:
          "Bring in notes and documents, preserve the originals, and let musuw maintain connected Wiki pages without rewriting raw sources.",
        imageAlt: "musuw living Wiki generated from preserved sources",
        bullets: ["Source preservation", "Automatic Wiki", "Topic organization", "Version history"],
      },
      {
        label: "Wiki and Graph",
        title: "Explore connected knowledge in one place.",
        description:
          "musuw turns parsed sources into native Wiki pages and shows their relationships as a graph view inside Wiki, with paths back to exact evidence.",
        imageAlt: "musuw Wiki graph view with paths back to exact evidence",
        bullets: ["Native Wiki", "Graph inside Wiki", "Linked pages", "Evidence return"],
      },
      {
        label: "Source Library and Upload",
        title: "Upload and parse sources without losing the original.",
        description:
          "Bring in notes and common documents, track processing states, and keep the source version available while connected knowledge grows.",
        imageAlt: "musuw source library with upload and document processing states",
        bullets: ["Notes and documents", "Upload and parsing", "Source preservation", "Processing states"],
      },
    ],
  },
  workflow: {
    intro: {
      label: "From source to memory",
      title: "Save once. Keep using what you learned.",
      body: "musuw connects upload, parsing, retrieval, questions, Wiki, and ownership in one knowledge workflow.",
    },
    imageAlts: [
      "musuw living Wiki with connected pages",
      "musuw evidence-backed knowledge graph",
    ],
    items: [
      {
        title: "Collect sources without perfect filing",
        body: "Add notes and documents first, then organize them with topics when it helps",
      },
      {
        title: "Let knowledge stay alive",
        body: "Build readable Wiki pages while the original evidence remains unchanged",
      },
      {
        title: "Ask across exact sources",
        body: "Use natural dialogue with bounded retrieval and inspectable citations",
      },
      {
        title: "Explore relationships in Wiki",
        body: "Switch to the graph view inside Wiki and open connected pages and their sources",
      },
      {
        title: "Keep or remove it on your terms",
        body: "Save useful answers, export your workspace, or request deletion with visible status",
      },
    ],
  },
  benefits: {
    intro: {
      label: "Security and ownership",
      title: "Knowledge that compounds without hiding the evidence",
      body: "Keep personal scope, source history, server-side credentials, and visible export or deletion states in the same workflow.",
    },
    items: [
      {
        title: "Stop starting from scratch",
        body: "Bring prior sources and grounded answers back into the next task",
      },
      {
        title: "Know what supports an answer",
        body: "Open the exact version and region behind important claims",
      },
      {
        title: "Keep history intact",
        body: "Preserve earlier versions instead of replacing the past silently",
      },
      {
        title: "Keep the knowledge scope explicit",
        body: "Choose the workspace, topic, or source set available to a conversation",
      },
      {
        title: "Follow connected knowledge",
        body: "Move from a Wiki page to its graph neighbors and back to exact source evidence",
      },
      {
        title: "Keep control of your data",
        body: "Use server-side credentials, portable export, and clear deletion workflows instead of lock-in",
      },
    ],
  },
  pricing: {
    intro: {
      title: "Plans for personal knowledge work",
      body: "Choose the storage, model access, and monthly AI allowance that fit your personal knowledge work.",
    },
    currencyCode: "USD",
    currencySymbol: "$",
    billingAria: "Billing period",
    monthly: "Monthly",
    yearly: "Yearly",
    save: "Save on annual billing",
    recommended: "Recommended",
    includes: "Includes",
    perUserMonth: "/month",
    perYear: "/year",
    freeAction: "Start free",
    unavailableAction: "Planned",
    plans: [
      {
        name: "Free",
        description: "A bounded plan for a personal knowledge base",
        features: [
          "1 GiB storage",
          "$0.40 monthly AI credit allowance",
          "1 knowledge base, 10 documents",
          "One least-cost model per capability, no video upload",
        ],
      },
      {
        name: "Plus",
        description: "More room and an expanded platform-approved catalog",
        features: [
          "10 GiB storage",
          "$1.25 monthly AI credit allowance",
          "No plan cap on knowledge bases or documents",
          "Expanded platform-approved catalog and video upload",
        ],
      },
      {
        name: "Pro",
        description: "Higher storage and model allowance",
        features: [
          "30 GiB storage",
          "$2.50 monthly AI credit allowance",
          "No plan cap on knowledge bases or documents",
          "Expanded platform-approved catalog and video upload",
        ],
      },
      {
        name: "Max",
        description: "The largest current personal allowance",
        features: [
          "100 GiB storage",
          "$5.00 monthly AI credit allowance",
          "No plan cap on knowledge bases or documents",
          "Expanded platform-approved catalog and video upload",
        ],
      },
    ],
    checkout: {
      action: "View plan",
      note: "Sign in to see your current plan and confirm localized pricing before secure checkout.",
    },
  },
  comparison: {
    title: "Plan comparison",
    tableAria: "musuw plan comparison",
    firstColumn: "Capability",
    plans: ["Free", "Plus", "Pro", "Max"],
    included: "Included",
    notIncluded: "Not included",
    valueLabels: {
      "1 GiB": "1 GiB",
      "10 GiB": "10 GiB",
      "30 GiB": "30 GiB",
      "100 GiB": "100 GiB",
      "1": "1",
      "10": "10",
      "No plan-specific cap": "No plan-specific cap",
      "$0.40": "$0.40",
      "$1.25": "$1.25",
      "$2.50": "$2.50",
      "$5.00": "$5.00",
      "One least-cost model per capability": "One least-cost model per capability",
      "Expanded platform-approved catalog": "Expanded platform-approved catalog",
    },
    groups: [
      {
        title: "Workspace limits",
        rows: [
          "Storage",
          "Knowledge bases",
          "Documents per knowledge base",
        ],
      },
      {
        title: "Source ingestion",
        rows: ["Document upload and parsing", "Video upload"],
      },
      {
        title: "Model access",
        rows: ["Platform-approved model catalog"],
      },
      {
        title: "AI allowance and grounded answers",
        rows: [
          "Monthly AI credit allowance",
          "Grounded dialogue",
          "Exact citations",
        ],
      },
      {
        title: "Connected knowledge",
        rows: ["Wiki", "Source-version history", "Knowledge graph"],
      },
      {
        title: "Account and data controls",
        rows: ["Portable export", "Deletion controls"],
      },
    ],
  },
  testimonials: {
    intro: {
      label: "Product commitments",
      title: "Trust is part of the knowledge model",
      body: "These are musuw design commitments, not customer testimonials.",
    },
    rating: "No fabricated reviews or customer counts",
    items: [
      {
        quote:
          "Raw sources remain preserved. AI-derived knowledge never silently overwrites the material you saved.",
        name: "Raw stays raw",
        role: "Source integrity",
      },
      {
        quote:
          "Important factual claims point to exact evidence, not merely a document that discusses the same topic.",
        name: "Exact evidence",
        role: "Grounded answers",
      },
      {
        quote:
          "A historical citation resolves the version used by the answer, even when a newer source version exists.",
        name: "History stays inspectable",
        role: "Versioned sources",
      },
      {
        quote:
          "Source-supported facts, model inference, user assertions, and insufficient evidence remain distinguishable.",
        name: "Uncertainty is visible",
        role: "Evidence semantics",
      },
      {
        quote:
          "Uploads show processing, available, or retryable failure while optional background work stays off the core path.",
        name: "Core path stays usable",
        role: "Processing state",
      },
      {
        quote:
          "Questions, source evidence, and prior answers stay together in the conversation instead of moving through an extra intermediate workflow.",
        name: "History stays with the answer",
        role: "Conversation history",
      },
      {
        quote:
          "Every conversation run is bounded to the workspace, topics, and source versions authorized for that turn.",
        name: "Scope is explicit",
        role: "Private retrieval",
      },
      {
        quote:
          "Model credentials stay on the server and provider reasoning is never presented as source evidence.",
        name: "Credentials stay server-side",
        role: "Model boundary",
      },
      {
        quote:
          "Personal workspaces are isolated by account and scope, including sources, answers, history, and evidence.",
        name: "Personal means isolated",
        role: "Workspace access",
      },
      {
        quote:
          "The Wiki explains maintained knowledge. It does not replace or silently modify the original source vault.",
        name: "Wiki is not raw",
        role: "Knowledge ownership",
      },
      {
        quote:
          "The knowledge graph exposes typed, evidence-backed relationships instead of decorative similarity lines.",
        name: "Relationships explain why",
        role: "Knowledge graph",
      },
      {
        quote:
          "Export and deletion report their actual completion state instead of treating a submitted request as finished.",
        name: "Lifecycle is accountable",
        role: "Data control",
      },
    ],
  },
  blog: {
    title: "See musuw at work",
    allPosts: "Explore features",
    items: [
      {
        title: "Ask with exact evidence",
        author: "musuw product guide",
        date: "Grounded dialogue",
        alt: "musuw knowledge dialogue with active tools",
      },
      {
        title: "See how knowledge connects",
        author: "musuw product guide",
        date: "Knowledge graph",
        alt: "musuw evidence-backed knowledge graph",
      },
      {
        title: "Keep control of your sources",
        author: "musuw product guide",
        date: "Source library",
        alt: "musuw source library and upload workflow",
      },
    ],
  },
  faq: {
    label: "FAQ",
    title: "Questions before the preview",
    body: "Clear answers about the product, data, evidence, and current availability.",
    items: [
      {
        question: "What is musuw?",
        answer:
          "musuw is an evidence-first personal knowledge base that preserves sources, maintains connected knowledge, and answers questions with inspectable citations.",
      },
      {
        question: "Which sources can I add?",
        answer:
          "The current product workflow supports notes and common document formats. Additional source types will be disclosed only when available.",
      },
      {
        question: "Does musuw train on my private knowledge?",
        answer:
          "musuw does not claim ownership of your content. Authorized content may be processed by the model provider shown in the product to answer your request, as described in the Privacy Policy.",
      },
      {
        question: "Can I verify an AI answer?",
        answer:
          "Yes. Important claims can link to the exact source version and evidence region used by the answer, while inference and insufficient evidence remain labeled.",
      },
      {
        question: "Can I export or delete my knowledge?",
        answer:
          "musuw is designed around portable export and coordinated deletion with visible completion states rather than silent lock-in.",
      },
      {
        question: "How does paid access become active?",
        answer:
          "Available upgrades use secure hosted checkout. A paid plan becomes active only after verified payment confirmation; a URL or checkout return never grants access.",
      },
    ],
  },
  finalCta: {
    title: "Build your AI knowledge base\nKeep your knowledge growing",
    body: "Bring your sources together. Find answers and build lasting knowledge.",
    action: "Build my knowledge base",
  },
  footer: {
    groups: [
      { title: "Product", links: ["Features", "Use Cases", "Pricing"] },
      { title: "Trust", links: ["FAQ", "Security", "Contact"] },
      { title: "Legal", links: ["Terms", "Privacy", "Refunds"] },
    ],
    copyright: "© 2026 musuw. All rights reserved.",
  },
};

const zhCN = {
  meta: {
    title: "musuw | 可核验的个人知识库",
    description: "musuw 保留原始资料、构建相互连接的知识，并用可查看的精确引用回答问题。",
  },
  brand: { homeLabel: "musuw 首页" },
  nav: {
    primaryAria: "主导航",
    mobileAria: "移动端导航",
    openMenu: "打开菜单",
    closeMenu: "关闭菜单",
    login: "登录",
    getStarted: "建立我的知识库",
    openApp: "打开 musuw",
    items: [
      { label: "功能" },
      { label: "价格" },
      { label: "安全" },
      { label: "法律" },
      { label: "联系" },
    ],
  },
  hero: {
    eyebrow: "以证据为先的个人知识库",
    titleLine1: "让保存的资料持续有用。",
    titleLine2: "也让你知道为什么。",
    descriptionLine1: "保留原始资料，自然提问，并把重要答案沉淀为相互连接的知识，",
    descriptionLine2: "每个关键结论都有精确引用，并可在原生 Wiki 与其中的图谱视图中继续探索。",
    getStarted: "建立我的知识库",
    talkToSales: "联系我们",
    dashboardAlt: "包含关联来源与页面关系的 musuw Wiki 页面",
    activityAlt: "带精确证据的 musuw 知识回答",
    deliverableAlt: "由证据支持的 musuw 知识图谱",
  },
  customerStrip: { label: "一套可追溯的知识闭环" },
  features: {
    intro: {
      label: "musuw 如何工作",
      title: "一个能够解释自己的知识库",
      body: "在授权资料范围内提问，查看精确证据，并从 Wiki 页面进入其中的图谱继续探索连接。",
    },
    items: [
      {
        label: "有依据的知识问答",
        title: "自然提问，核验每一个重要答案。",
        description:
          "musuw 只搜索你授权的知识范围，在上下文中作答，并把重要结论连接到精确的原文证据。",
        imageAlt: "带精确资料引用的 musuw 知识回答",
        bullets: ["自然语言提问", "限定资料范围", "精确引用", "如实说明不确定性"],
      },
      {
        label: "持续生长的知识库",
        title: "让保存的资料变成可持续使用的记忆。",
        description:
          "导入笔记与文档，保留原始内容，并让 musuw 维护相互连接的 Wiki 页面，而不改写原始资料。",
        imageAlt: "由保留资料生成的 musuw 知识维基",
        bullets: ["保留原始资料", "自动知识维基", "主题组织", "版本历史"],
      },
      {
        label: "Wiki 与图谱",
        title: "在一个地方探索相互连接的知识。",
        description:
          "musuw 根据已解析资料生成原生 Wiki 页面，并把页面关系作为 Wiki 内的图谱视图呈现，每条路径都能返回精确证据。",
        imageAlt: "可返回精确证据的 musuw Wiki 图谱视图",
        bullets: ["原生知识维基", "Wiki 内图谱", "页面互链", "返回原始证据"],
      },
      {
        label: "资料库与上传",
        title: "上传并解析资料，同时保留原始内容。",
        description:
          "加入笔记和常见文档，追踪处理状态，并在相互连接的知识持续生长时保留资料版本。",
        imageAlt: "显示上传和文档处理状态的 musuw 资料库",
        bullets: ["笔记和文档", "上传与解析", "保留原始资料", "处理状态"],
      },
    ],
  },
  workflow: {
    intro: {
      label: "从资料到记忆",
      title: "保存一次，让学到的内容持续发挥作用。",
      body: "musuw 把上传、解析、检索、问答、Wiki 与数据所有权连接成一套知识工作流。",
    },
    imageAlts: ["包含相互连接页面的 musuw 知识维基", "由证据支持的 musuw 知识图谱"],
    items: [
      { title: "先收集，不必预先设计完美目录", body: "先加入笔记和文档，需要时再用主题进行组织" },
      { title: "让知识持续更新", body: "建立可读的 Wiki 页面，同时保持原始证据不被改写" },
      { title: "围绕精确资料自然提问", body: "使用限定范围的检索，并随时查看答案引用" },
      { title: "在 Wiki 中探索关系", body: "切换到 Wiki 内的图谱视图，打开关联页面与对应资料" },
      { title: "按你的方式保留或移除", body: "保存有用答案、导出知识空间，或查看删除请求状态" },
    ],
  },
  benefits: {
    intro: {
      label: "安全与所有权",
      title: "让知识不断积累，也不隐藏证据",
      body: "在同一套工作流中保留个人范围、资料历史、服务器端凭证，以及可见的导出和删除状态。",
    },
    items: [
      { title: "不再每次从头开始", body: "让既有资料与有依据的答案回到下一项任务中" },
      { title: "知道答案由什么支持", body: "打开重要结论背后的精确版本与原文位置" },
      { title: "完整保留历史", body: "保存早期版本，而不是悄悄覆盖过去" },
      { title: "明确控制知识范围", body: "选择一次对话可以使用的空间、主题或资料集合" },
      { title: "沿着知识连接继续探索", body: "从 Wiki 页面进入图谱邻居，再返回精确原文证据" },
      { title: "掌握你的数据", body: "使用服务器端凭证、便携导出与明确删除流程，避免数据锁定" },
    ],
  },
  pricing: {
    intro: {
      title: "为个人知识工作准备的套餐",
      body: "按你的个人知识工作需求，选择合适的存储空间、模型权限与每月 AI 额度。",
    },
    currencyCode: "CNY",
    currencySymbol: "¥",
    billingAria: "计费周期",
    monthly: "月付",
    yearly: "年付",
    save: "按年付费更省",
    recommended: "推荐",
    includes: "套餐包含",
    perUserMonth: "/月",
    perYear: "/年",
    freeAction: "建立我的知识库",
    unavailableAction: "规划中",
    plans: [
      {
        name: "免费版",
        description: "适合个人知识库的有边界免费方案",
        features: [
          "1 GiB 存储空间",
          "$0.40 每月 AI 额度",
          "1 个知识库，每库 10 篇文档",
          "每项能力一个最低成本模型，不支持视频上传",
        ],
      },
      {
        name: "Plus",
        description: "更多空间与扩展的平台批准模型目录",
        features: [
          "10 GiB 存储空间",
          "$1.25 每月 AI 额度",
          "知识库和文档数不受方案限制",
          "扩展的平台批准模型目录与视频上传",
        ],
      },
      {
        name: "专业版 Pro",
        description: "更高的存储与模型额度",
        features: [
          "30 GiB 存储空间",
          "$2.50 每月 AI 额度",
          "知识库和文档数不受方案限制",
          "扩展的平台批准模型目录与视频上传",
        ],
      },
      {
        name: "Max",
        description: "当前个人方案的最高额度",
        features: ["100 GiB 存储空间", "$5.00 每月 AI 额度", "知识库和文档数不受方案限制", "扩展的平台批准模型目录与视频上传"],
      },
    ],
    checkout: {
      action: "查看方案",
      note: "登录后查看当前方案，并在安全结账前确认本地化价格。",
    },
  },
  comparison: {
    title: "套餐对比",
    tableAria: "musuw 套餐对比",
    firstColumn: "能力",
    plans: ["免费版", "Plus", "Pro", "Max"],
    included: "包含",
    notIncluded: "不包含",
    valueLabels: {
      "1 GiB": "1 GiB",
      "10 GiB": "10 GiB",
      "30 GiB": "30 GiB",
      "100 GiB": "100 GiB",
      "1": "1",
      "10": "10",
      "No plan-specific cap": "不受套餐单独限制",
      "$0.40": "$0.40",
      "$1.25": "$1.25",
      "$2.50": "$2.50",
      "$5.00": "$5.00",
      "One least-cost model per capability": "每项能力一个最低成本模型",
      "Expanded platform-approved catalog": "扩展的平台批准模型目录",
    },
    groups: [
      { title: "工作区限制", rows: ["存储空间", "知识库数量", "每个知识库的文档数"] },
      { title: "资料导入", rows: ["文档上传与解析", "视频上传"] },
      { title: "模型权限", rows: ["平台批准的模型目录"] },
      {
        title: "AI 额度与有依据的回答",
        rows: ["每月 AI 额度", "有依据的问答", "精确引用"],
      },
      { title: "相互连接的知识", rows: ["Wiki", "资料版本历史", "知识图谱"] },
      { title: "账号与数据控制", rows: ["便携导出", "删除控制"] },
    ],
  },
  testimonials: {
    intro: {
      label: "产品承诺",
      title: "可信不是装饰，而是知识模型的一部分",
      body: "以下内容是 musuw 的产品承诺，不是客户评价。",
    },
    rating: "没有虚构评价，也没有虚构客户数量",
    items: [
      {
        quote: "原始资料始终被保留，AI 衍生知识不会悄悄覆盖你保存的内容。",
        name: "原始资料保持原样",
        role: "资料完整性",
      },
      {
        quote: "重要事实指向精确证据，而不是仅仅指向一篇碰巧讨论相同主题的文档。",
        name: "精确证据",
        role: "有依据的回答",
      },
      {
        quote: "历史引用始终解析到答案实际使用的版本，即使现在已经存在更新版本。",
        name: "历史可以核验",
        role: "资料版本",
      },
      {
        quote: "资料直接支持的事实、模型推断、用户陈述与证据不足会被清晰区分。",
        name: "不确定性清晰可见",
        role: "证据语义",
      },
      {
        quote: "上传只显示处理中、可用或失败可重试；可选后台能力不会阻塞核心链路。",
        name: "核心链路始终可用",
        role: "处理状态",
      },
      {
        quote: "问题、资料证据与历史答案留在同一条对话中，不会被移到额外的中间流程。",
        name: "历史紧随答案",
        role: "对话历史",
      },
      {
        quote: "每次对话运行都被限制在当次授权的空间、主题与资料版本内。",
        name: "范围清晰明确",
        role: "私有检索",
      },
      {
        quote: "模型凭证保留在服务器端，服务商推理过程不会被当作资料证据。",
        name: "凭证留在服务器",
        role: "模型边界",
      },
      {
        quote: "个人空间按账户与范围隔离，包括资料、答案、历史与证据。",
        name: "个人空间保持隔离",
        role: "空间访问",
      },
      {
        quote: "知识维基用于解释持续维护的知识，不会替代或悄悄修改原始资料库。",
        name: "维基不是原始资料",
        role: "知识所有权",
      },
      {
        quote: "知识图谱展示有类型、有证据支持的关系，而不是装饰性的相似度连线。",
        name: "关系能够解释原因",
        role: "知识图谱",
      },
      {
        quote: "导出和删除会报告真实完成状态，不会把提交请求当成已经完成。",
        name: "数据生命周期可核验",
        role: "数据控制",
      },
    ],
  },
  blog: {
    title: "看看 musuw 如何工作",
    allPosts: "查看功能",
    items: [
      {
        title: "带着精确证据提问",
        author: "musuw 产品指南",
        date: "有依据的问答",
        alt: "正在调用知识工具的 musuw 对话",
      },
      {
        title: "查看知识如何连接",
        author: "musuw 产品指南",
        date: "知识图谱",
        alt: "由证据支持的 musuw 知识图谱",
      },
      {
        title: "始终控制你的资料",
        author: "musuw 产品指南",
        date: "资料库",
        alt: "musuw 资料库与上传流程",
      },
    ],
  },
  faq: {
    label: "常见问题",
    title: "进入预览前需要了解的问题",
    body: "清晰了解产品、数据、证据与当前可用状态。",
    items: [
      {
        question: "musuw 是什么？",
        answer:
          "musuw 是一个以证据为先的个人知识库，用于保留资料、维护相互连接的知识，并通过可核验引用回答问题。",
      },
      {
        question: "可以加入哪些资料？",
        answer: "当前产品流程支持笔记和常见文档格式。其他资料类型只会在真正可用后公开说明。",
      },
      {
        question: "musuw 会用我的私人知识训练模型吗？",
        answer:
          "musuw 不会主张拥有你的内容。为完成请求，授权内容可能由产品中显示的模型服务商处理，具体请查看隐私政策。",
      },
      {
        question: "我能核验 AI 的答案吗？",
        answer:
          "可以。重要结论可以连接到答案实际使用的精确资料版本与证据位置，推断和证据不足也会被明确标注。",
      },
      {
        question: "我能导出或删除知识吗？",
        answer: "musuw 围绕便携导出和协调删除进行设计，并展示真实完成状态，避免悄悄锁定数据。",
      },
      {
        question: "付费状态如何生效？",
        answer:
          "可用升级会进入安全托管结账。只有收到可信付款确认后，付费方案才会生效；网址参数或结账返回不会授予权限。",
      },
    ],
  },
  finalCta: {
    title: "建立你的 AI 知识库\n让知识持续积累",
    body: "汇集资料，随时提问，让知识持续积累。",
    action: "建立我的知识库",
  },
  footer: {
    groups: [
      { title: "产品", links: ["功能", "使用场景", "价格"] },
      { title: "信任", links: ["常见问题", "安全", "联系"] },
      { title: "法律", links: ["服务条款", "隐私政策", "退款政策"] },
    ],
    copyright: "© 2026 musuw. All rights reserved.",
  },
};

export const storefrontTranslations = Object.freeze({
  en: Object.freeze(en),
  "zh-CN": Object.freeze(zhCN),
});

export function getStorefrontCopy(locale) {
  return storefrontTranslations[locale] ?? storefrontTranslations.en;
}

export function localePreferenceCookie(locale, hostname = "musuw.com") {
  const isMusuwHost = hostname === "musuw.com" || hostname.endsWith(".musuw.com");
  const domain = isMusuwHost ? "; Domain=.musuw.com" : "";
  const secure = isMusuwHost ? "; Secure" : "";
  return `musuw_locale=${encodeURIComponent(locale)}; Path=/; Max-Age=31536000; SameSite=Lax${domain}${secure}`;
}

export function persistLocalePreference(locale) {
  if (typeof window === "undefined") return;
  const normalized = locale === "zh-CN" || locale === "zh" ? "zh-CN" : "en";
  window.__MUSUW_LOCALE__ = normalized;
  // Remove the legacy host-only cookie before writing the shared preference.
  // Otherwise www.musuw.com can send two conflicting values on refresh.
  document.cookie = "musuw_locale=; Path=/; Max-Age=0; SameSite=Lax";
  document.cookie = localePreferenceCookie(normalized, window.location.hostname);
  try {
    localStorage.setItem("musuw_locale", normalized);
  } catch {}
}

export function getInitialLocale() {
  if (typeof window !== "undefined") {
    const routeLocale = homeLocale(window.location.pathname);
    if (routeLocale) return routeLocale;
    if (window.__MUSUW_LOCALE__ === "zh-CN" || window.__MUSUW_LOCALE__ === "zh") return "zh-CN";
    if (window.__MUSUW_LOCALE__ === "en") return "en";
    const cookieMatch = document.cookie.match(/(?:^|;\s*)musuw_locale=([^;]+)/);
    if (cookieMatch) {
      const val = decodeURIComponent(cookieMatch[1]);
      if (val === "zh-CN" || val === "zh") return "zh-CN";
      if (val === "en") return "en";
    }
    try {
      const stored = localStorage.getItem("musuw_locale");
      if (stored === "zh-CN" || stored === "zh") return "zh-CN";
      if (stored === "en") return "en";
    } catch {}
  }
  return "en";
}
