import { ButtonLink, SiteFooter, SiteHeader } from "./components/SiteChrome";
import { LEGAL_OPERATOR } from "./legalContent";
import { SITE_LOGO_PATH } from "./seoMetadata";
import { getPressContent, PRESS_ARCHIVE, PRESS_BRIEFS, PRESS_IMAGES, PRESS_VIDEOS, WALKTHROUGH_VIDEOS } from "./pressContent";
import "./press.css";
import { homePath } from "./publicRoutes.js";

export function PressPage({ copy, locale, onLocaleChange, theme, onThemeToggle }) {
  const text = getPressContent(locale);
  const imageLocale = locale === "zh-CN" ? "zh" : "en";
  const renderVideo = (video, title) => (
    <figure className="press-card" key={video.id}>
      <video className={video.aspect !== "16x9" ? `is-portrait ratio-${video.aspect}` : undefined} controls playsInline preload="none" poster={video.poster} aria-label={`${title} — ${video.label}`}>
        <source src={video.src} type="video/mp4" />
        <track kind="captions" src={video.captions} srcLang={video.language} label={video.language === "zh" ? "中文" : "English"} />
      </video>
      <figcaption>
        <h3>{video.label}</h3>
        <p className="press-note">{video.resolution} · {video.duration} s · MP4</p>
        <div className="press-links">
          <a href={video.src} download>{text.downloadVideo} ↓</a>
          <span>{text.captions}: <a href={video.captions} download>VTT</a> / <a href={video.subtitles} download>SRT</a></span>
        </div>
      </figcaption>
    </figure>
  );
  return (
    <div className="press-page">
      <SiteHeader copy={copy} locale={locale} pathname="/press" onLocaleChange={onLocaleChange} theme={theme} onThemeToggle={onThemeToggle} />
      <main className="container press-layout">
        <header className="press-intro">
          <p className="section-label">{text.eyebrow}</p>
          <h1>{text.title}</h1>
          <p className="press-description">{text.intro}</p>
          <div className="press-actions">
            <ButtonLink href={locale === "zh-CN" ? "/zh/guides/citation-checks" : "/guides/citation-checks"}>{text.demo}</ButtonLink>
            <ButtonLink href={`${homePath(locale)}#pricing`} variant="secondary">{text.pricing}</ButtonLink>
          </div>
          <a className="press-download" href={PRESS_ARCHIVE} download>{text.downloadKit} ↓</a>
          <p className="press-note">{text.kitNote}</p>
          <div className="press-links">
            <span>{text.briefs}:</span>
            {PRESS_BRIEFS.map((brief) => <a key={brief.language} href={brief.src} hrefLang={brief.language} download>{brief.label} ↓</a>)}
          </div>
        </header>

        <section className="press-section" aria-labelledby="press-walkthroughs">
          <h2 id="press-walkthroughs">{text.walkthroughTitle}</h2>
          <p className="press-description">{text.walkthroughNote}</p>
          <div className="press-grid">{WALKTHROUGH_VIDEOS.map((video) => renderVideo(video, text.walkthroughTitle))}</div>
        </section>

        <section className="press-section" aria-labelledby="press-videos">
          <h2 id="press-videos">{text.videoTitle}</h2>
          <p className="press-description">{text.videoNote}</p>
          <div className="press-grid">{PRESS_VIDEOS.map((video) => renderVideo(video, text.videoTitle))}</div>
        </section>

        <section className="press-section" aria-labelledby="press-screenshots">
          <h2 id="press-screenshots">{text.screenshots}</h2>
          <p className="press-description">{text.screenshotNote}</p>
          <div className="press-grid">
            {PRESS_IMAGES.map((image) => (
              <figure className="press-card" key={image.src}>
                <a href={image.src} download><img src={image.src} alt={image[imageLocale]} width="3024" height="1898" loading="lazy" /></a>
                <figcaption><h3>{image[imageLocale]}</h3><a href={image.src} download>{text.downloadImage} ↓</a></figcaption>
              </figure>
            ))}
          </div>
        </section>

        <section className="press-section press-brand" aria-labelledby="press-brand">
          <div className="press-logo"><img src={SITE_LOGO_PATH} alt={text.logo} width="120" height="120" /></div>
          <div>
            <h2 id="press-brand">{text.brandTitle}</h2>
            <a className="press-download" href={SITE_LOGO_PATH} download>{text.downloadLogo} ↓</a>
            <p>{text.contact} <a href={`mailto:${LEGAL_OPERATOR.supportEmail}`}>{LEGAL_OPERATOR.supportEmail}</a></p>
            <p className="press-note">{text.usage}</p>
          </div>
        </section>
      </main>
      <SiteFooter copy={copy} />
    </div>
  );
}
