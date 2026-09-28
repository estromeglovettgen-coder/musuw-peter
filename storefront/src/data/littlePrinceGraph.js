// A compact, deterministic reading outline becomes a renderer-ready graph.
// The fixture is illustrative: it paraphrases the book instead of reproducing it.

const CATEGORY_DEFINITIONS = Object.freeze([
  Object.freeze({ id: "character", color: 0x2ba471, label: Object.freeze({ en: "Characters", zh: "人物" }) }),
  Object.freeze({ id: "chapter-event", color: 0x0052d9, label: Object.freeze({ en: "Chapters & events", zh: "章节与事件" }) }),
  Object.freeze({ id: "place", color: 0x0594fa, label: Object.freeze({ en: "Places", zh: "地点" }) }),
  Object.freeze({ id: "theme", color: 0xe37318, label: Object.freeze({ en: "Themes", zh: "主题" }) }),
  Object.freeze({ id: "symbol", color: 0x8c5bbd, label: Object.freeze({ en: "Symbols", zh: "象征" }) }),
  Object.freeze({ id: "relation", color: 0xd54941, label: Object.freeze({ en: "Relations", zh: "关系" }) }),
  Object.freeze({ id: "summary", color: 0x68758a, label: Object.freeze({ en: "Summaries", zh: "总结" }) }),
]);

const CATEGORY_BY_ID = new Map(CATEGORY_DEFINITIONS.map((category) => [category.id, category]));
const pair = (en, zh) => Object.freeze({ en, zh });

const CATALOGS = Object.freeze({
  character: Object.freeze({
    narrator: pair("The pilot narrator", "飞行员叙述者"),
    prince: pair("The Little Prince", "小王子"),
    adults: pair("The grown-ups", "大人们"),
    rose: pair("The rose", "玫瑰"),
    sheep: pair("The imagined sheep", "想象中的羊"),
    fox: pair("The fox", "狐狸"),
    snake: pair("The snake", "蛇"),
    king: pair("The king", "国王"),
    conceited: pair("The conceited man", "爱虚荣的人"),
    tippler: pair("The tippler", "酒鬼"),
    businessman: pair("The businessman", "商人"),
    lamplighter: pair("The lamplighter", "点灯人"),
    geographer: pair("The geographer", "地理学家"),
    astronomer: pair("The Turkish astronomer", "土耳其天文学家"),
    flower: pair("The desert flower", "沙漠里的花"),
    switchman: pair("The railway switchman", "铁路扳道工"),
    merchant: pair("The merchant", "商贩"),
    passengers: pair("The train passengers", "列车上的旅客"),
    children: pair("The children", "孩子们"),
    hunters: pair("The hunters", "猎人们"),
    explorers: pair("The explorers", "探险家们"),
  }),
  place: Object.freeze({
    childhood: pair("The narrator's childhood world", "叙述者的童年世界"),
    sahara: pair("The Sahara", "撒哈拉沙漠"),
    b612: pair("Asteroid B-612", "B-612 小行星"),
    asteroid325: pair("Asteroid 325", "325 号小行星"),
    asteroid326: pair("Asteroid 326", "326 号小行星"),
    asteroid327: pair("Asteroid 327", "327 号小行星"),
    asteroid328: pair("Asteroid 328", "328 号小行星"),
    asteroid329: pair("Asteroid 329", "329 号小行星"),
    asteroid330: pair("Asteroid 330", "330 号小行星"),
    earth: pair("Earth", "地球"),
    desert: pair("The empty desert", "空旷的沙漠"),
    mountain: pair("The echoing mountain", "回声山"),
    roseGarden: pair("The rose garden", "玫瑰园"),
    railway: pair("The railway junction", "铁路枢纽"),
    well: pair("The desert well", "沙漠中的井"),
    sky: pair("The night sky", "夜空"),
    home: pair("The prince's home", "小王子的家园"),
    journey: pair("The interplanetary journey", "星际旅程"),
  }),
  theme: Object.freeze({
    imagination: pair("Imagination", "想象力"),
    adultBlindness: pair("Adult blindness", "成人式盲目"),
    encounter: pair("Unexpected encounter", "意外相遇"),
    curiosity: pair("Curiosity", "好奇心"),
    home: pair("Home and belonging", "家园与归属"),
    responsibility: pair("Responsibility", "责任"),
    discipline: pair("Daily discipline", "日常自律"),
    sadness: pair("Sadness and consolation", "忧伤与慰藉"),
    misunderstanding: pair("Misunderstanding", "误解"),
    love: pair("Love through care", "在照料中形成的爱"),
    departure: pair("Departure and regret", "离别与遗憾"),
    authority: pair("Authority and reason", "权威与理性"),
    vanity: pair("Vanity and recognition", "虚荣与认可"),
    shame: pair("Shame and avoidance", "羞愧与逃避"),
    possession: pair("Possession and utility", "占有与功用"),
    duty: pair("Duty and devotion", "职责与投入"),
    knowledge: pair("Knowledge and experience", "知识与经验"),
    transience: pair("Transience", "短暂与无常"),
    loneliness: pair("Loneliness", "孤独"),
    appearance: pair("Appearance and essence", "表象与本质"),
    friendship: pair("Friendship and taming", "友谊与驯养"),
    time: pair("Time and ritual", "时间与仪式"),
    memory: pair("Memory", "记忆"),
    loss: pair("Loss, memory, and return", "失去、记忆与归返"),
    restlessness: pair("Human restlessness", "人的匆忙与不安"),
    wonder: pair("Wonder", "惊奇"),
  }),
  symbol: Object.freeze({
    boa: pair("The boa constrictor drawing", "蟒蛇画"),
    hat: pair("The hat-like outline", "像帽子的轮廓"),
    elephant: pair("The swallowed elephant", "被吞下的大象"),
    airplane: pair("The stranded airplane", "搁浅的飞机"),
    sheepBox: pair("The sheep inside the box", "箱子里的羊"),
    muzzle: pair("The sheep's muzzle", "羊的嘴套"),
    baobabs: pair("The baobabs", "猴面包树"),
    sunsets: pair("The many sunsets", "一次次日落"),
    thorns: pair("The rose's thorns", "玫瑰的刺"),
    rose: pair("The singular rose", "独一无二的玫瑰"),
    globe: pair("The glass globe", "玻璃罩"),
    volcanoes: pair("The volcanoes", "火山"),
    birds: pair("The migrating birds", "候鸟"),
    crown: pair("The king's crown", "国王的王冠"),
    bottle: pair("The tippler's bottles", "酒鬼的酒瓶"),
    stars: pair("The counted stars", "被计数的星星"),
    lamp: pair("The lamplighter's lamp", "点灯人的灯"),
    atlas: pair("The geographer's atlas", "地理学家的地图册"),
    snakeCoil: pair("The snake's golden coil", "蛇的金色盘曲"),
    desertFlower: pair("The three-petaled flower", "三瓣花"),
    echo: pair("The mountain echo", "山中的回声"),
    roses: pair("The five thousand roses", "五千朵玫瑰"),
    wheat: pair("The wheat fields", "麦田"),
    trains: pair("The rushing trains", "疾驰的列车"),
    pills: pair("The thirst-quenching pills", "止渴药丸"),
    well: pair("The singing pulley", "歌唱的辘轳"),
    water: pair("The gift of water", "作为礼物的水"),
    starsLaughter: pair("The laughing stars", "会笑的星星"),
  }),
});

const chapter = (titleEn, titleZh, events, characters, places, themes, symbols) => Object.freeze({
  title: pair(titleEn, titleZh),
  events: Object.freeze(events.map(([en, zh]) => pair(en, zh))),
  character: Object.freeze(characters),
  place: Object.freeze(places),
  theme: Object.freeze(themes),
  symbol: Object.freeze(symbols),
});

const CHAPTERS = Object.freeze([
  chapter("Drawings that adults cannot see", "大人看不懂的画", [
    ["A child draws a boa digesting an elephant", "孩子画下吞食大象的蟒蛇"],
    ["Adults mistake the outline for a hat", "大人把轮廓误认成帽子"],
    ["The narrator becomes a pilot but keeps testing imagination", "叙述者成为飞行员，却仍在试探他人的想象力"],
  ], ["narrator", "adults"], ["childhood"], ["imagination", "adultBlindness"], ["boa", "hat", "elephant"]),
  chapter("A request for a sheep in the desert", "沙漠里画一只羊的请求", [
    ["The pilot crashes far from any settlement", "飞行员坠机在远离人烟的沙漠"],
    ["A small visitor calmly asks for a sheep", "一位小访客平静地请求画一只羊"],
    ["A box finally holds the sheep that the prince imagines", "一个箱子终于装下小王子想象中的羊"],
  ], ["narrator", "prince", "sheep"], ["sahara", "desert"], ["encounter", "wonder", "loneliness"], ["airplane", "sheepBox"]),
  chapter("Questions reveal another home", "问答逐渐显露另一个家园", [
    ["The prince studies the pilot's airplane", "小王子观察飞行员的飞机"],
    ["His questions hint that he came from a very small planet", "他的提问暗示自己来自一颗很小的星球"],
    ["The sheep becomes part of imagining life back home", "羊成为想象家园生活的一部分"],
  ], ["narrator", "prince", "sheep"], ["sahara", "b612", "home"], ["curiosity", "home", "encounter"], ["airplane", "sheepBox"]),
  chapter("B-612 and the grown-up love of numbers", "B-612 与大人对数字的迷恋", [
    ["The narrator identifies the prince's asteroid as B-612", "叙述者确认小王子的星球是 B-612"],
    ["An astronomer's discovery is dismissed because of his clothes", "天文学家的发现曾因衣着而被忽视"],
    ["Numbers persuade adults more readily than lived qualities", "数字比真实感受更容易说服大人"],
  ], ["narrator", "prince", "adults", "astronomer"], ["b612", "earth"], ["adultBlindness", "appearance", "knowledge"], ["stars", "atlas"]),
  chapter("Baobabs and the discipline of care", "猴面包树与照料的纪律", [
    ["Tiny shoots must be recognized before they grow", "幼苗必须在长大前被辨认"],
    ["The prince cleans his planet every morning", "小王子每天清晨清理自己的星球"],
    ["Neglect would let baobabs split the little world apart", "疏忽会让猴面包树撑裂这颗小小星球"],
  ], ["prince", "sheep"], ["b612", "home"], ["responsibility", "discipline"], ["baobabs", "sheepBox"]),
  chapter("Sunsets as company for sadness", "日落陪伴忧伤", [
    ["A small planet lets the prince move his chair toward sunset", "在小星球上挪动椅子就能追随日落"],
    ["He remembers watching many sunsets in one day", "他记得自己一天看过许多次日落"],
    ["The pilot senses that sunsets answer a private sadness", "飞行员意识到日落回应着一种隐秘的忧伤"],
  ], ["narrator", "prince"], ["b612", "sky"], ["sadness", "loneliness", "wonder"], ["sunsets", "stars"]),
  chapter("Thorns expose what matters", "花刺暴露出真正重要的事", [
    ["The prince asks why flowers grow thorns", "小王子追问花为什么长刺"],
    ["The busy pilot treats the question as a distraction", "忙于修理飞机的飞行员把问题当作打扰"],
    ["Fear for the rose turns the argument into tears", "对玫瑰的担忧让争执化为眼泪"],
  ], ["narrator", "prince", "rose", "sheep"], ["sahara", "b612"], ["misunderstanding", "love", "responsibility"], ["thorns", "muzzle", "airplane"]),
  chapter("The rose arrives with contradictions", "玫瑰带着矛盾出现", [
    ["A carefully prepared bloom appears on B-612", "一朵精心准备的花在 B-612 上开放"],
    ["Her beauty and demands enchant and confuse the prince", "她的美丽与要求让小王子着迷又困惑"],
    ["He listens to inconsistent words instead of noticing affection", "他听信前后矛盾的话，没有看见其中的情意"],
  ], ["prince", "rose"], ["b612", "home"], ["love", "misunderstanding", "appearance"], ["rose", "thorns", "globe"]),
  chapter("Preparing to leave B-612", "离开 B-612 前的准备", [
    ["The prince cleans the volcanoes and removes the last shoots", "小王子清理火山并拔掉最后的幼苗"],
    ["The rose admits her affection without keeping him", "玫瑰承认感情，却不再挽留他"],
    ["Migrating birds carry the prince into his journey", "候鸟带着小王子踏上旅程"],
  ], ["prince", "rose"], ["b612", "journey", "home"], ["departure", "love", "responsibility"], ["volcanoes", "baobabs", "globe", "birds"]),
  chapter("The king and reasonable authority", "国王与合乎理性的权威", [
    ["A king claims rule over everything he sees", "国王声称统治眼前的一切"],
    ["His commands are timed so that obedience is guaranteed", "他的命令总挑必然会被服从的时机"],
    ["The prince leaves after finding no meaningful judgment to make", "小王子发现无事可审判，于是离开"],
  ], ["prince", "king"], ["asteroid325", "journey"], ["authority", "adultBlindness", "responsibility"], ["crown", "sunsets"]),
  chapter("The conceited man hears only praise", "爱虚荣的人只听得见赞美", [
    ["The inhabitant welcomes the prince as an admirer", "居民把小王子当作崇拜者欢迎"],
    ["A ritual of applause replaces conversation", "鼓掌的仪式取代了真正的对话"],
    ["The prince leaves because admiration cannot create a relationship", "赞美无法建立关系，小王子因此离开"],
  ], ["prince", "conceited"], ["asteroid326", "journey"], ["vanity", "loneliness", "appearance"], ["hat", "crown"]),
  chapter("The tippler's closed circle", "酒鬼封闭的循环", [
    ["The prince meets a man surrounded by bottles", "小王子遇见被酒瓶包围的人"],
    ["He drinks to forget the shame of drinking", "他借酒忘掉喝酒带来的羞愧"],
    ["The circular answer leaves the prince bewildered", "循环往复的回答让小王子困惑"],
  ], ["prince", "tippler"], ["asteroid327", "journey"], ["shame", "adultBlindness", "loneliness"], ["bottle"]),
  chapter("The businessman counts the stars", "商人计数星星", [
    ["A businessman refuses interruption while adding figures", "商人不愿在加总数字时被打断"],
    ["He claims ownership by writing the number of stars", "他通过记下星星数量来宣称所有权"],
    ["The prince contrasts possession with useful care", "小王子把占有与有用的照料作比较"],
  ], ["prince", "businessman"], ["asteroid328", "journey"], ["possession", "adultBlindness", "responsibility"], ["stars"]),
  chapter("The lamplighter keeps faith with a rule", "点灯人忠于规则", [
    ["The lamp must be lit and extinguished ever more quickly", "灯必须越来越快地点亮又熄灭"],
    ["The planet's accelerating days make rest impossible", "星球飞快的昼夜让休息成为不可能"],
    ["The prince respects devotion that is not self-centered", "小王子敬重这种并非只为自己的投入"],
  ], ["prince", "lamplighter"], ["asteroid329", "journey"], ["duty", "responsibility", "time"], ["lamp", "sunsets"]),
  chapter("The geographer records without exploring", "地理学家记录却不探索", [
    ["A geographer waits for explorers to bring evidence", "地理学家等待探险家带回证据"],
    ["He explains that flowers are omitted because they are transient", "他解释花因短暂而不会被记录"],
    ["The prince worries about the rose and is directed toward Earth", "小王子担心玫瑰，并被指引前往地球"],
  ], ["prince", "geographer", "explorers", "rose"], ["asteroid330", "earth", "journey"], ["knowledge", "transience", "love"], ["atlas", "rose"]),
  chapter("Earth appears immense and busy", "地球显得巨大而忙碌", [
    ["The narrator surveys Earth's many adult occupations", "叙述者概览地球上众多成人职业"],
    ["Lamplighters once formed a moving order across the globe", "点灯人曾在全球形成流动的秩序"],
    ["Scale makes the prince's earlier planets seem intimate", "巨大的尺度让此前的小行星显得亲密"],
  ], ["narrator", "prince", "adults", "lamplighter"], ["earth", "journey"], ["adultBlindness", "duty", "loneliness"], ["lamp", "stars"]),
  chapter("The snake speaks of return", "蛇谈论归返", [
    ["The prince lands where the desert seems empty of people", "小王子降落在人迹罕至的沙漠"],
    ["A snake describes power that can send someone back to the earth", "蛇描述一种能把人送回大地的力量"],
    ["Their riddling exchange joins danger with a possible homecoming", "谜语般的对话把危险与归家联系起来"],
  ], ["prince", "snake"], ["earth", "desert", "sahara"], ["loneliness", "home", "loss"], ["snakeCoil", "stars"]),
  chapter("A flower remembers passing people", "一朵花记得路过的人", [
    ["The prince finds a small flower in the desert", "小王子在沙漠里发现一朵小花"],
    ["She recalls only a few people passing long ago", "她只记得很久以前经过的少数人"],
    ["People seem rootless because the wind carries them", "人没有根，仿佛会被风带走"],
  ], ["prince", "flower", "passengers"], ["desert", "earth"], ["loneliness", "transience", "restlessness"], ["desertFlower"]),
  chapter("The mountain answers with an echo", "高山只用回声回答", [
    ["The prince climbs a high mountain to look for people", "小王子登上高山寻找人类"],
    ["Only his own words return from the peaks", "山峰只把他自己的话送回来"],
    ["He mistakes repetition for the way people converse", "他误以为人们的谈话只是重复"],
  ], ["prince", "adults"], ["mountain", "earth"], ["loneliness", "misunderstanding", "appearance"], ["echo"]),
  chapter("A garden overturns the prince's certainty", "玫瑰园推翻了小王子的确信", [
    ["The prince discovers thousands of roses", "小王子发现成千上万朵玫瑰"],
    ["He feels poor because his flower seems no longer unique", "他觉得自己的花不再独特，因而感到贫乏"],
    ["He lies in the grass and grieves for his lost distinction", "他躺在草地上，为失去独特性感到悲伤"],
  ], ["prince", "rose"], ["roseGarden", "earth"], ["appearance", "sadness", "love"], ["roses", "globe"]),
  chapter("The fox teaches how bonds are made", "狐狸讲述关系如何形成", [
    ["The fox asks the prince to create a bond through patience", "狐狸请小王子用耐心建立联系"],
    ["Ritual and shared time make one being distinct from others", "仪式与共同度过的时间让彼此变得独特"],
    ["The prince understands his responsibility for the rose", "小王子理解了自己对玫瑰负有责任"],
  ], ["prince", "fox", "rose", "hunters"], ["earth", "roseGarden"], ["friendship", "time", "responsibility", "appearance"], ["wheat", "roses"]),
  chapter("Trains carry people who do not know what they seek", "列车载着不知所求的人", [
    ["A switchman sorts travelers into rushing trains", "扳道工把旅客分流到疾驰的列车"],
    ["Most passengers hurry back and forth without satisfaction", "大多数旅客来回奔忙却并不满足"],
    ["Children alone stay attentive to what they treasure", "只有孩子专注于自己珍爱的事物"],
  ], ["prince", "switchman", "passengers", "children"], ["railway", "earth"], ["restlessness", "adultBlindness", "wonder"], ["trains"]),
  chapter("Saved minutes cannot replace a walk to water", "省下的时间不能替代走向清泉", [
    ["A merchant sells pills that remove the need to drink", "商贩出售让人无需喝水的药丸"],
    ["The product promises to save many minutes each week", "这种商品承诺每周节省许多分钟"],
    ["The prince would spend the time walking slowly toward a spring", "小王子宁愿用这些时间慢慢走向清泉"],
  ], ["prince", "merchant", "adults"], ["earth", "desert"], ["time", "restlessness", "appearance"], ["pills", "water"]),
  chapter("The desert hides a well", "沙漠深处藏着一口井", [
    ["After eight days the pilot's water is gone", "到了第八天，飞行员的水已经耗尽"],
    ["The prince and pilot walk beneath the stars", "小王子与飞行员在星空下行走"],
    ["The pilot carries the sleeping prince before finding a well", "飞行员抱着熟睡的小王子，随后找到一口井"],
  ], ["narrator", "prince"], ["desert", "sahara", "well", "sky"], ["friendship", "appearance", "wonder"], ["stars", "well"]),
  chapter("Water becomes a shared gift", "水成为共同完成的礼物", [
    ["The pulley makes the well sound alive", "辘轳让井发出仿佛有生命的声音"],
    ["Effort, stars, and friendship give the water its value", "劳作、星光与友谊赋予水独特价值"],
    ["The prince asks for the sheep's muzzle and prepares a secret plan", "小王子索要羊的嘴套，并准备一个秘密计划"],
  ], ["narrator", "prince", "sheep"], ["well", "desert", "sahara"], ["friendship", "responsibility", "time"], ["well", "water", "muzzle"]),
  chapter("A farewell arranged with the snake", "与蛇约定的告别", [
    ["The pilot discovers the prince speaking with the snake", "飞行员发现小王子正在与蛇交谈"],
    ["The repaired airplane and the anniversary set two departures", "修好的飞机与周年之日安排了两场离别"],
    ["The snake strikes and the prince falls silently", "蛇咬下去，小王子无声地倒下"],
  ], ["narrator", "prince", "snake", "rose"], ["desert", "sahara", "home"], ["departure", "love", "loss", "home"], ["snakeCoil", "airplane", "stars"]),
  chapter("The unanswered question among the stars", "星空下没有答案的问题", [
    ["Six years later the narrator still remembers the desert", "六年后，叙述者仍记得那片沙漠"],
    ["A missing strap on the muzzle leaves the rose's fate uncertain", "嘴套少了一根带子，让玫瑰的命运仍不确定"],
    ["The stars can sound like laughter or tears depending on that answer", "根据那个答案，星星可能像笑声，也可能像泪水"],
  ], ["narrator", "prince", "rose", "sheep"], ["sahara", "sky", "home"], ["memory", "loss", "responsibility", "wonder"], ["muzzle", "starsLaughter", "rose"]),
]);

const RELATION_CATEGORIES = Object.freeze(["character", "place", "theme", "symbol"]);

export const LITTLE_PRINCE_GRAPH_VIEW = Object.freeze({
  initialScale: 0.55,
  denseScale: 0.24,
  focusScale: 0.68,
  fitRightInset: 128,
  progressionTimeScale: 2,
  progressionMaxTimeScale: 10,
  progressionAccelerationStartNode: 15,
  progressionAccelerationEndNode: 100,
  seedNodeCount: 28,
  accelerationNodeCount: 65,
  textFadeMultiplier: -0.6,
  nodeSizeMultiplier: 0.72,
  lineSizeMultiplier: 0.68,
  centerStrength: 0.35,
  repelStrength: 9,
  linkStrength: 1,
  linkDistance: 120,
});

function localeKey(locale) {
  return String(locale).toLowerCase().startsWith("zh") ? "zh" : "en";
}

function localizedCatalogLabel(category, id, locale) {
  const label = CATALOGS[category]?.[id]?.[locale];
  if (!label) throw new Error(`Unknown Little Prince ${category}: ${id}`);
  return label;
}

function buildGraph(locale) {
  const nodes = [];
  const edges = [];
  const edgeKeys = new Set();
  const addNode = (slug, title, pageType, kind = pageType) => {
    nodes.push({ slug, title, page_type: pageType, kind, color: CATEGORY_BY_ID.get(pageType).color });
  };
  const addEdge = (source, target) => {
    const key = `${source}\u0000${target}`;
    if (source === target || edgeKeys.has(key)) return;
    edgeKeys.add(key);
    edges.push({ source, target });
  };

  const bookSlug = "summary:book";
  addNode(bookSlug, locale === "zh" ? "《小王子》：全书阅读图谱" : "The Little Prince: complete reading map", "summary");

  for (const [category, entries] of Object.entries(CATALOGS)) {
    for (const [id, labels] of Object.entries(entries)) addNode(`${category}:${id}`, labels[locale], category);
  }

  CHAPTERS.forEach((entry, chapterIndex) => {
    const number = chapterIndex + 1;
    const prefix = locale === "zh" ? `第${number}章` : `Chapter ${number}`;
    const chapterSlug = `chapter:${String(number).padStart(2, "0")}`;
    const summarySlug = `summary:chapter:${String(number).padStart(2, "0")}`;
    addNode(chapterSlug, `${prefix}：${entry.title[locale]}`, "chapter-event", "chapter");
    addNode(summarySlug, locale === "zh" ? `${prefix}总结：${entry.title.zh}` : `${prefix} summary: ${entry.title.en}`, "summary");
    addEdge(bookSlug, chapterSlug);
    addEdge(chapterSlug, summarySlug);
    if (number > 1) addEdge(`chapter:${String(number - 1).padStart(2, "0")}`, chapterSlug);

    let previousEvent = null;
    entry.events.forEach((event, eventIndex) => {
      const eventSlug = `${chapterSlug}:event:${eventIndex + 1}`;
      const eventTitle = locale === "zh"
        ? `${prefix}事件 ${eventIndex + 1}：${event.zh}`
        : `${prefix} event ${eventIndex + 1}: ${event.en}`;
      addNode(eventSlug, eventTitle, "chapter-event", "event");
      addEdge(chapterSlug, eventSlug);
      addEdge(summarySlug, eventSlug);
      if (previousEvent) addEdge(previousEvent, eventSlug);
      previousEvent = eventSlug;
    });

    for (const category of RELATION_CATEGORIES) {
      const relationSlug = `relation:${String(number).padStart(2, "0")}:${category}`;
      const labels = entry[category].map((id) => localizedCatalogLabel(category, id, locale));
      const categoryLabel = CATEGORY_BY_ID.get(category).label[locale];
      const relationTitle = locale === "zh"
        ? `${prefix}关系：${categoryLabel} - ${labels.join("、")}`
        : `${prefix} relation: ${categoryLabel} - ${labels.join(", ")}`;
      addNode(relationSlug, relationTitle, "relation");
      addEdge(chapterSlug, relationSlug);
      addEdge(relationSlug, summarySlug);
      for (const id of entry[category]) addEdge(relationSlug, `${category}:${id}`);
    }
  });

  const degrees = new Map(nodes.map((node) => [node.slug, 0]));
  const adjacency = new Map(nodes.map((node) => [node.slug, []]));
  for (const edge of edges) {
    degrees.set(edge.source, degrees.get(edge.source) + 1);
    degrees.set(edge.target, degrees.get(edge.target) + 1);
    adjacency.get(edge.source).push(edge.target);
    adjacency.get(edge.target).push(edge.source);
  }

  // Match the creation order of the exported Obsidian vault. Its native
  // progression sorts by file time, so breadth-first order is what makes the
  // book overview grow into all 27 chapter nodes before deeper concepts.
  const nodeBySlug = new Map(nodes.map((node) => [node.slug, node]));
  const orderedSlugs = [];
  const visited = new Set();
  const queue = [bookSlug];
  while (queue.length > 0) {
    const slug = queue.shift();
    if (visited.has(slug)) continue;
    visited.add(slug);
    orderedSlugs.push(slug);
    for (const neighbor of adjacency.get(slug) ?? []) if (!visited.has(neighbor)) queue.push(neighbor);
  }
  for (const node of nodes) if (!visited.has(node.slug)) orderedSlugs.push(node.slug);
  const orderedNodes = orderedSlugs.map((slug) => nodeBySlug.get(slug));

  return Object.freeze({
    nodes: Object.freeze(orderedNodes.map((node) => Object.freeze({ ...node, link_count: degrees.get(node.slug) }))),
    edges: Object.freeze(edges.map((edge) => Object.freeze(edge))),
    categories: Object.freeze(CATEGORY_DEFINITIONS.map((category) => Object.freeze({
      id: category.id,
      label: category.label[locale],
      color: `#${category.color.toString(16).padStart(6, "0")}`,
    }))),
    meta: Object.freeze({
      mode: "overview",
      locale,
      chapterCount: CHAPTERS.length,
      source: "complete-book reading outline",
    }),
  });
}

const GRAPHS = Object.freeze({ en: buildGraph("en"), zh: buildGraph("zh") });

export function createLittlePrinceGraph(locale = "en") {
  return GRAPHS[localeKey(locale)];
}

export const LITTLE_PRINCE_GRAPH_TOTALS = Object.freeze({
  nodes: GRAPHS.en.nodes.length,
  links: GRAPHS.en.edges.length,
});
