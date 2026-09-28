import assert from "node:assert/strict";
import test from "node:test";

const requiredRoutes = [
  "/terms",
  "/privacy",
  "/refund-policy",
  "/subscription-policy",
  "/acceptable-use",
  "/cookies",
  "/security",
  "/contact"
];

test("every merchant-review document is public and complete in English and Chinese", async () => {
  const {
    LEGAL_OPERATOR,
    PUBLIC_DOCUMENT_PATHS,
    getPublicDocument,
    getPublicDocumentMeta
  } = await import("../src/legalContent.js");

  assert.equal(LEGAL_OPERATOR.englishName, "Hangzhou Didren Technology Co., Ltd.");
  assert.equal(LEGAL_OPERATOR.supportEmail, "support@didren.com");
  assert.equal(LEGAL_OPERATOR.supportPhone, "+86 19176942082");
  assert.deepEqual(PUBLIC_DOCUMENT_PATHS, requiredRoutes);
  for (const route of requiredRoutes) {
    for (const locale of ["en", "zh-CN"]) {
      const document = getPublicDocument(locale, route);
      assert.equal(document.path, route);
      assert.ok(document.title.length >= 4);
      assert.ok(document.summary.length >= 30);
      assert.equal(
        document.updated,
        ["/privacy", "/cookies"].includes(route)
          ? "2026-09-24"
          : ["/subscription-policy", "/terms", "/refund-policy"].includes(route)
            ? "2026-09-03"
            : "2026-08-27",
      );
      assert.ok(document.sections.length >= 3, `${route} needs substantive sections in ${locale}`);
      assert.ok(document.sections.every((section) => section.heading && section.blocks?.length));

      const meta = getPublicDocumentMeta(locale, route);
      assert.match(meta.title, /musuw/);
      assert.ok(meta.description.length >= 30);
    }
  }

  assert.equal(getPublicDocument("en", "/missing"), null);
  assert.equal(getPublicDocumentMeta("en", "/missing"), null);
});

test("policies identify the operator, support channel, Paddle terms, and mandatory rights", async () => {
  const { getPublicDocument } = await import("../src/legalContent.js");
  const flatten = (locale, route) => JSON.stringify(getPublicDocument(locale, route));

  for (const locale of ["en", "zh-CN"]) {
    const all = requiredRoutes.map((route) => flatten(locale, route)).join("\n");
    assert.match(all, /Hangzhou Didren Technology Co\., Ltd\./);
    assert.match(all, /杭州地底人科技有限公司/);
    assert.match(all, /support@didren\.com/);

    const contactPage = flatten(locale, "/contact");
    assert.match(contactPage, /\+86 19176942082/);
    assert.match(contactPage, /tel:\+8619176942082/);
    assert.doesNotMatch(all, locale === "zh-CN" ? /3\s*个工作日/ : /three business days/i);

    const refund = flatten(locale, "/refund-policy");
    assert.match(
      refund,
      locale === "zh-CN"
        ? /不提供自愿退款.*最终交易且不予退款|最终交易且不予退款.*不提供自愿退款/
        : /does not offer voluntary refunds.*final and non-refundable/i,
    );
    assert.match(refund, locale === "zh-CN" ? /Paddle.*退款|退款.*Paddle/ : /Paddle.*Refund|Refund.*Paddle/i);
    assert.match(refund, locale === "zh-CN" ? /强制性.*消费者|法定.*权利/ : /mandatory consumer rights/i);

    const subscription = flatten(locale, "/subscription-policy");
    assert.match(subscription, locale === "zh-CN" ? /自动续费/ : /automatically renew/i);
    assert.match(subscription, locale === "zh-CN" ? /取消/ : /cancel/i);
    assert.match(
      subscription,
      locale === "zh-CN"
        ? /账户注销.*停止后续自动续费|停止后续自动续费.*账户注销/
        : /account closure.*stops future automatic renewals|stops future automatic renewals.*account closure/i,
    );
    assert.match(
      subscription,
      locale === "zh-CN" ? /账户注销.*不会自动退款|不会自动退款.*账户注销/ : /account closure.*does not automatically refund|does not automatically refund.*account closure/i,
    );
    assert.match(
      subscription,
      locale === "zh-CN"
        ? /不提供自愿.*最终交易且不予退款/
        : /does not offer voluntary.*final and non-refundable/i,
    );

    const terms = flatten(locale, "/terms");
    assert.match(terms, /Paddle/);
    assert.match(terms, /Merchant of Record|商户记录方/);
    assert.doesNotMatch(
      `${terms}\n${refund}\n${subscription}`,
      locale === "zh-CN"
        ? /30\s*个?日历日|30\s*天退款保证|退款保证/
        : /30[- ](?:calendar[- ]day|day)|30 calendar days/i,
    );
    assert.match(
      terms,
      locale === "zh-CN"
        ? /Paddle.*购买与交易.*买家支持.*退款.*musuw.*产品和技术支持/
        : /Paddle.*purchase and transaction.*buyer-support.*refund.*musuw.*product and technical support/is,
    );
    assert.doesNotMatch(
      terms,
      locale === "zh-CN" ? /Paddle 负责所有客户服务咨询/ : /Paddle provides all customer service inquiries/i,
    );
    for (const href of [
      "https://www.paddle.com/legal/buyer-terms",
      "https://www.paddle.com/legal/refund-policy",
      "https://paddle.net/"
    ]) {
      assert.match(terms, new RegExp(href.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    }

    const privacy = flatten(locale, "/privacy");
    for (const concept of locale === "zh-CN"
      ? [/收集/, /用途|目的/, /保留/, /跨境/, /权利/, /删除/]
      : [/collect/i, /purpose/i, /retain/i, /international/i, /rights/i, /delete/i]) {
      assert.match(privacy, concept);
    }
    assert.match(
      privacy,
      locale === "zh-CN"
        ? /客服渠道|support@didren\.com/
        : /support channel|support@didren\.com/i,
    );
    assert.match(
      privacy,
      locale === "zh-CN"
        ? /获授权的运营人员.*受限内部功能/
        : /authorized operations staff.*restricted/i,
    );
    assert.doesNotMatch(
      privacy,
      locale === "zh-CN" ? /设置.*用户信息.*删除账号/ : /Settings.*Profile.*Delete account/i,
    );
    assert.doesNotMatch(
      privacy,
      locale === "zh-CN"
        ? /标准化邮箱/
        : /exact normalized current account email/i,
    );
    assert.match(
      privacy,
      locale === "zh-CN"
        ? /Paddle.*商户记录方|商户记录方.*Paddle/
        : /Paddle.*Merchant of Record|Merchant of Record.*Paddle/i,
    );
    assert.match(
      privacy,
      locale === "zh-CN"
        ? /发票.*交易记录|交易记录.*发票/
        : /invoices?.*transaction records?|transaction records?.*invoices?/i,
    );
    assert.match(
      privacy,
      locale === "zh-CN"
        ? /税务.*会计.*反欺诈.*拒付|反欺诈.*拒付.*争议/
        : /tax.*accounting.*fraud.*chargeback|fraud.*chargeback.*dispute/i,
    );
    assert.match(
      privacy,
      locale === "zh-CN" ? /各自.*留存期限/ : /own retention periods/i,
    );
    assert.match(
      privacy,
      locale === "zh-CN"
        ? /欠费.*不会延迟接受注销|不会延迟接受注销.*欠费/
        : /past-due.*does not delay acceptance|does not delay acceptance.*past-due/i,
    );
    assert.match(
      privacy,
      locale === "zh-CN"
        ? /Paddle.*确认.*取消.*最终删除|最终删除.*Paddle.*确认.*取消/s
        : /Paddle.*confirms.*cancellation.*(?:complete|final).*deletion|final deletion.*Paddle.*confirms cancellation/is,
    );
    assert.match(
      privacy,
      locale === "zh-CN"
        ? /TikHub.*社媒.*链接|社媒.*TikHub.*链接/s
        : /TikHub.*social-media.*(?:URL|link)/is,
    );
    assert.match(
      privacy,
      locale === "zh-CN"
        ? /Langfuse.*用户.*会话.*请求标识/s
        : /Langfuse.*user.*session.*request identifiers/is,
    );
    for (const provider of ["Supabase", "Resend", "Google", "Cloudflare", "SearXNG", "Microsoft", "TikHub", "OpenRouter", "Langfuse", "Paddle"]) {
      assert.match(privacy, new RegExp(provider));
    }

    const acceptableUse = flatten(locale, "/acceptable-use");
    assert.match(
      acceptableUse,
      locale === "zh-CN"
        ? /网页导入.*私人知识索引.*不是流媒体下载.*内容再分发/
        : /URL imports.*private knowledge indexing.*not a streaming downloader.*content redistribution/i
    );
    assert.match(
      acceptableUse,
      locale === "zh-CN"
        ? /视频上传.*私人知识分析.*不是面向公众的视频托管.*流媒体.*再分发/
        : /Video uploads.*private knowledge analysis.*not a public video hosting.*streaming.*redistribution/i
    );

    const security = flatten(locale, "/security");
    assert.doesNotMatch(
      security,
      locale === "zh-CN" ? /准备上线|正准备提供/ : /prepared for launch|being prepared to provide/i
    );

    const cookies = flatten(locale, "/cookies");
    assert.match(cookies, /Cloudflare/);
    for (const document of [privacy, cookies]) {
      assert.match(
        document,
        locale === "zh-CN"
          ? /Cloudflare.*不使用 Cookie.*页面访问.*性能统计/
          : /Cloudflare.*cookie-free.*page.?usage and performance analytics/i
      );
    }
    assert.match(cookies, /https:\/\/developers\.cloudflare\.com\/speed\/observatory\/rum-beacon\//);
    assert.match(cookies, locale === "zh-CN" ? /浏览器存储/ : /browser storage/i);
    assert.match(cookies, locale === "zh-CN" ? /不.*跨.*追踪/ : /does not.*use cross-site behavioral tracking/i);
  }
});

test("optional analytics notices explain consent, limited data, and withdrawal in both languages", async () => {
  const { getPublicDocument } = await import("../src/legalContent.js");
  for (const locale of ["en", "zh-CN"]) {
    const privacy = JSON.stringify(getPublicDocument(locale, "/privacy"));
    const cookies = JSON.stringify(getPublicDocument(locale, "/cookies"));
    for (const document of [privacy, cookies]) {
      assert.match(document, /Google Analytics 4/);
      assert.match(document, locale === "zh-CN" ? /仅在您同意后|仅在您同意统计后/ : /only after you consent|after you accept analytics/i);
      assert.match(document, locale === "zh-CN" ? /基础会话/ : /basic session/i);
      assert.match(document, locale === "zh-CN" ? /不.*(?:向 GA4 )?发送 musuw 账户标识、邮箱、知识内容或对话/ : /do not send musuw account identifiers, emails?(?: addresses)?, knowledge content, or conversations/i);
      assert.match(document, locale === "zh-CN" ? /移除查询参数和片段/ : /query strings and fragments removed|remove query strings and fragments/i);
      assert.match(document, locale === "zh-CN" ? /广告功能和 Google signals 均关闭/ : /Advertising features and Google signals are disabled/i);
    }
    assert.match(cookies, locale === "zh-CN" ? /同意前或拒绝后.*不加载 Google 统计脚本/ : /Before consent, or if you reject it, we do not load Google's analytics script/i);
    assert.match(cookies, /musuw_analytics_consent_v1/);
    assert.match(cookies, locale === "zh-CN" ? /页脚“统计偏好”/ : /Analytics preferences in the footer/i);
    assert.match(cookies, locale === "zh-CN" ? /撤回同意.*停止统计.*清除.*_ga Cookie/ : /Withdrawing consent stops analytics, clears.*_ga cookies/i);
    assert.match(cookies, locale === "zh-CN" ? /刷新一次/ : /reloads the page once/i);
    assert.match(cookies, locale === "zh-CN" ? /撤回不会删除已发送/ : /Withdrawal does not delete data already sent/i);
    assert.doesNotMatch(cookies, locale === "zh-CN" ? /如未来引入.*分析工具/ : /If we introduce analytics/i);
  }
});

test("privacy policy links to the named providers' own notices", async () => {
  const { getPublicDocument } = await import("../src/legalContent.js");
  for (const locale of ["en", "zh-CN"]) {
    const privacy = JSON.stringify(getPublicDocument(locale, "/privacy"));
    for (const href of [
      "https://supabase.com/privacy",
      "https://resend.com/legal/privacy-policy",
      "https://policies.google.com/privacy",
      "https://www.cloudflare.com/privacypolicy/",
      "https://privacy.microsoft.com/en-us/privacystatement",
      "https://docs.tikhub.io/5508543m0",
      "https://openrouter.ai/privacy",
      "https://langfuse.com/privacy",
      "https://langfuse.com/security/data-regions",
      "https://www.paddle.com/legal/privacy"
    ]) {
      assert.match(privacy, new RegExp(href.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    }
  }
});

test("the application and footer expose direct document routes", async () => {
  const { readFile } = await import("node:fs/promises");
  const app = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");
  const chrome = await readFile(new URL("../src/data/homeContent.js", import.meta.url), "utf8");
  const siteChrome = await readFile(new URL("../src/components/SiteChrome.jsx", import.meta.url), "utf8");
  const legalContent = await readFile(new URL("../src/legalContent.js", import.meta.url), "utf8");
  const i18n = await readFile(new URL("../src/i18n.js", import.meta.url), "utf8");
  const homepage = await readFile(new URL("../src/homepageMarketingRefresh.js", import.meta.url), "utf8");
  const legacyCompanyToken = ["Didi", "ren"].join("");
  const legacyDomain = ["didi", "ren.com"].join("");

  assert.match(app, /getPublicDocument/);
  assert.match(app, /LegalPage/);
  assert.match(legalContent, /support@didren\.com/);
  assert.doesNotMatch(`${siteChrome}\n${i18n}`, new RegExp(`${legacyCompanyToken}|${legacyDomain}`, "i"));
  for (const route of ["/terms", "/privacy", "/refund-policy", "/security", "/contact"]) {
    assert.match(chrome, new RegExp(route.replace("/", "\\/")));
  }
  for (const route of ["/subscription-policy", "/cookies"]) {
    assert.match(homepage, new RegExp(route.replace("/", "\\/")));
  }
});

test("terms preserve requested AI output rights and do not make delayed confirmation authoritative", async () => {
  const { getPublicDocument } = await import("../src/legalContent.js");
  const english = JSON.stringify(getPublicDocument("en", "/terms"));
  const chinese = JSON.stringify(getPublicDocument("zh-CN", "/terms"));

  assert.match(english, /your content.*prompts.*AI output requested by you/is);
  assert.match(chinese, /您的内容.*提示词.*您请求生成的 AI 输出/s);
  assert.doesNotMatch(english, /Paddle(?:'s)? confirmation controls the recorded cancellation time/i);
  assert.doesNotMatch(chinese, /Paddle 的确认记录取消时间/);
  assert.match(english, /received through a listed channel before renewal.*effective/is);
  assert.match(chinese, /续费前.*列明渠道.*提出.*有效/s);
});

test("account security guidance matches Google and email-code sign-in", async () => {
  const { getPublicDocument } = await import("../src/legalContent.js");
  const english = JSON.stringify(getPublicDocument("en", "/security"));
  const chinese = JSON.stringify(getPublicDocument("zh-CN", "/security"));

  assert.match(english, /Google account.*email inbox.*multi-factor authentication/i);
  assert.match(chinese, /Google 账户.*邮箱.*多因素认证/);
  assert.doesNotMatch(`${english}\n${chinese}`, /strong,? unique password|唯一强密码/i);
});

test("public policies describe the current personal Lite product, not workspace membership", async () => {
  const { getPublicDocument } = await import("../src/legalContent.js");
  const english = ["/terms", "/privacy", "/security"]
    .map((route) => JSON.stringify(getPublicDocument("en", route)))
    .join("\n");
  const chinese = ["/terms", "/privacy", "/security"]
    .map((route) => JSON.stringify(getPublicDocument("zh-CN", route)))
    .join("\n");

  assert.match(english, /personal account/i);
  assert.match(chinese, /个人账户/);
  assert.doesNotMatch(english, /workspace membership|workspace administrators?|bind that organization/i);
  assert.doesNotMatch(chinese, /工作空间成员|工作空间管理员|代表组织使用/);
});

test("billing policies put statutory withdrawal rights before the no-voluntary-refund rule", async () => {
  const { getPublicDocument } = await import("../src/legalContent.js");

  for (const locale of ["en", "zh-CN"]) {
    const refund = getPublicDocument(locale, "/refund-policy");
    const text = JSON.stringify(refund);
    const statutorySection = refund.sections.findIndex((section) =>
      locale === "zh-CN" ? /法定撤回权/.test(section.heading) : /statutory withdrawal rights/i.test(section.heading),
    );
    const noVoluntarySection = refund.sections.findIndex((section) =>
      locale === "zh-CN" ? /不提供自愿退款/.test(section.heading) : /no voluntary refunds/i.test(section.heading),
    );

    assert.ok(statutorySection >= 0 && statutorySection < noVoluntarySection);
    assert.match(text, locale === "zh-CN" ? /中国、韩国和巴西.*7\s*日/ : /China, South Korea, and Brazil.*7 days/i);
    assert.match(text, locale === "zh-CN" ? /欧盟、欧洲经济区、瑞士和英国.*14\s*日/ : /EU, EEA, Switzerland, and the UK.*14 days/i);
    assert.match(
      text,
      locale === "zh-CN"
        ? /土耳其.*以色列.*加拿大.*新加坡/s
        : /Turkey.*Israel.*Canada.*Singapore/is,
    );
    assert.match(
      text,
      locale === "zh-CN" ? /明确同意.*开始使用.*撤回权/ : /express consent.*begin using.*withdrawal right/i,
    );
    assert.match(text, /https:\/\/www\.paddle\.com\/legal\/refund-policy/);
  }
});

test("privacy and terms make narrow, jurisdiction-correct promises", async () => {
  const { getPublicDocument } = await import("../src/legalContent.js");
  const englishPrivacy = JSON.stringify(getPublicDocument("en", "/privacy"));
  const chinesePrivacy = JSON.stringify(getPublicDocument("zh-CN", "/privacy"));
  const englishTerms = JSON.stringify(getPublicDocument("en", "/terms"));
  const chineseTerms = JSON.stringify(getPublicDocument("zh-CN", "/terms"));

  assert.match(englishPrivacy, /musuw does not use.*personal account content.*train.*general-purpose|foundation models/i);
  assert.match(chinesePrivacy, /musuw 不会.*个人账户内容.*训练.*通用模型|基础模型/);
  assert.match(englishTerms, /separate, express opt-in/i);
  assert.match(chineseTerms, /另行明确选择加入/);

  assert.doesNotMatch(chinesePrivacy, /合理运营利益|依赖合法利益/);
  assert.match(chinesePrivacy, /履行合同.*法定义务.*同意.*法律允许/);
  assert.match(chinesePrivacy, /隐私政策本身不构成.*单独同意/);
  assert.match(englishPrivacy, /privacy policy itself is not separate consent/i);
  assert.match(chinesePrivacy, /敏感个人信息.*单独同意/);
  assert.match(englishPrivacy, /sensitive personal data.*separate consent/i);
  assert.match(englishPrivacy, /explanation.*automated decision.*human review/is);
  assert.match(chinesePrivacy, /说明.*自动化决策.*人工复核/s);

  assert.match(englishTerms, /data-protection or security obligations/i);
  assert.match(chineseTerms, /个人信息保护或数据安全义务/);
  assert.match(englishTerms, /must be at least 16/i);
  assert.match(chineseTerms, /必须年满 16 周岁/);
});

test("renewal policy states the qualified legal reminder duty without promising every-cycle reminders", async () => {
  const { getPublicDocument } = await import("../src/legalContent.js");
  const english = JSON.stringify(getPublicDocument("en", "/subscription-policy"));
  const chinese = JSON.stringify(getPublicDocument("zh-CN", "/subscription-policy"));

  assert.match(english, /jurisdictions and subscription intervals for which law requires.*advance renewal reminder/i);
  assert.match(chinese, /法律要求的地区和订阅周期.*提前发送续费提醒/);
  assert.match(english, /China.*before each recurring charge.*time.*amount.*cancel/is);
  assert.match(chinese, /中国.*每次自动续费扣款前.*扣款时间.*金额.*取消途径/s);
  assert.doesNotMatch(`${english}\n${chinese}`, /supported by the provider|服务商支持时/);
});
