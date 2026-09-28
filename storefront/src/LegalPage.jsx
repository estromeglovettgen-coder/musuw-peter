import { useState } from "react";
import { ArrowLeft } from "@phosphor-icons/react/ArrowLeft";
import { ArrowUpRight } from "@phosphor-icons/react/ArrowUpRight";
import { CalendarBlank } from "@phosphor-icons/react/CalendarBlank";
import { Check } from "@phosphor-icons/react/Check";
import { EnvelopeSimple } from "@phosphor-icons/react/EnvelopeSimple";
import { SiteFooter, SiteHeader } from "./components/SiteChrome";
import { LEGAL_OPERATOR } from "./legalContent";
import { homePath } from "./publicRoutes.js";

const navigation = {
  en: [
    ["Terms", "/terms"],
    ["Privacy", "/privacy"],
    ["Refunds", "/refund-policy"],
    ["Subscriptions", "/subscription-policy"],
    ["Acceptable Use", "/acceptable-use"],
    ["Cookies", "/cookies"],
    ["Security", "/security"],
    ["Contact", "/contact"]
  ],
  "zh-CN": [
    ["服务条款", "/terms"],
    ["隐私政策", "/privacy"],
    ["退款政策", "/refund-policy"],
    ["订阅与取消", "/subscription-policy"],
    ["可接受使用", "/acceptable-use"],
    ["Cookie 说明", "/cookies"],
    ["安全概览", "/security"],
    ["联系我们", "/contact"]
  ]
};

// Section headings retain their numbered copy in the document body. The
// ordered table of contents supplies its own marker, so remove only a leading
// editorial number there to avoid rendering labels such as "1. 1. Security".
function stripSectionNumber(heading) {
  return String(heading).replace(/^\s*\d+\s*[.、)]\s*/, "");
}

function renderBlock(block, index) {
  if (block.type === "list") {
    return (
      <ul key={index}>
        {block.items.map((item) => <li key={item}>{item}</li>)}
      </ul>
    );
  }

  if (block.type === "notice") {
    return <aside className="legal-notice" key={index}>{block.text}</aside>;
  }

  if (block.type === "email") {
    return (
      <a className="legal-action" href={`mailto:${block.address}`} key={index}>
        <EnvelopeSimple size={18} weight="bold" aria-hidden="true" />
        <span>{block.label}</span>
        <ArrowUpRight size={16} weight="bold" aria-hidden="true" />
      </a>
    );
  }

  if (block.type === "link") {
    return (
      <a className="legal-inline-link" href={block.href} key={index}>
        {block.label}
        <ArrowUpRight size={15} weight="bold" aria-hidden="true" />
      </a>
    );
  }

  return <p key={index}>{block.text}</p>;
}

function ContactPage({ document, copy, locale, onLocaleChange, theme, onThemeToggle }) {
  const [copyState, setCopyState] = useState("idle");
  const isChinese = locale === "zh-CN";
  const labels = locale === "zh-CN"
    ? {
        back: "返回首页",
        pill: "联系我们",
        heroTitle: "让你的知识在 musuw 中真正流动。",
        heroSummary: "告诉我们你正在解决的问题，我们会从产品支持、知识工作流和账户事项开始帮你梳理下一步。",
        reasons: ["有来源依据的回答与引用", "计划、隐私与数据控制"],
        channelLabel: "联系 musuw 团队",
        channelEyebrow: "直接联系",
        channelTitle: "通过本机邮件应用联系我们",
        channelNote: "选择邮箱后会打开本机邮件应用并生成草稿。网站不会直接发送邮件，也不会显示已送达状态。",
        emailLabel: "发送邮件",
        phoneLabel: "致电支持",
        copyEmail: "复制邮箱",
        copiedEmail: "已复制",
        copyUnavailable: "请手动复制邮箱",
        detailsEyebrow: "支持详情",
        detailsTitle: "需要更具体的帮助？",
        operator: "运营主体",
        categories: ["客户支持", "账单与退款", "隐私与安全", "支付审核"],
        updated: "生效日期",
      }
    : {
        back: "Back to home",
        pill: "Contact Us",
        heroTitle: "Keep your knowledge moving with musuw.",
        heroSummary: "Tell us what you are working through and we will help with product support, grounded knowledge workflows, and account questions.",
        reasons: ["Grounded answers with source citations", "Plans, privacy, and data controls"],
        channelLabel: "Contact the musuw team",
        channelEyebrow: "Direct contact",
        channelTitle: "Email us from your local app",
        channelNote: "Choosing email opens your local email app with a draft. The website does not send messages directly or show a delivery status.",
        emailLabel: "Send an email",
        phoneLabel: "Call support",
        copyEmail: "Copy email",
        copiedEmail: "Copied",
        copyUnavailable: "Copy the email manually",
        detailsEyebrow: "Support details",
        detailsTitle: "Need a more specific answer?",
        operator: "Operator",
        categories: ["Support", "Billing and refunds", "Privacy and security", "Merchant review"],
        updated: "Effective",
      };
  const supportEmailHref = `mailto:${LEGAL_OPERATOR.supportEmail}`;
  const supportPhoneHref = `tel:${LEGAL_OPERATOR.supportPhone.replaceAll(" ", "")}`;
  const copySupportEmail = async () => {
    if (!navigator.clipboard?.writeText) {
      setCopyState("unavailable");
      return;
    }
    try {
      await navigator.clipboard.writeText(LEGAL_OPERATOR.supportEmail);
      setCopyState("copied");
    } catch {
      setCopyState("unavailable");
    }
  };
  const contactSections = document.sections.map((section, index) => {
    if (index === 0 && !isChinese) {
      return {
        ...section,
        blocks: section.blocks.filter((block) => block.text !== LEGAL_OPERATOR.chineseName)
      };
    }
    return section;
  });

  return (
    <>
      <SiteHeader
        copy={copy}
        locale={locale}
        pathname={document.path}
        onLocaleChange={onLocaleChange}
        theme={theme}
        onThemeToggle={onThemeToggle}
      />
      <main className="contact-page">
        <div className="container contact-layout">
          <section className="contact-intro">
            <a className="legal-back" href={homePath(locale)}>
              <ArrowLeft size={16} weight="bold" aria-hidden="true" />
              {labels.back}
            </a>
            <span className="contact-pill">
              <EnvelopeSimple size={17} weight="bold" aria-hidden="true" />
              {labels.pill}
            </span>
            <h1>{labels.heroTitle}</h1>
            <p className="contact-summary">{labels.heroSummary}</p>
            <ul className="contact-reason-list">
              {labels.reasons.map((reason) => (
                <li key={reason}>
                  <Check size={18} weight="bold" aria-hidden="true" />
                  <span>{reason}</span>
                </li>
              ))}
            </ul>
          </section>

          <section className="contact-channel-shell" aria-label={labels.channelLabel}>
            <div className="contact-channel">
              <span className="legal-eyebrow">{labels.channelEyebrow}</span>
              <h2>{labels.channelTitle}</h2>
              <p className="contact-channel-note">{labels.channelNote}</p>
              <div className="contact-channel-actions">
                <a className="contact-email-action" href={supportEmailHref}>
                  <span>{labels.emailLabel}</span>
                  <span className="contact-address">{LEGAL_OPERATOR.supportEmail}</span>
                  <ArrowUpRight size={17} weight="bold" aria-hidden="true" />
                </a>
                <button className="contact-copy-button" type="button" onClick={copySupportEmail}>
                  {copyState === "copied" ? labels.copiedEmail : labels.copyEmail}
                </button>
              </div>
              <a className="contact-phone-action" href={supportPhoneHref}>
                <span>{labels.phoneLabel}</span>
                <span>{LEGAL_OPERATOR.supportPhone}</span>
                <ArrowUpRight size={16} weight="bold" aria-hidden="true" />
              </a>
              <p className="contact-channel-status" role="status" aria-live="polite">
                {copyState === "unavailable" ? labels.copyUnavailable : null}
              </p>
            </div>
          </section>
        </div>

        <section className="container contact-legal-strip" aria-labelledby="contact-details-title">
          <div className="contact-legal-heading">
            <span className="legal-eyebrow">{labels.detailsEyebrow}</span>
            <h2 id="contact-details-title">{labels.detailsTitle}</h2>
            <div className="legal-updated">
              <CalendarBlank size={17} weight="bold" aria-hidden="true" />
              <span>{labels.updated}: {document.updated}</span>
            </div>
          </div>
          <div className="contact-legal-list">
            {contactSections.map((section, index) => (
              <article className="contact-legal-item" key={section.heading}>
                <h3>{index === 0 ? labels.operator : labels.categories[index - 1] ?? section.heading}</h3>
                <div className="contact-legal-copy">
                  {section.blocks.map(renderBlock)}
                </div>
              </article>
            ))}
          </div>
        </section>
      </main>
      <SiteFooter copy={copy} />
    </>
  );
}

export function LegalPage({ document, copy, locale, onLocaleChange, theme, onThemeToggle }) {
  if (document.path === "/contact") {
    return (
      <ContactPage
        document={document}
        copy={copy}
        locale={locale}
        onLocaleChange={onLocaleChange}
        theme={theme}
        onThemeToggle={onThemeToggle}
      />
    );
  }

  const labels = locale === "zh-CN"
    ? { back: "返回首页", updated: "生效日期", contents: "本页目录", policies: "公开文件" }
    : { back: "Back to home", updated: "Effective", contents: "On this page", policies: "Public documents" };

  return (
    <>
      <SiteHeader
        copy={copy}
        locale={locale}
        pathname={document.path}
        onLocaleChange={onLocaleChange}
        theme={theme}
        onThemeToggle={onThemeToggle}
      />
      <main className="legal-page">
        <div className="legal-glow" aria-hidden="true" />
        <div className="container legal-layout">
          <aside className="legal-sidebar" aria-label={labels.policies}>
            <a className="legal-back" href={homePath(locale)}>
              <ArrowLeft size={16} weight="bold" aria-hidden="true" />
              {labels.back}
            </a>
            <p>{labels.policies}</p>
            <nav>
              {navigation[locale].map(([label, href]) => (
                <a className={document.path === href ? "active" : ""} href={href} key={href}>
                  {label}
                </a>
              ))}
            </nav>
          </aside>

          <article className="legal-document">
            <header className="legal-hero">
              <span className="legal-eyebrow">{document.eyebrow}</span>
              <h1>{document.title}</h1>
              <p>{document.summary}</p>
              <div className="legal-updated">
                <CalendarBlank size={17} weight="bold" aria-hidden="true" />
                <span>{labels.updated}: {document.updated}</span>
              </div>
            </header>

            <details className="legal-mobile-contents">
              <summary>{labels.contents}</summary>
              <ol>
                {document.sections.map((section, index) => (
                  <li key={section.heading}>
                    <a href={`#legal-section-${index + 1}`}>{stripSectionNumber(section.heading)}</a>
                  </li>
                ))}
              </ol>
            </details>

            <div className="legal-sections">
              {document.sections.map((section, sectionIndex) => (
                <section id={`legal-section-${sectionIndex + 1}`} key={section.heading}>
                  <h2>{section.heading}</h2>
                  <div className="legal-section-copy">
                    {section.blocks.map(renderBlock)}
                  </div>
                </section>
              ))}
            </div>
          </article>

          <aside className="legal-contents" aria-label={labels.contents}>
            <p>{labels.contents}</p>
            <ol>
              {document.sections.map((section, index) => (
                <li key={section.heading}>
                  <a href={`#legal-section-${index + 1}`}>{stripSectionNumber(section.heading)}</a>
                </li>
              ))}
            </ol>
          </aside>
        </div>
      </main>
      <SiteFooter copy={copy} />
    </>
  );
}

export function NotFoundPage({ copy, locale, pathname = "/", onLocaleChange, theme, onThemeToggle }) {
  return (
    <>
      <SiteHeader
        copy={copy}
        locale={locale}
        pathname={pathname}
        onLocaleChange={onLocaleChange}
        theme={theme}
        onThemeToggle={onThemeToggle}
      />
      <main className="not-found-page">
        <div>
          <span>404</span>
          <h1>{locale === "zh-CN" ? "没有找到这个页面" : "This page could not be found"}</h1>
          <p>
            {locale === "zh-CN"
              ? "链接可能已经变化。您可以返回 musuw 官网继续查看产品。"
              : "The link may have changed. Return to the musuw homepage to continue."}
          </p>
          <a className="button button-primary" href={homePath(locale)}>
            <span>{locale === "zh-CN" ? "返回首页" : "Back to home"}</span>
          </a>
        </div>
      </main>
      <SiteFooter copy={copy} />
    </>
  );
}
