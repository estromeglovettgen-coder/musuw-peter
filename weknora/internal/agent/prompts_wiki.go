package agent

// WikiTaxonomyPlanPrompt assigns a directory path (category) to every entity /
// concept page produced by ONE ingest batch in a single call, so the whole set
// lands on one coherent tree that reuses existing folders — instead of each page
// inventing its own folders in parallel (which diverges worst on the founding
// batch, when the KB still has no folders to anchor on). The result is applied
// in reduce only to pages that don't already have a category, so user edits and
// previously-filed pages are never churned.
const WikiTaxonomyPlanPrompt = `你负责将 Wiki 知识库整理成导航目录。请为下列每个条目分配一个目录路径（category），让全部条目组成同一棵结构一致的目录树。

<existing_folders>
{{.ExistingTaxonomy}}
</existing_folders>

<items>
{{.Items}}
</items>

<instructions>
为每个条目输出一个从宽泛到具体的文件夹名称数组，最多 2 层。分类依据是条目本质上是什么，即它长期所属的稳定主题，而不是它在某一份文档中的角色。

选择路径的方法：
1. 如果 <existing_folders> 中已有适合的文件夹，必须逐字复用其名称，不能另建同义文件夹。例如已有“春节 / 传统习俗”时，不要再建“春节习俗”。
2. 如果没有适合的现有文件夹，请新建宽泛、稳定的文件夹，例如组织归入“组织”、法律思想归入“法律概念”、位置归入“地点”。目录不必刻意保持很小；多数条目都有自然归属，应建立合理的一级文件夹，而不是不归类。同类条目必须放入同一新文件夹，保持目录一致。
3. 只有条目确实不属于任何稳定主题时才输出空路径 []，这种情况应很少见。缺少现有匹配文件夹不是输出 [] 的理由，应新建文件夹。

其他规则：
- 同类条目放在同一文件夹、同一深度。不能把等价条目放得比其他条目更深，例如不要同时出现“地点 / 地址 / Address1”和“地点 / Address2”。
- 优先使用一个宽泛的一级文件夹；只有多个条目共享稳定的子领域时才增加第二级。
- 不得把条目类型（"entity"/"concept"）作为文件夹名，单个名称中不得包含斜杠。
- <items> 中的每个 slug 必须在输出中恰好出现一次。
- 全部文件夹名称使用 {{.Language}}。

### JSON 格式规则
- 只输出有效 JSON，不要前言。
- JSON 字符串值中不得包含未转义的换行。
</instructions>

输出格式：
{
  "assignments": [
    {"slug": "entity/zhang-san", "path": ["人物"]},
    {"slug": "concept/spring-festival", "path": ["节日", "传统节日"]}
  ]
}`

// Wiki ingest prompt templates for LLM-powered wiki page generation.
// These prompts are used by the wiki ingest pipeline to extract structured
// knowledge from raw documents and build/update wiki pages.

// WikiSummaryPrompt generates a summary page for a newly ingested document.
//
// Filename and title are intentionally NOT passed to the LLM: documents
// uploaded to WeKnora often carry filenames that say nothing about the
// content (e.g. scanned PDFs named after the scanner model "MX5280.pdf"),
// and feeding such filenames to the model invites hallucinated summaries
// when the actual extracted content is thin. The model must rely solely on
// the document content provided below.
const WikiSummaryPrompt = `你是一名 Wiki 编辑。请根据下面的文档内容生成结构化的 Markdown 格式 Wiki 摘要页。

<document>
<content>
{{.Content}}
</content>
</document>

<available_wiki_pages>
{{.ExtractedSlugs}}
</available_wiki_pages>

<instructions>
内容范围优先级：业务指令明确限定要记录的内容时，只总结该范围内有来源依据的信息。该范围优先于下方默认的全面性、章节组织和长度建议，不得为补齐章节或字数加入范围外内容。输出协议、有效链接、图片 URL 和事实真实性规则仍必须遵守。
1. 输出第一行必须为：SUMMARY: {用一句话概括文档主题，15—40 词，用于 Wiki 索引展示}
2. SUMMARY 行之后，使用 Markdown 总结文档；未指定更具体的内容范围时，全面总结文档。
3. 包含指定范围内的关键事实、论点和结论。
4. 使用合理的标题层级（章节用 ##，小节用 ###）。
5. **Wiki 链接规则**：available_wiki_pages 将 slug 对应到显示名称和别名，格式为“[[slug]] = 显示名称 (Aliases: a, b)”。提到匹配该列表的名称或别名时，必须写成 [[slug|显示名称]]（例如 [[entity/zhong-guo|中国]]），不得用加粗名称或不带显示名称的 [[slug]] 替代。必须使用提供的原始 slug，不得创造 slug。
6. **图片规则**：若文档包含 <images> 和 <image>，应使用 Markdown ![说明](url) 将相关图片放在相应文字附近。URL 是不可拆分的原始值，必须逐字复制，不得修改、缩短或规范化。
7. 未指定更具体的输出组织要求时，末尾加入“## 核心要点”一节，使用项目符号；不得因此重复或扩大限定内容范围。
8. 使用 {{.Language}} 写作。
9. 摘要应简洁而充分，默认按文档长度写 500—1500 词；限定范围只需少量内容时按实际需要缩短，不得凑字数。
10. **空内容规则**：如果 <content> 为空、只有图片引用而没有提取文字，或没有实质信息，第一行必须为“SUMMARY: 无法从该文档提取文字内容。”，随后简要说明无法总结文档。不得创造主题或根据其他线索猜测。
</instructions>

先输出 SUMMARY 行，再输出 Markdown 内容，不要其他前言。`

// WikiKnowledgeExtractPrompt extracts both entities and concepts in a single LLM call.
// Returns a JSON object with "entities" and "concepts" arrays.
// This replaces the former separate WikiEntityExtractPrompt and WikiConceptExtractPrompt.
const WikiKnowledgeExtractPrompt = `你是知识提取系统。请分析下面的文档，提取业务指令指定范围内的重要实体和关键概念；未限定范围时提取全部重要实体和关键概念。

<document>
<content>
{{.Content}}
</content>
</document>

<previous_slugs>
{{.PreviousSlugs}}
</previous_slugs>

<instructions>
返回包含 "entities" 和 "concepts" 两个数组的 JSON 对象。
**重要：全部名称、描述和详情使用 {{.Language}}。**

如果 <content> 为空、只有图片引用而没有提取文字，或没有实质信息，返回 {"entities": [], "concepts": []}。不得从其他来源创造实体或概念。

### Slug 连续性规则
如果上方提供了历史 slug：
- 历史提取的实体或概念仍在文档中时，必须复用其原始 slug，不得为同一对象生成新 slug。
- 已不在文档中出现的实体或概念不得包含在输出中。
- 只有确实新增、历史列表中没有的实体或概念才能生成新 slug。
- 保证文档更新前后的 slug 稳定。

### 实体（人物、组织、产品、地点、技术、事件等）
每个实体包含：
- "name"：{{.Language}} 的可读实体名称。
- "slug"：适用于 URL 的标识，格式 "entity/<lowercase-hyphenated-name>"，非拉丁文字名称使用拼音或罗马化形式。以前提取过的实体必须复用历史 slug。
- "aliases"：指向完全相同实体的名称数组。仅包括正式缩写（如 IBM）、全称和简称（如“地底人”与“地底人控股有限公司”）、译名（如 Apple 与“苹果公司”）、常见别称（如 Alphabet 与“Google母公司”）。不得包含上位分类、相关产品、泛称或更宽泛的概念；没有别名时为 []。
- "description"：索引摘要，使用 {{.Language}} 写一句 15—40 词的句子，描述该实体是什么及其在文档中的角色。必须独立可理解，无需阅读全文，将显示在 Wiki 索引中。
- "details"：使用 {{.Language}} 写 2—5 句，总结文档中的关键事实。若 <images> 中有相关 <image>，可用 Markdown ![说明](url) 引入；URL 必须逐字复制，不得修改、缩短或规范化。

只提取得到实质讨论的实体，即至少提及两次或有详细描述；不得提取泛称。

### 概念（主题、方法、理论等）
每个概念包含：
- "name"：{{.Language}} 的可读概念名称。
- "slug"：适用于 URL 的标识，格式 "concept/<lowercase-hyphenated-name>"，非拉丁文字名称使用拼音或罗马化形式。以前提取过的概念必须复用历史 slug。
- "aliases"：指向完全相同概念的名称数组。仅包括正式缩写（如 RAG）、全称和简称，以及领域内可互换的常见同义词。不得包含子主题、相关技术、上位分类或实现细节；没有别名时为 []。
- "description"：索引摘要，使用 {{.Language}} 写一句 15—40 词的句子，定义该概念是什么。必须独立可理解，将显示在 Wiki 索引中。
- "details"：使用 {{.Language}} 写 2—5 句，解释文档中的概念。若 <images> 中有相关 <image>，可用 Markdown ![说明](url) 引入；URL 必须逐字复制，不得修改、缩短或规范化。

只提取得到实质讨论的概念，跳过琐碎或过于宽泛的概念。

### 去重规则
- 具体有名称的对象（人物、公司、产品、地点）只能放入 "entities"。
- 抽象思想、方法或理论只能放入 "concepts"。
- 两个数组中不得重复同一条目。

### JSON 格式规则
- **关键**：JSON 字符串值中不得使用未转义换行，需要换行时必须使用转义序列 \n。
</instructions>

只输出有效 JSON。示例：
{
  "entities": [
    {
      "name": "Acme 公司",
      "slug": "entity/acme-corp",
      "aliases": ["Acme", "Acme Corporation"],
      "description": "一家专注于人工智能解决方案的科技公司。",
      "details": "Acme 公司成立于 2020 年，现有 500 名员工。公司专注于企业人工智能产品，近期推出其旗舰 RAG 平台。"
    }
  ],
  "concepts": [
    {
      "name": "检索增强生成",
      "slug": "concept/retrieval-augmented-generation",
      "aliases": ["RAG"],
      "description": "将信息检索和语言模型生成相结合的技术。",
      "details": "RAG 先通过向量相似性搜索从知识库检索相关文档，再将文档作为上下文提供给语言模型生成回答。"
    }
  ]
}`

// WikiCandidateSlugPrompt (Pass 0 of the chunk-cited pipeline) asks the LLM to
// scan a document and output the SKELETON of all entities/concepts it contains:
// name, slug, aliases, a short description, and a short details tiebreaker.
// The heavy lifting — linking each slug to concrete supporting chunks — is
// done in a second pass (see WikiChunkCitationPrompt). Because this prompt no
// longer has to carry full facts per item, it stays cheap even for long docs.
const WikiCandidateSlugPrompt = `你是知识提取系统。请分析下面的文档，将业务指令指定范围内的重要实体和关键概念列为轻量候选集；未限定范围时列出全部重要实体和关键概念。后续阶段会为每个条目关联具体的来源片段，此时无需为每个条目写出全部事实。

<document>
<content>
{{.Content}}
</content>
</document>

<previous_slugs>
{{.PreviousSlugs}}
</previous_slugs>

<instructions>
返回包含 "entities" 和 "concepts" 两个数组的 JSON 对象。
**重要：全部名称、描述和详情使用 {{.Language}}。**

如果 <content> 为空、只有图片引用而没有提取文字，或没有实质信息，返回 {"entities": [], "concepts": []}。不得从其他来源创造实体或概念。

### 提取范围（颗粒度：{{.Granularity}}）
业务指令限定的内容范围优先于默认颗粒度建议，不能为了达到覆盖率或数量目标提取范围外信息；JSON、slug、链接和来源真实性规则保持不变。
{{.GranularityGuidance}}

### Slug 连续性规则
如果上方提供了历史 slug：
- 历史实体或概念仍在文档中时，必须复用其原始 slug，不得为同一对象生成新 slug。
- 已不在文档中出现的实体或概念不得包含在输出中。
- 只有确实新增、历史列表中没有的实体或概念才能生成新 slug。
- 保证文档更新前后的 slug 稳定。

### 实体（人物、组织、产品、地点、技术、事件等）
每个实体包含：
- "name"：{{.Language}} 的可读实体名称。
- "slug"：适用于 URL 的标识，格式 "entity/<lowercase-hyphenated-name>"，非拉丁文字名称使用拼音或罗马化形式。以前提取过的实体必须复用历史 slug。
- "aliases"：指向完全相同实体的名称数组。仅包括正式缩写（如 IBM）、全称和简称（如“地底人”与“地底人控股有限公司”）、译名、常见别称。不得包含上位分类、相关产品、泛称或更宽泛的概念；没有别名时为 []。
- "description"：索引摘要，使用 {{.Language}} 写一句 15—40 词的句子，描述实体是什么及其在文档中的角色。必须独立可理解，将显示在 Wiki 索引中。
- "details"：使用 {{.Language}} 写 1—3 句的简短备用摘要，仅在下游片段引用失败时使用，不必详尽，少于 300 字符。

遵循上述提取范围，不得把仅被顺带提及的名称升级为实体。

### 概念（主题、方法、理论等）
每个概念包含：
- "name"：{{.Language}} 的可读概念名称。
- "slug"：适用于 URL 的标识，格式 "concept/<lowercase-hyphenated-name>"，非拉丁文字名称使用拼音或罗马化形式。以前提取过的概念必须复用历史 slug。
- "aliases"：指向完全相同概念的名称数组。仅包括正式缩写（如 RAG）、全称和简称，以及领域内可互换的常见同义词。不得包含子主题、相关技术、上位分类或实现细节；没有别名时为 []。
- "description"：索引摘要，使用 {{.Language}} 写一句 15—40 词的句子，定义概念是什么，必须独立可理解。
- "details"：使用 {{.Language}} 写 1—3 句的简短备用摘要，少于 300 字符。

遵循上述提取范围，跳过只点名而没有讨论的概念。

### 去重规则
- 具体有名称的对象（人物、公司、产品、地点）只能放入 "entities"。
- 抽象思想、方法或理论只能放入 "concepts"。
- 两个数组中不得重复同一条目。

### JSON 格式规则
- **关键**：JSON 字符串值中不得使用未转义换行，需要换行时必须使用转义序列 \n。
</instructions>

只输出有效 JSON。示例：
{
  "entities": [
    {
      "name": "Acme 公司",
      "slug": "entity/acme-corp",
      "aliases": ["Acme", "Acme Corporation"],
      "description": "一家专注于人工智能解决方案的科技公司。",
      "details": "成立于 2020 年，专注于企业人工智能产品。"
    }
  ],
  "concepts": [
    {
      "name": "检索增强生成",
      "slug": "concept/retrieval-augmented-generation",
      "aliases": ["RAG"],
      "description": "将信息检索和语言模型生成相结合的技术。",
      "details": "先检索文档，再作为上下文提供给语言模型。"
    }
  ]
}`

// WikiChunkCitationPrompt (Pass 1..N of the chunk-cited pipeline) asks the LLM
// to read a batch of chunks and, for each candidate entity/concept, list the
// chunk IDs that substantively discuss it. This keeps per-slug "facts" in
// their verbatim form (the chunk text) instead of asking the LLM to paraphrase.
// Block order matters for provider prefix caching: the static rules,
// output schema and the per-document-stable <candidate_slugs> are placed
// BEFORE the per-batch <chunks> block. Within one document only ChunksXML
// changes between batches, so every batch after the first shares the long
// [rules | candidate_slugs] prefix and avoids re-billing the static rules.
const WikiChunkCitationPrompt = `你是精确的来源引用系统。请检查一批文档片段，为下面的每个候选实体或概念判断哪些片段对其有实质讨论。

<instructions>
**重要：全部名称、描述和详情使用 {{.Language}}。**

### 主要任务
为 <candidate_slugs> 中的每个候选 slug 选择 <chunks> 中实质讨论该实体或概念的片段 ID。“实质讨论”是指至少陈述一项关于该候选的具体事实、属性、步骤、日期、数字、关系或其他有用信息，而不是顺带提及。

- 只能引用下面 <chunks> 中出现的片段。
- 逐字使用每个 <c> 元素的 "id" 属性（例如 "c003"）。
- 候选在本批任何片段中都没有得到实质讨论时，从输出中省略，不要输出空数组。
- 一个片段确实讨论多个候选时，可以被多个候选引用。
- 即使片段很长或混合无关主题，也应为它实质讨论的每个候选引用该片段。

### 次要任务：新增 slug
如果本批出现 <candidate_slugs> 中没有的重要实体或概念，可将其加入 "new_slugs"。只加入确实新增且得到实质讨论的条目。不得重复发现已有候选；已有候选必须复用其 slug。

每个新增 slug 必须包含：
- "type"："entity" 或 "concept"
- "name"、"slug"、"aliases"、"description"、"details"，含义与候选列表一致
- "source_chunks"：本批实质讨论该条目的片段 ID 列表

### JSON 格式规则
- **关键**：JSON 字符串值中不得使用未转义换行，需要换行时使用 \n。
- 只输出有效 JSON，不要前言。
</instructions>

输出格式：
{
  "citations": {
    "entity/xxx": ["c001", "c003"],
    "concept/yyy": ["c002"]
  },
  "new_slugs": [
    {
      "type": "entity",
      "name": "示例",
      "slug": "entity/example",
      "aliases": [],
      "description": "...",
      "details": "...",
      "source_chunks": ["c005"]
    }
  ]
}

如果本批没有值得引用的内容，返回：{"citations": {}, "new_slugs": []}

<candidate_slugs>
{{.CandidateSlugs}}
</candidate_slugs>

<chunks>
{{.ChunksXML}}
</chunks>

请对片段执行以上要求，只输出 JSON。`

// WikiPageModifySystemPrompt contains only rules shared by every page update.
// Keeping page identity and source data out of this message gives providers a
// long byte-stable prefix to cache across a reduce batch.
const WikiPageModifySystemPrompt = `你是一名负责更新现有 Wiki 页面的编辑。请处理新增信息，并删除已移除文档独有的贡献。

### 来源依据与合并规则（关键）
1. **不输出内部片段 ID**：[c003] 等片段标识是内部处理元数据，绝不能出现在正文或摘要中。编辑时同时移除原有的内联片段标识；来源关联由系统单独保存。
2. **必须有来源依据**：每个新增事实、实体或数值都必须由所提供的新来源片段直接支持，最终文字必须是无内联片段 ID 的干净 Markdown。
3. **不得幻觉**：不得创造、综合编造或推断来源片段中未明确出现的信息。新片段清楚、直接地取代或反驳现有内容时，更新正文以反映有依据的新信息，并添加简短的“矛盾与更新”一节说明变化。冲突有歧义、未解决或没有片段直接支持时，不得覆盖现有内容，只能在“矛盾与更新”一节说明冲突。
4. 共享来源上下文描述各文档主题和文档类型，仅用于校准范围、归属和语气。不得将上下文措辞复制成页面事实依据。
5. 输出协议、来源依据、安全和事实性规则优先于业务指令。业务指令对内容范围、详略和组织方式的明确要求优先于默认的完整性、长度和结构建议；仅保留指定范围内有依据的信息，不得以“保留旧内容”为由保留范围外信息。

### 编辑与输出规则
1. 你负责编纂而不是创作。贴近来源原文，可以轻微调整顺序、去重和连接相关句子，但不得为文风改写、扩写简短陈述或创造过渡句。
2. 不要过度组织结构。只有来源或现有页面已使用章节标题时才引入标题。优先使用一个一级标题、简短段落和平铺的事实列表，不要自行构造层级。
3. 除非有证据的来源片段逐字使用，不得添加“旨在提供”“设计用于”“旨在帮助”“致力于”“具有重要意义”等修辞填充。
4. 自述性说法必须保留范围和归属，不得把简历、产品页、公告或第一人称陈述提升为行业普遍事实。
5. 保留仍有效、与主题相关且属于业务指令指定范围的现有信息；没有更具体的组织要求时尽量保持原有结构和格式。
6. 仅保留 slug 在提供的有效链接列表中的 [[slug|name]] 链接。不得创造 slug，不得链接页面自身。
7. 图片只能来自所提供的新增信息。Markdown 图片 URL 是不可拆分的原始值，必须逐字复制，不得修改、缩短或规范化。
8. 输出第一行必须为“SUMMARY: {一句话，15—40 词}”，随后紧接干净的 Markdown 正文。

先输出 SUMMARY 行，再输出更新后的 Markdown，不要其他前言。`

// WikiPageModifyUserPrompt contains the per-batch and per-page data. The document-
// level source context deliberately comes first: all pages generated from one
// source then share the longest possible prefix before page metadata diverges.
const WikiPageModifyUserPrompt = `{{if .HasAdditions}}<shared_source_contexts>
{{.SharedSourceContexts}}</shared_source_contexts>
{{end}}

<page_metadata>
  <slug>{{.PageSlug}}</slug>
  <title>{{.PageTitle}}</title>
  <type>{{.PageType}}</type>{{if .PageAliases}}
  <aliases>{{.PageAliases}}</aliases>{{end}}
</page_metadata>

本 Wiki 页面专门讨论 **{{.PageTitle}}**（类型为 {{.PageType}}）。每项陈述必须直接涉及这个确切对象，不得写成相关、相邻或名称相似的其他对象。

<existing_page_content>
{{.ExistingContent}}
</existing_page_content>

{{if .HasAdditions}}
<new_information>
{{.NewContent}}
</new_information>

上方 <new_information> 由已确认直接支持本页面的来源片段原文组成。前方 <shared_source_contexts> 仅提供背景，不是事实证据。
{{end}}

{{if .HasRetractions}}
<deleted_documents>
{{.DeletedContent}}
</deleted_documents>

<remaining_source_documents>
{{.RemainingSourcesContent}}
</remaining_source_documents>
{{end}}

<valid_wiki_links>
{{.AvailableSlugs}}
</valid_wiki_links>

<instructions>
1. 输出第一行必须为：SUMMARY: {用一句 15—40 词的句子概括更新后页面主题，用于 Wiki 索引展示}
{{if .HasRetractions}}
2. 删除仅来自 <deleted_documents>、且在任何 <remaining_source_documents> 或 <new_information> 中均不存在的事实和说法。
{{end}}
{{if .HasAdditions}}
3. 将 <new_information> 中的事实加入并合并到页面，负责编纂而不是创作：
   - **关键冲突检查**：先确认新信息确实涉及 <page_metadata> 声明的 **{{.PageTitle}}**。如果内容明显属于不同但相关的对象（如页面是“混元模型”，新信息却是“Qwen3”；或页面是“居民身份证”，新信息却是“工作居住证”），必须拒绝该部分，不能加入。
   - 确实涉及 {{.PageTitle}} 且与旧内容冲突时，优先采用较新的信息。
{{end}}
4. 保留仍有效、仍涉及 {{.PageTitle}} 且属于业务指令指定范围的现有内容。
5. 只保留 slug 出现在 <valid_wiki_links> 中的 [[slug|name]]。移除不在列表中的链接，不得创造新 slug。本页面自己的 slug（{{.PageSlug}}）不能成为正文中的 [[...]] 链接。
6. 没有更具体的业务组织要求时保持现有页面结构和格式；原本没有一级标题时使用“# {{.PageTitle}}”。不得为默认结构增加指定内容范围外的信息或无依据的标题层级。
{{if .HasRetractions}}
7. 删除内容后页面近乎为空且没有新增信息时，只输出：“SUMMARY: （空页面）\n# {{.PageTitle}}\n\n*该页面的主要来源文档已移除。*”。
{{end}}
8. 使用 {{.Language}} 写作。
</instructions>

先输出 SUMMARY 行，再输出更新后的 Markdown，不要其他前言。`

// WikiIndexIntroPrompt generates the introduction for a NEW index page (first time only).
const WikiIndexIntroPrompt = `你是一名 Wiki 编辑。请为 Wiki 知识库索引页写简短介绍。

<document_summaries>
{{.DocumentSummaries}}
</document_summaries>

<instructions>
1. 标题行以“# ”开头，反映知识领域。
2. 根据上方文档摘要，用 2—3 句说明本 Wiki 覆盖哪些内容。
3. 保持简洁，这只是页首介绍，目录列表稍后会单独加入。
4. 使用 {{.Language}} 写作。
</instructions>

只输出标题和介绍段落，不要生成目录列表或页面链接。`

// WikiIndexIntroUpdatePrompt incrementally updates an existing index introduction.
const WikiIndexIntroUpdatePrompt = `你是一名 Wiki 编辑。请更新 Wiki 索引页的介绍，反映最近变化。

<current_introduction>
{{.ExistingIntro}}
</current_introduction>

<changes>
{{.ChangeDescription}}
</changes>

<document_summaries>
{{.DocumentSummaries}}
</document_summaries>

<instructions>
1. 更新介绍，准确反映 Wiki 当前状态。
2. 新增文档显著改变范围时，说明新增主题。
3. 已移除文档对应的主题不再适用时，移除相关描述。
4. 保持原有语气、风格和标题格式。
5. 保持简洁：1 行标题加 2—3 句介绍。
6. 使用 {{.Language}} 写作。
</instructions>

只输出更新后的标题和介绍段落，不要生成目录列表或页面链接。`

// WikiDeduplicationPrompt asks the LLM to identify duplicate entities/concepts
// between newly extracted items and existing wiki pages.
const WikiDeduplicationPrompt = `你是严格的去重系统。下面是一组新增条目，每个条目携带它自己的一小组表面相似的现有 Wiki 页面（<candidates>）。请判断每个新增条目是否与它自己的某个候选指向完全相同的现实实体或概念。

<items>
{{.Candidates}}
</items>

<instructions>
### 如何阅读输入
每个 <item> 是新提取的实体或概念，其内部 <candidates> 是唯一允许合并到的现有页面。这些页面针对该条目预选；某个条目下的候选不能用于判断其他条目。

### 硬性约束：必须全部满足才能合并
- 目标 slug 必须来自同一个 <item> 内部的候选 <page>。绝不能合并到其他条目的候选，也不能创造 slug。
- 类型必须兼容：实体只能与实体合并，概念只能与概念合并，不能交叉。

### 合并标准：必须全部满足
1. 新条目和候选页面指向同一现实对象（同一个人、同一个组织、同一个具体概念）。
2. 差异只是名称形式：缩写与全称、译名或轻微拼写差异。

### 正确合并示例
- "Acme Corp" → "Acme Corporation"：同一公司的缩写。
- "RAG" → "Retrieval-Augmented Generation"：同一概念的缩写。
- “苹果公司” → "Apple Inc."：同一实体的译名。

### 错误合并示例：不得合并
- “混元模型” → “通义千问模型”：同类别的竞品是不同实体。
- "iPhone 15" → "Huawei Mate 60"：同类别的不同具体产品。
- "GPT-4" → "GPT-3.5"：不同产品版本属于不同实体。
- “人工智能安全” → “内容审核机制”：相关但不同的概念。
- “运动员注册” → “学位验证”：均涉及验证，但领域完全不同。
- “比赛分类” → “年龄组”：年龄组只是分类的一方面。
- “成绩标准” → “比赛轮次”：均与比赛相关，但概念不同。
- “机器学习” → “神经网络”：后者是前者的子集。
- “居民身份证” → “工作居住证”：均为政府证件，但证件完全不同。
- “驾驶证” → “行驶证”：均与车辆相关，但文档不同。
- “学位证” → “毕业证”：均为教育文档，但对象不同。

### 核心原则：相关 ≠ 相同
名称共享几个字符、同领域、同文档类别或同行业都不是合并理由。绝不能仅因同类别而合并不同产品、公司、版本或证件。无法确定时不要合并；同一对象保留两个页面远胜于错误合并不同对象。

返回包含 "merges" 映射的 JSON 对象，键为新增条目的 slug，值为要合并到的现有页面 slug。只包含高度确信为同一对象的条目。

没有匹配时返回：{"merges": {}}

### JSON 格式规则
- **关键**：JSON 字符串值中不得使用未转义换行，需要换行时必须使用转义序列 \n。
</instructions>

只输出有效 JSON。示例：
{"merges": {"entity/acme-corporation": "entity/acme-corp", "concept/rag": "concept/retrieval-augmented-generation"}}`

// Granularity guidance blocks injected into WikiCandidateSlugPrompt. The
// pipeline resolves a KnowledgeBase's configured granularity to one of these
// strings via WikiGranularityGuidance().
//
// The three levels form a spectrum from "only the document's main subjects"
// to "every named thing you see". Moving down the list monotonically
// increases the candidate slug count, the downstream chunk-citation cost,
// and the noise-to-signal ratio of the wiki index.
const (
	WikiGranularityGuidanceFocused = `**聚焦模式（FOCUSED）：严格精简。**
仅提取文档主要讨论的少量实体或概念。

包括：
- 文档的核心对象，例如简历中的本人和具名项目，公告中的发布组织和活动或产品，产品页中的产品及制造商。
- 实体和概念合计最多 3—7 项。

排除（即使明确点名）：
- 顺带提及的技术栈、库或框架，例如简历中列出的 Spring Boot、MySQL、Redis。
- 仅作为实现细节引用的通用概念或方法，例如微服务、异步处理、无状态认证、流式响应。
- 仅作为背景出现的地点、学校或组织，例如简历作者的毕业学校，除非文档本身讨论该学校。
- 内容不足、通常只能写一句描述的条目。

无法确定归属时省略。清晰、聚焦的索引比全面但嘈杂的索引更有价值。`

	WikiGranularityGuidanceStandard = `**标准模式（STANDARD）：平衡提取，默认使用。**
提取文档核心对象，以及得到实质讨论的实体或概念：具有专门段落、多个要点或至少 2—3 句上下文。

包括：
- 文档核心对象。
- 拥有具体内容块（段落、多要点列表或专门小节）的次要实体或概念。
- 文档解释如何使用某方法、架构或技术时，提取其具名条目；只点名时不提取。

排除：
- 只在逗号分隔技术列表中出现而没有进一步说明的条目。例如“技术栈：A、B、C、D”，除非各项在别处有专门段落，否则均不提取。
- 一次性提及、括号内引用和泛化的基础设施名词。
- 对文档的全部贡献可用一个短句概括的条目。

索引应紧凑、经过筛选。对边缘条目无法确定时，优先排除。`

	WikiGranularityGuidanceExhaustive = `**详尽模式（EXHAUSTIVE）：最大召回。**
提取每个具名实体和可识别概念，包括只点名一次的技术、工具、标准和方法；必须具体、常见，而非“数据库”“函数”等泛称。

包括：
- 全部主要和次要对象。
- 全部具名技术、库、框架、数据库、服务、协议或标准。
- 全部具有常用名称的概念和方法，例如 RAG、微服务、异步处理、SSE、JWT。

仅排除：
- 确实泛化的词语，例如“服务器”“函数”“数据”。
- 只在 URL 路径或参考文献中出现的条目。

知识库用作技术词汇表而不是经过筛选的叙述型 Wiki 时，使用此模式。`
)

// WikiGranularityGuidance returns the guidance text to inject into the
// WikiCandidateSlugPrompt template for the given granularity. Accepts the
// raw string value stored in WikiConfig.ExtractionGranularity; callers do
// NOT need to Normalize() first — unknown values fall through to standard.
func WikiGranularityGuidance(granularity string) string {
	switch granularity {
	case "focused":
		return WikiGranularityGuidanceFocused
	case "exhaustive":
		return WikiGranularityGuidanceExhaustive
	default:
		return WikiGranularityGuidanceStandard
	}
}
