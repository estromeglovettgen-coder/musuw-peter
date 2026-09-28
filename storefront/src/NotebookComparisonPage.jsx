import { SiteFooter, SiteHeader } from "./components/SiteChrome";
import { CITATION_GUIDES } from "./citationGuideContent";
import { NOTEBOOK_COMPARISONS, NOTEBOOK_COMPARISON_SOURCES } from "./notebookComparisonContent";
import { APP_LOGIN_URL } from "./productHandoff";
import "./citation-guide.css";
import "./notebook-comparison.css";

export function NotebookComparisonPage({ copy, comparison, onLocaleChange, theme, onThemeToggle }) {
  const guide = CITATION_GUIDES[comparison.locale];
  const home = comparison.locale === "en" ? "/en" : "/";
  return (
    <div className="notebook-comparison-page">
      <SiteHeader copy={copy} locale={comparison.locale} pathname={comparison.path} onLocaleChange={onLocaleChange} theme={theme} onThemeToggle={onThemeToggle} />
      <main className="container citation-guide-layout comparison-layout">
        <article>
          <p className="citation-guide-disclosure"><a href={home}>{comparison.locale === "en" ? "Home" : "首页"}</a></p>
          <nav className="citation-guide-languages" aria-label={comparison.languageLabel}>
            {Object.values(NOTEBOOK_COMPARISONS).map((page, index) => <span key={page.locale}>
              {index > 0 && <span aria-hidden="true"> / </span>}
              <a href={page.path} lang={page.locale} aria-current={page.locale === comparison.locale ? "page" : undefined}>{page.locale === "en" ? "English" : "中文"}</a>
            </span>)}
          </nav>
          <h1>{comparison.title}</h1>
          <p className="citation-guide-disclosure">{comparison.meta.author} · {comparison.updatedLabel} <time dateTime={comparison.meta.dateModified}>{comparison.meta.dateModified}</time></p>
          <p>{comparison.intro}</p>
          <p>{comparison.note} <a href={NOTEBOOK_COMPARISON_SOURCES[0]}>[1]</a></p>
          <p><a className="citation-guide-cta" href={guide.path}>{comparison.demo} →</a></p>
          <div className="comparison-table-scroll" role="region" aria-label={comparison.tableLabel} tabIndex={0}>
            <table>
              <caption>{comparison.tableLabel}</caption>
              <thead><tr><th scope="col">{comparison.column}</th><th scope="col">Musuw</th><th scope="col">Gemini Notebook <a href="#comparison-sources">[2, 3]</a></th></tr></thead>
              <tbody>{comparison.rows.map(([label, musuw, google]) => <tr key={label}><th scope="row">{label}</th><td>{musuw}</td><td>{google}</td></tr>)}</tbody>
            </table>
          </div>
          <p className="comparison-scroll-hint">{comparison.scrollHint}</p>
          <h2>{comparison.musuwTitle}</h2>
          <p>{comparison.musuwBody}</p>
          <h2>{comparison.workflowTitle}</h2>
          <ul className="citation-guide-verdicts">{comparison.workflow.map((item) => <li key={item}>{item}</li>)}</ul>
          <figure>
            <a href={comparison.image}><img src={comparison.image} width="3024" height="1898" alt={comparison.imageAlt} loading="lazy" /></a>
            <figcaption>{comparison.imageCaption}</figcaption>
          </figure>
          <h2>{comparison.googleTitle}</h2>
          <p>{comparison.googleBody} <a href={NOTEBOOK_COMPARISON_SOURCES[1]}>[2]</a></p>
          <h2>{comparison.limitsTitle}</h2>
          <ul className="citation-guide-verdicts">{comparison.limits.map((item) => <li key={item}>{item}</li>)}</ul>
          <h2>{comparison.docsTitle}</h2>
          <ul className="citation-guide-links">{comparison.docs.map((doc) => <li key={doc.href}><a href={doc.href}>{doc.label}</a></li>)}</ul>
          <h2>{comparison.evaluationTitle}</h2>
          <p>{comparison.evaluationBody}</p>
          <p><a className="citation-guide-cta" href={APP_LOGIN_URL}>{comparison.start} →</a></p>
          <p><a href={`${home}#pricing`}>{comparison.pricing} →</a></p>
          <h2 id="comparison-sources">{comparison.sourcesTitle}</h2>
          <ol className="comparison-sources">{NOTEBOOK_COMPARISON_SOURCES.map((href, index) => <li key={href}><a href={href}>{comparison.sourceLabels[index]}</a></li>)}</ol>
          <p className="citation-guide-disclosure">{comparison.disclosure}</p>
        </article>
      </main>
      <SiteFooter copy={copy} locale={comparison.locale} />
    </div>
  );
}
