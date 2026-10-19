export function workspaceBrandCopy(text: string, fire: boolean): string {
  return fire ? text.replace(/(?<![\w./:@-])musuw(?![\w./:@-])|穆苏瓦/giu, '火种') : text
}

function brandMessageTree<T>(messages: T): T {
  if (typeof messages === 'string') return workspaceBrandCopy(messages, true) as T
  if (Array.isArray(messages)) return messages.map(value => brandMessageTree(value)) as T
  if (messages && typeof messages === 'object') {
    return Object.fromEntries(Object.entries(messages).map(([key, value]) => [key, brandMessageTree(value)])) as T
  }
  return messages
}

// Fire is a managed workspace. Reuse the native localized tours, but explain
// the user's workflow instead of model setup that is maintained by operators.
const FIRE_GUIDE_COPY = {
  'zh-CN': {
    ready: 'Taylor 和课程资料已准备好，可以直接开始对话。',
    chat: '直接描述你的问题，也可以添加图片或文件补充具体情况。',
    knowledge: '在这里查看课程资料，也可以整理和添加自己的文档。',
    agents: '默认使用泰勒，也可以创建自己的智能体，设置回答方式和参考资料。',
    settings: '点开头像可以查看套餐、剩余额度与账户设置。',
    done: '现在就开始对话，或打开课程资料看看。',
    picker: '在这里选择智能体和思考深度。',
    createAgent: '设置名称、回答规则和参考资料，即可创建自己的智能体。',
    knowledgeScope: '选择智能体可以参考哪些知识库，也可以暂不关联。',
    submitAgent: '确认名称和知识范围后，点击高亮的「创建」即可完成。',
    submitKb: '确认类型和名称后，点击高亮的「创建」按钮，然后添加资料。',
    notReady: '知识库暂未准备好，请联系管理员处理后重试。',
    resourceFailed: '配置加载失败，请稍后重试。',
    agentNotReady: '智能体暂未准备好，请联系管理员。',
  },
  'en-US': {
    ready: 'Taylor and the course materials are ready. Start a conversation whenever you like.',
    chat: 'Describe your question, or add an image or file for context.',
    knowledge: 'Read the course materials here, or organize and add your own documents.',
    agents: 'Taylor is selected by default. You can also create an agent with its own answer style and reference materials.',
    settings: 'Open your avatar menu to view your plan, remaining allowance, and account settings.',
    done: 'Start a conversation or explore the course materials.',
    picker: 'Choose an agent and reasoning depth here.',
    createAgent: 'Set a name, answer rules, and reference materials to create your own agent.',
    knowledgeScope: 'Choose which knowledge bases the agent can reference, or leave them unlinked for now.',
    submitAgent: 'Confirm the name and knowledge scope, then click the highlighted Create button.',
    submitKb: 'Confirm the type and name, click the highlighted Create button, then add your materials.',
    notReady: 'This knowledge base is not ready yet. Please contact your administrator and try again.',
    resourceFailed: 'Settings could not be loaded. Please try again later.',
    agentNotReady: 'The agent is not ready yet. Please contact your administrator.',
  },
  'ko-KR': {
    ready: 'Taylor와 강의 자료가 준비되었습니다. 바로 대화를 시작하세요.',
    chat: '질문을 입력하거나 이미지와 파일로 상황을 더 자세히 알려주세요.',
    knowledge: '강의 자료를 보거나 자신의 문서를 추가하고 정리할 수 있습니다.',
    agents: '기본으로 Taylor를 사용합니다. 답변 방식과 참고 자료를 설정해 나만의 에이전트도 만들 수 있습니다.',
    settings: '프로필 메뉴에서 요금제, 남은 사용량과 계정 설정을 확인하세요.',
    done: '대화를 시작하거나 강의 자료를 살펴보세요.',
    picker: '에이전트와 추론 깊이를 선택하세요.',
    createAgent: '이름, 답변 규칙과 참고 자료를 설정해 에이전트를 만드세요.',
    knowledgeScope: '참고할 지식 베이스를 선택하거나 나중에 연결할 수 있습니다.',
    submitAgent: '이름과 지식 범위를 확인한 후 강조된 만들기 버튼을 누르세요.',
    submitKb: '유형과 이름을 확인하고 만들기를 누른 다음 자료를 추가하세요.',
    notReady: '지식 베이스가 아직 준비되지 않았습니다. 관리자에게 문의한 후 다시 시도하세요.',
    resourceFailed: '설정을 불러오지 못했습니다. 잠시 후 다시 시도하세요.',
    agentNotReady: '에이전트가 아직 준비되지 않았습니다. 관리자에게 문의하세요.',
  },
  'ru-RU': {
    ready: 'Taylor и материалы курсов готовы. Можно сразу начать разговор.',
    chat: 'Опишите свой вопрос или добавьте изображение либо файл для контекста.',
    knowledge: 'Здесь можно изучать материалы курсов, добавлять и упорядочивать свои документы.',
    agents: 'По умолчанию выбран Taylor. Можно создать своего агента и задать стиль ответов и справочные материалы.',
    settings: 'Откройте меню профиля, чтобы посмотреть тариф, остаток лимита и настройки учётной записи.',
    done: 'Начните разговор или откройте материалы курсов.',
    picker: 'Здесь выбираются агент и глубина рассуждений.',
    createAgent: 'Укажите имя, правила ответов и справочные материалы, чтобы создать своего агента.',
    knowledgeScope: 'Выберите доступные агенту базы знаний или подключите их позднее.',
    submitAgent: 'Проверьте имя и область знаний, затем нажмите выделенную кнопку создания.',
    submitKb: 'Проверьте тип и имя, нажмите выделенную кнопку создания, затем добавьте материалы.',
    notReady: 'База знаний ещё не готова. Обратитесь к администратору и повторите попытку.',
    resourceFailed: 'Не удалось загрузить настройки. Повторите попытку позже.',
    agentNotReady: 'Агент ещё не готов. Обратитесь к администратору.',
  },
}

const FIRE_GUIDE_PATHS: Record<string, keyof typeof FIRE_GUIDE_COPY['en-US']> = {
  'newUserGuide.steps.welcomeLite.desc': 'ready',
  'newUserGuide.steps.chatLite.desc': 'chat',
  'newUserGuide.steps.knowledge.desc': 'knowledge',
  'newUserGuide.steps.knowledgeLite.desc': 'knowledge',
  'newUserGuide.steps.agents.desc': 'agents',
  'newUserGuide.steps.agentsLite.desc': 'agents',
  'newUserGuide.steps.settings.desc': 'settings',
  'newUserGuide.steps.done.desc': 'done',
  'contextualGuide.chat.steps.picker.desc': 'picker',
  'contextualGuide.agentList.steps.create.desc': 'createAgent',
  'contextualGuide.agentCreate.steps.knowledge.desc': 'knowledgeScope',
  'contextualGuide.agentCreate.steps.submitLite.desc': 'submitAgent',
  'contextualGuide.kbCreate.steps.submit.desc': 'submitKb',
  'knowledgeBase.notInitialized': 'notReady',
  'knowledgeList.uninitializedBanner': 'notReady',
  'model.loadFailed': 'resourceFailed',
  'contextualGuide.tenantModels.needChatModelFirst': 'agentNotReady',
}

export function workspaceBrandMessages<T>(messages: T, fire: boolean): T {
  if (!fire) return messages
  const branded = brandMessageTree(messages)
  if (!branded || typeof branded !== 'object' || Array.isArray(branded)) return branded
  const bundles = branded as Record<string, unknown>
  for (const [locale, copy] of Object.entries(FIRE_GUIDE_COPY)) {
    const bundle = bundles[locale]
    if (!bundle || typeof bundle !== 'object') continue
    for (const [path, copyKey] of Object.entries(FIRE_GUIDE_PATHS)) {
      const segments = path.split('.')
      let target = bundle as Record<string, unknown> | undefined
      for (const segment of segments.slice(0, -1)) {
        const value: unknown = target?.[segment]
        target = value && typeof value === 'object' ? value as Record<string, unknown> : undefined
      }
      const leaf = segments[segments.length - 1]!
      if (target && typeof target[leaf] === 'string') target[leaf] = copy[copyKey]
    }
  }
  return branded
}

// Presentation-only fast path. A saved token still goes through the native
// server validation; callbacks and unavailable storage keep the normal bootstrap.
export const NATIVE_PASSWORD_ENTRY_BOOTSTRAP = `(function () {
  if (!/^\\/(?:platform(?:\\/|$)|$)/.test(location.pathname)) return;
  if (/(?:^|[#&])oidc_(?:result|error)=/.test(location.hash)) return;
  try {
    if (localStorage.getItem('weknora_token')) return;
  } catch (_) { return; }
  location.replace('/auth/start' + location.search);
})();`
