import { SiteFooter, SiteHeader } from "./components/SiteChrome";
import { CITATION_GUIDES, CITATION_GUIDE_DOCUMENTS, CITATION_GUIDE_SOURCE } from "./citationGuideContent";
import { APP_LOGIN_URL } from "./productHandoff";
import "./citation-guide.css";

export function CitationGuidePage({ copy, guide, onLocaleChange, theme, onThemeToggle }) {
  const home = guide.locale === "en" ? "/en" : "/";
  return (
    <div className="citation-guide-page">
      <SiteHeader copy={copy} locale={guide.locale} pathname={guide.path} onLocaleChange={onLocaleChange} theme={theme} onThemeToggle={onThemeToggle} />
      <main className="container citation-guide-layout">
        <article>
          <p className="citation-guide-disclosure"><a href={home}>{guide.locale === "en" ? "Home" : "首页"}</a></p>
          <nav className="citation-guide-languages" aria-label={guide.languageLabel}>
            <a href={CITATION_GUIDES.en.path} lang="en" aria-current={guide.locale === "en" ? "page" : undefined}>English</a>
            <span aria-hidden="true"> / </span>
            <a href={CITATION_GUIDES["zh-CN"].path} lang="zh-CN" aria-current={guide.locale === "zh-CN" ? "page" : undefined}>中文</a>
          </nav>
          <h1>{guide.title}</h1>
          <p className="citation-guide-disclosure">{guide.meta.author} · {guide.updatedLabel} <time dateTime={guide.meta.dateModified}>{guide.meta.dateModified}</time></p>
          <p>{guide.intro}</p>
          <p>{guide.exampleBefore}<a href="#cedar-source-files">{guide.sourceLabel}</a>{guide.exampleAfter}</p>
          <details id="cedar-source-files" className="citation-guide-sources">
            <summary>{guide.sourceSummary}</summary>
            <ul>{CITATION_GUIDE_DOCUMENTS.map((filename) => <li key={filename}><a href={`/examples/cedar/${filename}`} download>{filename}</a></li>)}</ul>
            <a href={CITATION_GUIDE_SOURCE}>{guide.sourceMirror}</a>
          </details>
          <figure>
            <video controls playsInline preload="none" poster={guide.videoPoster} aria-label={guide.videoLabel}>
              <source src={guide.video} type="video/mp4" />
              <track kind="captions" src={guide.captions} srcLang={guide.locale} label={guide.locale === "en" ? "English" : "中文"} />
              <a href={guide.video}>{guide.videoLabel}</a>
            </video>
            <figcaption>{guide.videoCaption} <a href={guide.video} download>{guide.videoDownload}</a></figcaption>
          </figure>
          {guide.checks.map((check, index) => <section className="citation-guide-check" key={check.title}>
            <h2>{index + 1}. {check.title}</h2>
            <p>{check.body}</p>
          </section>)}
          <h2>{guide.verdictTitle}</h2>
          <p>{guide.verdictIntro}</p>
          <ul className="citation-guide-verdicts">{guide.verdicts.map((verdict) => <li key={verdict.title}><strong>{verdict.title}{guide.locale === "en" ? ": " : "："}</strong>{verdict.body}</li>)}</ul>
          <figure>
            <a href={guide.image}><img src={guide.image} alt={guide.imageAlt} width="1512" height="782" loading="lazy" /></a>
            <figcaption>{guide.imageCaption}</figcaption>
          </figure>
          <h2>{guide.nextTitle}</h2>
          <p>{guide.nextBody}</p>
          <ul className="citation-guide-links">{guide.docs.map((doc) => <li key={doc.href}><a href={doc.href}>{doc.label}</a></li>)}</ul>
          <p><a className="citation-guide-cta" href={APP_LOGIN_URL}>{guide.start} →</a></p>
          <p><a href={`${home}#demo`}>{guide.cta} →</a></p>
          <p className="citation-guide-disclosure">{guide.disclosure}</p>
        </article>
      </main>
      <SiteFooter copy={copy} locale={guide.locale} />
    </div>
  );
}
