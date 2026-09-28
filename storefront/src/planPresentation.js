export const HOMEPAGE_NAVIGATION = Object.freeze([
  Object.freeze({ label: "Features", href: "/#feature" }),
  Object.freeze({ label: "Examples", href: "/#blog" }),
  Object.freeze({ label: "Pricing", href: "/#pricing" }),
  Object.freeze({ label: "Security", href: "/security" }),
  Object.freeze({ label: "Contact", href: "/contact" }),
]);

export const HOMEPAGE_FOOTER_GROUPS = Object.freeze([
  Object.freeze({
    title: "Product",
    links: Object.freeze([
      Object.freeze(["Features", "/#feature"]),
      Object.freeze(["Examples", "/#blog"]),
      Object.freeze(["Pricing", "/#pricing"]),
    ]),
  }),
  Object.freeze({
    title: "Trust",
    links: Object.freeze([
      Object.freeze(["FAQ", "/#faq"]),
      Object.freeze(["Security", "/security"]),
      Object.freeze(["Contact", "/contact"]),
    ]),
  }),
  Object.freeze({
    title: "Legal",
    links: Object.freeze([
      Object.freeze(["Terms", "/terms"]),
      Object.freeze(["Privacy", "/privacy"]),
      Object.freeze(["Refunds", "/refund-policy"]),
    ]),
  }),
]);

const HOMEPAGE_COPY = Object.freeze({
  en: Object.freeze({
    navLabels: Object.freeze(["Features", "Examples", "Pricing", "Security", "Contact"]),
    meta: Object.freeze({
      title: "musuw | A second brain that can explain itself",
      description:
        "Ask your own knowledge, verify answers against exact sources, and let AI organize what you know into a living Wiki and knowledge graph.",
    }),
    hero: Object.freeze({
      eyebrow: "An evidence-grounded second brain",
      titleLine1: "A second brain",
      titleLine2: "that can explain itself.",
      descriptionLine1: "Ask your knowledge, inspect the exact evidence behind important claims,",
      descriptionLine2: "and let AI organize what you know into a living Wiki and knowledge graph.",
      getStarted: "Start free",
      talkToSales: "See examples",
      dashboardAlt: "musuw product walkthrough showing a source-grounded answer, its citations, Wiki, and graph",
    }),
    features: Object.freeze({
      intro: Object.freeze({
        label: "Core capabilities",
        title: "Ask, organize, and connect what you know.",
        body:
          "Musuw combines source-grounded AI, an AI-organized Wiki, and a knowledge graph in one personal knowledge system.",
      }),
      items: Object.freeze([
        Object.freeze({
          label: "Grounded answers",
          title: "Ask your knowledge. Verify every important claim.",
          description:
            "The agent answers from the knowledge base in scope and keeps citations, retrieved passages, entities, and conversation context visible while you work.",
          image: "/images/musuw-query-citation.jpg",
          imageAlt: "musuw agent answer with exact knowledge-base citations and a detailed evidence side panel",
          bullets: Object.freeze([
            "Knowledge-base RAG",
            "Exact source citations",
            "Evidence side panel",
            "Continuous conversation context",
          ]),
        }),
        Object.freeze({}),
        Object.freeze({
          label: "Knowledge graph",
          title: "Reveal the connections hidden across your knowledge.",
          description:
            "Musuw discovers backlinks, shared entities, cross-source references, and evidence paths so ideas become a connected system instead of isolated files.",
          image: "/images/musuw-wiki-graph.jpg",
          imageAlt: "musuw knowledge graph showing backlinks, related entities, and cross-source relationships",
          bullets: Object.freeze([
            "Backlinks",
            "Entity relationships",
            "Cross-source connections",
            "Evidence-backed paths",
          ]),
        }),
        Object.freeze({
          label: "AI-organized Wiki",
          title: "Turn raw sources into structured knowledge.",
          description:
            "AI analyzes uploaded material, produces readable summaries, extracts entities, and assembles related pages without replacing the original sources.",
          image: "/images/musuw-wiki-page.jpg",
          imageAlt: "musuw Wiki page with AI-generated summaries, entities, categories, and source links",
          bullets: Object.freeze([
            "AI summaries",
            "Entity extraction",
            "Structured Wiki pages",
            "Original sources preserved",
          ]),
        }),
      ]),
    }),
    benefits: Object.freeze({
      intro: Object.freeze({
        label: "Knowledge compounds",
        title: "Every useful answer can make your second brain better.",
        body:
          "Save strong AI answers back into the knowledge base, keep their evidence attached, and reuse them as higher-quality context the next time you ask.",
      }),
      items: Object.freeze([
        Object.freeze({
          title: "Save the answer",
          body: "Turn a useful response into a reusable knowledge source instead of losing it in chat history.",
        }),
        Object.freeze({
          title: "Keep the evidence",
          body: "Preserve the source passages and citations that make the saved knowledge trustworthy.",
        }),
        Object.freeze({
          title: "Refine the source",
          body: "Convert scattered material into clearer, denser knowledge that is easier to retrieve later.",
        }),
        Object.freeze({
          title: "Create new links",
          body: "Saved answers introduce new entities, backlinks, and relationships across the Wiki.",
        }),
        Object.freeze({
          title: "Reuse better context",
          body: "Future questions can draw on both original sources and the higher-quality knowledge you kept.",
        }),
        Object.freeze({
          title: "Grow with every project",
          body: "The system becomes more useful and more personal each time you research, ask, and save.",
        }),
      ]),
    }),
    pricing: Object.freeze({
      intro: Object.freeze({
        title: "Plans for every level of personal knowledge work",
        body:
          "Every plan includes grounded answers, exact citations, Wiki, graph, export, and deletion controls. Paid plans add more storage, video ingestion, and advanced models.",
      }),
      descriptions: Object.freeze([
        "Try the complete knowledge loop",
        "For a growing personal knowledge library",
        "For daily research and learning",
        "For intensive personal knowledge work",
      ]),
      features: Object.freeze([
        Object.freeze(["1 GiB storage", "Standard models", "Light AI usage", "Documents and notes"]),
        Object.freeze(["10 GiB storage", "Advanced models", "Regular AI usage", "Video ingestion"]),
        Object.freeze(["30 GiB storage", "Advanced models", "High AI usage", "Video ingestion"]),
        Object.freeze(["100 GiB storage", "Advanced models", "Highest AI usage", "Video ingestion"]),
      ]),
      checkoutNote: "Sign in to confirm localized pricing and choose the plan that fits your usage.",
      checkoutAction: "Choose plan",
    }),
    comparison: Object.freeze({
      title: "Compare plans",
      tableAria: "musuw plan comparison",
      firstColumn: "Capability",
      groupCopy: Object.freeze([
        Object.freeze({ title: "Capacity", rows: Object.freeze(["Storage", "Knowledge bases", "Documents per knowledge base"]) }),
        Object.freeze({ title: "Ingestion", rows: Object.freeze(["Document upload and parsing", "Video ingestion"]) }),
        Object.freeze({ title: "Models", rows: Object.freeze(["Model catalog", "Advanced models"]) }),
        Object.freeze({ title: "AI and answers", rows: Object.freeze(["Monthly AI usage", "Grounded answers", "Exact citations"]) }),
        Object.freeze({ title: "Connected knowledge", rows: Object.freeze(["Wiki", "Source history", "Knowledge graph"]) }),
        Object.freeze({ title: "Data controls", rows: Object.freeze(["Export", "Deletion controls"]) }),
      ]),
      valueLabels: Object.freeze({
        "$1.00": "Light",
        "$1.25": "Regular",
        "$2.50": "High",
        "$5.00": "Highest",
        "One least-cost model per capability": "Standard models",
        "Expanded platform-approved catalog": "Expanded catalog",
      }),
    }),
    blog: Object.freeze({
      title: "Built for knowledge that matters",
      allPosts: "Explore features",
      items: Object.freeze([
        Object.freeze({
          title: "Compare sources without losing the evidence.",
          author: "Researchers",
          date: "Cited synthesis",
          image: "/images/musuw-query-citation.jpg",
          alt: "research workflow with a multi-source answer and exact citations",
          href: "/#feature",
        }),
        Object.freeze({
          title: "Turn courses and notes into a study system.",
          author: "Students",
          date: "Living Wiki",
          image: "/images/musuw-wiki-page.jpg",
          alt: "student knowledge Wiki with summaries, entities, and related pages",
          href: "/#feature",
        }),
        Object.freeze({
          title: "Build a source-backed engine for every new idea.",
          author: "Creators and analysts",
          date: "Connected knowledge",
          image: "/images/musuw-wiki-graph.jpg",
          alt: "creator and analyst knowledge graph connecting sources and ideas",
          href: "/#feature",
        }),
      ]),
    }),
    faq: Object.freeze({
      label: "FAQ",
      title: "Questions before you start",
      body: "The essentials about sources, citations, models, limits, and control of your data.",
      items: Object.freeze([
        Object.freeze({
          question: "What can I add to musuw?",
          answer:
            "You can add notes and common document formats. Video ingestion is available on paid plans, and supported formats are shown before upload.",
        }),
        Object.freeze({
          question: "How do citations work?",
          answer:
            "Musuw retrieves from the knowledge base in scope and links important claims to the relevant source passage when supporting evidence is available.",
        }),
        Object.freeze({
          question: "Is my content used to train models?",
          answer:
            "Musuw does not claim ownership of your content. Model-provider processing follows the provider and model shown in the product; the current details are maintained in the Privacy Policy.",
        }),
        Object.freeze({
          question: "What is sent to model providers?",
          answer:
            "The request and relevant retrieved context needed to generate the response may be sent to the selected model provider, as described in the Privacy Policy.",
        }),
        Object.freeze({
          question: "What happens when I reach a plan limit?",
          answer:
            "Musuw shows the applicable limit and available upgrade options. Existing content remains subject to the account, retention, and data-control terms shown in the product and policies.",
        }),
        Object.freeze({
          question: "Can I export, delete, or cancel?",
          answer:
            "Musuw provides export and deletion controls, while subscription changes and cancellation are handled through the billing flow described in the Subscription Policy.",
        }),
      ]),
    }),
    finalCta: Object.freeze({
      title: "Build your AI knowledge base\nKeep your knowledge growing",
      body: "Bring your sources together. Find answers and build lasting knowledge.",
      action: "Build my knowledge base",
    }),
    footerGroups: Object.freeze([
      Object.freeze({ title: "Product", links: Object.freeze(["Features", "Examples", "Pricing"]) }),
      Object.freeze({ title: "Trust", links: Object.freeze(["FAQ", "Security", "Contact"]) }),
      Object.freeze({ title: "Legal", links: Object.freeze(["Terms", "Privacy", "Refunds"]) }),
    ]),
  }),
  zh: Object.freeze({
    navLabels: Object.freeze(["功能", "场景", "定价", "安全", "联系"]),
    meta: Object.freeze({
      title: "musuw｜一个会解释自己的第二大脑",
      description: "向你的知识提问，核验答案背后的精确原文，并让 AI 把资料整理成持续成长的 Wiki 与知识图谱。",
    }),
    hero: Object.freeze({
      eyebrow: "基于证据的第二大脑",
      titleLine1: "一个会解释自己的",
      titleLine2: "第二大脑。",
      descriptionLine1: "向你的知识提问，查看重要结论背后的精确原文，",
      descriptionLine2: "再让 AI 把资料整理成持续成长的 Wiki 与知识图谱。",
      getStarted: "建立我的知识库",
      talkToSales: "查看场景",
      dashboardAlt: "展示有依据问答、精确引用、Wiki 与知识图谱的 musuw 产品操作视频",
    }),
    features: Object.freeze({
      intro: Object.freeze({
        label: "核心能力",
        title: "提问、整理，并连接你掌握的知识。",
        body: "Musuw 把基于资料的 AI 问答、AI 自动整理的 Wiki 和知识图谱放进同一个个人知识系统。",
      }),
      items: Object.freeze([
        Object.freeze({
          label: "有依据的回答",
          title: "向你的知识提问，并核验每个重要结论。",
          description: "智能体只围绕当前知识库回答，并在工作侧栏中持续展示引用、检索原文、实体和对话上下文。",
          image: "/images/musuw-query-citation.jpg",
          imageAlt: "带精确知识库引用和详细证据侧栏的 musuw 智能体回答",
          bullets: Object.freeze(["知识库 RAG", "精确原文引用", "证据侧栏", "连续对话上下文"]),
        }),
        Object.freeze({}),
        Object.freeze({
          label: "知识图谱",
          title: "发现隐藏在知识中的紧密连接。",
          description: "Musuw 会发掘反向链接、共享实体、跨资料引用和证据路径，让零散文件形成一个相互连接的知识系统。",
          image: "/images/musuw-wiki-graph.jpg",
          imageAlt: "展示反向链接、关联实体和跨资料关系的 musuw 知识图谱",
          bullets: Object.freeze(["反向链接", "实体关系", "跨资料连接", "有证据的路径"]),
        }),
        Object.freeze({
          label: "AI 整理的 Wiki",
          title: "把原始资料整理成结构化知识。",
          description: "AI 会分析上传内容、生成可读摘要、提取实体并组织关联页面，同时保留原始资料不被覆盖。",
          image: "/images/musuw-wiki-page.jpg",
          imageAlt: "包含 AI 摘要、实体、分类和资料链接的 musuw Wiki 页面",
          bullets: Object.freeze(["AI 摘要", "实体提取", "结构化 Wiki 页面", "保留原始资料"]),
        }),
      ]),
    }),
    benefits: Object.freeze({
      intro: Object.freeze({
        label: "知识复利",
        title: "每一个有用答案，都能让第二大脑变得更强。",
        body: "把高质量 AI 回答重新保存进知识库，保留对应证据，并在下一次提问时把它作为更优质的上下文继续使用。",
      }),
      items: Object.freeze([
        Object.freeze({ title: "保存答案", body: "把有用回答变成可复用的知识来源，而不是遗失在对话历史里。" }),
        Object.freeze({ title: "保留证据", body: "让资料原文和引用始终跟随保存后的知识，维持可信度。" }),
        Object.freeze({ title: "提炼资料", body: "把分散材料转化为更清晰、更高密度、也更容易再次检索的知识。" }),
        Object.freeze({ title: "建立新连接", body: "保存后的答案会为 Wiki 带来新的实体、反向链接和关系。" }),
        Object.freeze({ title: "复用更好上下文", body: "未来提问可以同时利用原始资料和已经沉淀的高质量知识。" }),
        Object.freeze({ title: "随项目持续成长", body: "每次研究、提问和保存，都会让系统更有用，也更像你。" }),
      ]),
    }),
    pricing: Object.freeze({
      intro: Object.freeze({
        title: "适合不同使用强度的个人知识方案",
        body: "所有方案都包含有依据的回答、精确引用、Wiki、图谱、导出与删除；付费方案提供更多存储、视频导入和高级模型。",
      }),
      descriptions: Object.freeze([
        "体验完整的知识闭环",
        "适合持续增长的个人知识库",
        "适合日常研究与学习",
        "适合高强度个人知识工作",
      ]),
      features: Object.freeze([
        Object.freeze(["1 GiB 存储空间", "标准模型", "轻量 AI 使用", "文档和笔记"]),
        Object.freeze(["10 GiB 存储空间", "高级模型", "常规 AI 使用", "视频导入"]),
        Object.freeze(["30 GiB 存储空间", "高级模型", "高频 AI 使用", "视频导入"]),
        Object.freeze(["100 GiB 存储空间", "高级模型", "最高 AI 使用量", "视频导入"]),
      ]),
      checkoutNote: "登录后确认本地化价格，并选择与你使用强度匹配的方案。",
      checkoutAction: "选择方案",
    }),
    comparison: Object.freeze({
      title: "方案对比",
      tableAria: "musuw 套餐对比",
      firstColumn: "能力",
      groupCopy: Object.freeze([
        Object.freeze({ title: "容量", rows: Object.freeze(["存储空间", "知识库数量", "每个知识库的文档数"]) }),
        Object.freeze({ title: "资料导入", rows: Object.freeze(["文档上传与解析", "视频导入"]) }),
        Object.freeze({ title: "模型", rows: Object.freeze(["模型目录", "高级模型"]) }),
        Object.freeze({ title: "AI 与回答", rows: Object.freeze(["每月 AI 使用量", "有依据的回答", "精确引用"]) }),
        Object.freeze({ title: "相互连接的知识", rows: Object.freeze(["Wiki", "资料历史", "知识图谱"]) }),
        Object.freeze({ title: "数据控制", rows: Object.freeze(["导出", "删除控制"]) }),
      ]),
      valueLabels: Object.freeze({
        "$1.00": "轻量",
        "$1.25": "常规",
        "$2.50": "高频",
        "$5.00": "最高",
        "One least-cost model per capability": "标准模型",
        "Expanded platform-approved catalog": "扩展模型目录",
      }),
    }),
    blog: Object.freeze({
      title: "适合真正重要的知识工作",
      allPosts: "查看功能",
      items: Object.freeze([
        Object.freeze({
          title: "对比多份资料，同时不丢失证据。",
          author: "研究者",
          date: "带引用综合分析",
          image: "/images/musuw-query-citation.jpg",
          alt: "包含多资料回答和精确引用的研究工作流",
          href: "/#feature",
        }),
        Object.freeze({
          title: "把课程和笔记变成自己的学习系统。",
          author: "学生",
          date: "持续更新的 Wiki",
          image: "/images/musuw-wiki-page.jpg",
          alt: "包含摘要、实体和关联页面的学生知识 Wiki",
          href: "/#feature",
        }),
        Object.freeze({
          title: "为每个新想法建立有资料支持的知识引擎。",
          author: "创作者与分析者",
          date: "相互连接的知识",
          image: "/images/musuw-wiki-graph.jpg",
          alt: "连接资料与想法的创作者和分析者知识图谱",
          href: "/#feature",
        }),
      ]),
    }),
    faq: Object.freeze({
      label: "常见问题",
      title: "开始前的常见问题",
      body: "关于资料、引用、模型、套餐限制和数据控制的必要说明。",
      items: Object.freeze([
        Object.freeze({
          question: "可以向 musuw 添加什么？",
          answer: "你可以添加笔记和常见文档格式。付费方案支持视频导入，上传前会显示当前支持的格式。",
        }),
        Object.freeze({
          question: "引用如何生成？",
          answer: "Musuw 会在当前知识库范围内检索，并在存在支持证据时，把重要结论连接到相关原文段落。",
        }),
        Object.freeze({
          question: "我的内容会被用于训练模型吗？",
          answer: "Musuw 不主张拥有你的内容。模型服务商如何处理数据，取决于产品中显示的服务商与模型；当前说明会持续维护在隐私政策中。",
        }),
        Object.freeze({
          question: "哪些内容会发送给模型服务商？",
          answer: "生成回答所需的请求和相关检索上下文可能会发送给所选模型服务商，具体范围见隐私政策。",
        }),
        Object.freeze({
          question: "达到套餐上限后会怎样？",
          answer: "Musuw 会显示对应限制和可用升级选项；现有内容仍受产品中展示的账号、保留和数据控制规则约束。",
        }),
        Object.freeze({
          question: "可以导出、删除或取消订阅吗？",
          answer: "Musuw 提供导出和删除控制；订阅变更与取消通过订阅政策中说明的计费流程完成。",
        }),
      ]),
    }),
    finalCta: Object.freeze({
      title: "建立你的 AI 知识库\n让知识持续积累",
      body: "汇集资料，随时提问，让知识持续积累。",
      action: "建立我的知识库",
    }),
    footerGroups: Object.freeze([
      Object.freeze({ title: "产品", links: Object.freeze(["功能", "场景", "定价"]) }),
      Object.freeze({ title: "信任", links: Object.freeze(["常见问题", "安全", "联系"]) }),
      Object.freeze({ title: "法律", links: Object.freeze(["服务条款", "隐私", "退款"]) }),
    ]),
  }),
});

function mergeItems(items = [], overrides = []) {
  return items.map((item, index) => ({
    ...item,
    ...(overrides[index] ?? {}),
  }));
}

export function applyHomepagePlanPresentation(copy) {
  const localeKey = copy?.pricing?.currencyCode === "CNY" ? "zh" : "en";
  const content = HOMEPAGE_COPY[localeKey];

  return {
    ...copy,
    meta: {
      ...copy.meta,
      ...content.meta,
    },
    nav: {
      ...copy.nav,
      items: content.navLabels.map((label, index) => ({
        ...(copy.nav.items[index] ?? {}),
        label,
      })),
    },
    hero: {
      ...copy.hero,
      ...content.hero,
    },
    features: {
      ...copy.features,
      intro: {
        ...copy.features.intro,
        ...content.features.intro,
      },
      items: mergeItems(copy.features.items, content.features.items),
    },
    benefits: {
      ...copy.benefits,
      intro: {
        ...copy.benefits.intro,
        ...content.benefits.intro,
      },
      items: mergeItems(copy.benefits.items, content.benefits.items),
    },
    pricing: {
      ...copy.pricing,
      intro: {
        ...copy.pricing.intro,
        ...content.pricing.intro,
      },
      plans: copy.pricing.plans.map((plan, index) => ({
        ...plan,
        description: content.pricing.descriptions[index],
        features: [...content.pricing.features[index]],
      })),
      checkout: {
        ...copy.pricing.checkout,
        note: content.pricing.checkoutNote,
        action: content.pricing.checkoutAction,
      },
    },
    comparison: {
      ...copy.comparison,
      title: content.comparison.title,
      tableAria: content.comparison.tableAria,
      firstColumn: content.comparison.firstColumn,
      valueLabels: {
        ...copy.comparison.valueLabels,
        "1 GiB": "1 GiB",
        "10 GiB": "10 GiB",
        "30 GiB": "30 GiB",
        "100 GiB": "100 GiB",
        ...content.comparison.valueLabels,
      },
      groups: content.comparison.groupCopy.map((group) => ({
        title: group.title,
        rows: [...group.rows],
      })),
    },
    blog: {
      ...copy.blog,
      title: content.blog.title,
      allPosts: content.blog.allPosts,
      items: mergeItems(copy.blog.items, content.blog.items),
    },
    faq: {
      ...copy.faq,
      ...content.faq,
      items: [...content.faq.items],
    },
    finalCta: {
      ...copy.finalCta,
      ...content.finalCta,
    },
    footer: {
      ...copy.footer,
      groups: content.footerGroups.map((group) => ({
        title: group.title,
        links: [...group.links],
      })),
    },
  };
}
