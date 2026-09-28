import { useEffect, useId, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ArrowUpRight } from "@phosphor-icons/react/ArrowUpRight";
import { List } from "@phosphor-icons/react/List";
import { Moon } from "@phosphor-icons/react/Moon";
import { Sun } from "@phosphor-icons/react/Sun";
import { X } from "@phosphor-icons/react/X";
import { getStorefrontCopy } from "../i18n";
import {
  MARKETING_FOOTER_GROUPS,
  MARKETING_NAVIGATION,
} from "../homepageMarketingRefresh";
import { APP_LOGIN_URL, APP_URL } from "../productHandoff";
import { readStorefrontAuthentication } from "../storefrontAuthStatus";
import { AnalyticsPreferences } from "./AnalyticsPreferences.jsx";
import { homePath, homepageHref, localeHref } from "../publicRoutes.js";
import { CITATION_GUIDES, getCitationGuide } from "../citationGuideContent.js";
import { NOTEBOOK_COMPARISONS, getNotebookComparison } from "../notebookComparisonContent.js";

const defaultCopy = getStorefrontCopy("en");
const navigationLabels = Object.freeze({
  en: Object.freeze(["Features", "Platform", "Pricing", "Security", "Contact", "Docs"]),
  zh: Object.freeze(["功能", "平台", "定价", "安全", "联系", "文档"]),
});

function publicNavigationLabels(copy) {
  return copy?.pricing?.currencyCode === "CNY" ? navigationLabels.zh : navigationLabels.en;
}

const footerLabels = Object.freeze({
  en: Object.freeze([
    Object.freeze({ title: "Product", links: Object.freeze(["Features", "Platform", "Pricing", "Docs"]) }),
    Object.freeze({ title: "Trust", links: Object.freeze(["FAQ", "Security", "Contact", "Media kit"]) }),
    Object.freeze({ title: "Legal", links: Object.freeze(["Terms", "Privacy", "Refunds", "Subscription", "Cookies"]) }),
  ]),
  zh: Object.freeze([
    Object.freeze({ title: "产品", links: Object.freeze(["功能", "平台", "定价", "文档"]) }),
    Object.freeze({ title: "信任", links: Object.freeze(["常见问题", "安全", "联系", "媒体资料"]) }),
    Object.freeze({ title: "法律", links: Object.freeze(["服务条款", "隐私", "退款", "订阅与取消", "Cookie"]) }),
  ]),
});

function publicFooterLabels(copy) {
  return copy?.pricing?.currencyCode === "CNY" ? footerLabels.zh : footerLabels.en;
}

export function Brand({ copy = defaultCopy, locale = copy?.pricing?.currencyCode === "CNY" ? "zh-CN" : "en" }) {
  return (
    <a className="brand" href={homePath(locale)} aria-label={copy.brand.homeLabel}>
      <span className="brand-mark" aria-hidden="true">
        <img src="/images/musuw-logo.png" alt="" width="30" height="30" draggable={false} />
      </span>
    </a>
  );
}

export function ButtonLink({
  children,
  href,
  variant = "primary",
  className = "",
  icon = false,
  onClick,
  disabled = false,
  ariaBusy = false,
  newTab = false,
}) {
  if (onClick) {
    return (
      <button
        type="button"
        className={`button button-${variant} ${className}`}
        onClick={onClick}
        disabled={disabled}
        aria-busy={ariaBusy}
      >
        <span>{children}</span>
        {icon ? <ArrowUpRight size={17} weight="bold" aria-hidden="true" /> : null}
      </button>
    );
  }

  return (
    <a
      className={`button button-${variant} ${className}`}
      href={href}
      target={newTab ? "_blank" : undefined}
      rel={newTab ? "noreferrer" : undefined}
    >
      <span>{children}</span>
      {icon ? <ArrowUpRight size={17} weight="bold" aria-hidden="true" /> : null}
    </a>
  );
}

export function LanguageSwitcher({ locale = "en", onLocaleChange, pathname }) {
  const isZh = locale === "zh-CN" || locale === "zh";
  const menuRef = useRef(null);
  const path = pathname ?? (typeof window !== "undefined" ? window.location.pathname : homePath(locale));
  const alternates = getCitationGuide(path) ? CITATION_GUIDES : getNotebookComparison(path) ? NOTEBOOK_COMPARISONS : null;

  useEffect(() => {
    const closeOutside = (event) => {
      if (!menuRef.current?.contains(event.target)) menuRef.current?.removeAttribute("open");
    };
    const closeOnEscape = (event) => {
      if (event.key !== "Escape" || !menuRef.current?.open) return;
      menuRef.current.removeAttribute("open");
      menuRef.current.querySelector("summary")?.focus();
    };
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, []);

  return (
    <details className="lang-switcher" ref={menuRef}>
      <summary className="lang-select" aria-label={isZh ? "选择语言" : "Select language"}>{isZh ? "ZH" : "EN"}<span aria-hidden="true">⌄</span></summary>
      <div className="lang-options">
        {["zh-CN", "en"].map((nextLocale) => <a
          key={nextLocale}
          href={localeHref(path, nextLocale, { alternatePath: alternates?.[nextLocale].path })}
          lang={nextLocale}
          hrefLang={nextLocale}
          aria-current={(isZh ? "zh-CN" : "en") === nextLocale ? "page" : undefined}
          onClick={(event) => {
            if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
            // Keep campaign details and an in-page destination when navigating in the browser.
            event.currentTarget.href = localeHref(path, nextLocale, { search: window.location.search, hash: window.location.hash, alternatePath: alternates?.[nextLocale].path });
            menuRef.current?.removeAttribute("open");
            if (onLocaleChange) {
              event.preventDefault();
              onLocaleChange(nextLocale);
            }
          }}
        >{nextLocale === "en" ? "English" : "中文"}</a>)}
      </div>
    </details>
  );
}

export function ProductEntryLinks({ authenticated = false, copy = defaultCopy }) {
  if (authenticated) {
    return <ButtonLink href={APP_URL}>{copy.nav.openApp}</ButtonLink>;
  }

  return (
    <>
      <ButtonLink href={APP_LOGIN_URL} variant="secondary">
        {copy.nav.login}
      </ButtonLink>
      <ButtonLink href={APP_LOGIN_URL}>{copy.nav.getStarted}</ButtonLink>
    </>
  );
}

export function SiteHeader({
  copy = defaultCopy,
  navigation = MARKETING_NAVIGATION,
  locale,
  onLocaleChange,
  theme = "light",
  onThemeToggle,
  pathname,
}) {
  const [open, setOpen] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);
  const mobileNavId = useId();
  const menuButtonRef = useRef(null);
  const headerRef = useRef(null);
  const reduceMotion = useReducedMotion();
  const labels = publicNavigationLabels(copy);
  const currentLocale = locale || (copy?.pricing?.currencyCode === "CNY" ? "zh-CN" : "en");
  const isZh = currentLocale === "zh-CN" || currentLocale === "zh";
  const isDark = theme === "dark";
  const themeLabel = isDark
    ? isZh
      ? "切换到浅色模式"
      : "Switch to light mode"
    : isZh
      ? "切换到深色模式"
      : "Switch to dark mode";

  useEffect(() => {
    let mounted = true;
    void readStorefrontAuthentication().then((nextAuthenticated) => {
      if (mounted && nextAuthenticated) setAuthenticated(true);
    });
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    const closeMenu = () => setOpen(false);
    window.addEventListener("hashchange", closeMenu);
    return () => window.removeEventListener("hashchange", closeMenu);
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    const desktopQuery = window.matchMedia("(min-width: 1024px)");
    const previousBodyOverflow = document.body.style.overflow;
    const closeAtDesktop = (event) => {
      if (event.matches) setOpen(false);
    };
    const closeOnEscape = (event) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      menuButtonRef.current?.focus();
    };
    const closeOnOutsidePointer = (event) => {
      if (headerRef.current?.contains(event.target)) return;
      setOpen(false);
      menuButtonRef.current?.focus();
    };
    document.body.style.overflow = "hidden";
    if (desktopQuery.matches) setOpen(false);
    desktopQuery.addEventListener("change", closeAtDesktop);
    document.addEventListener("keydown", closeOnEscape);
    document.addEventListener("pointerdown", closeOnOutsidePointer);
    return () => {
      document.body.style.overflow = previousBodyOverflow;
      desktopQuery.removeEventListener("change", closeAtDesktop);
      document.removeEventListener("keydown", closeOnEscape);
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
    };
  }, [open]);

  return (
    <header
      className="site-header"
      ref={headerRef}
      style={{
        WebkitBackdropFilter: "blur(2px)",
        backdropFilter: "blur(2px)",
      }}
    >
      <div className="container nav-shell">
        <Brand copy={copy} locale={currentLocale} />
        <nav className="desktop-nav" aria-label={copy.nav.primaryAria}>
          {navigation.map((item, index) => (
            <a key={item.href} href={homepageHref(item.href, currentLocale)}>
              {labels[index] ?? item.label}
            </a>
          ))}
        </nav>
        <div className="nav-actions">
          <button
            type="button"
            className="theme-toggle"
            aria-label={themeLabel}
            title={themeLabel}
            onClick={onThemeToggle}
          >
            {isDark ? <Sun size={16} /> : <Moon size={16} />}
          </button>
          <LanguageSwitcher locale={currentLocale} pathname={pathname} onLocaleChange={onLocaleChange} />
          <ProductEntryLinks authenticated={authenticated} copy={copy} />
          <button
            aria-controls={mobileNavId}
            className="menu-button"
            type="button"
            aria-label={open ? copy.nav.closeMenu : copy.nav.openMenu}
            aria-expanded={open}
            onClick={() => setOpen((value) => !value)}
            ref={menuButtonRef}
          >
            {open ? <X size={22} weight="bold" /> : <List size={24} weight="bold" />}
          </button>
        </div>
      </div>
      <AnimatePresence>
        {open ? (
          <motion.nav
            className="mobile-nav"
            id={mobileNavId}
            aria-label={copy.nav.mobileAria}
            initial={reduceMotion ? false : { opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -12 }}
            transition={{ duration: 0.22 }}
          >
            {navigation.map((item, index) => (
              <a key={item.href} href={homepageHref(item.href, currentLocale)} onClick={() => setOpen(false)}>
                {labels[index] ?? item.label}
                <ArrowUpRight size={18} aria-hidden="true" />
              </a>
            ))}
            <div className="mobile-nav-actions">
              <ProductEntryLinks authenticated={authenticated} copy={copy} />
            </div>
          </motion.nav>
        ) : null}
      </AnimatePresence>
    </header>
  );
}

export function SiteFooter({ copy = defaultCopy, groups = MARKETING_FOOTER_GROUPS }) {
  const labels = publicFooterLabels(copy);
  const locale = copy?.pricing?.currencyCode === "CNY" ? "zh-CN" : "en";

  return (
    <footer className="site-footer">
      <div className="container footer-grid">
        <div className="footer-brand">
          <Brand copy={copy} />
        </div>
        {groups.map((group, groupIndex) => (
          <div className="footer-group" key={group.title}>
            <h3>{labels[groupIndex]?.title ?? group.title}</h3>
            {group.links.map(([label, href], linkIndex) => (
              <a href={homepageHref(href, locale)} key={label}>
                {labels[groupIndex]?.links[linkIndex] ?? label}
              </a>
            ))}
          </div>
        ))}
      </div>
      <div className="container footer-bottom">
        <span>{copy.footer.copyright}</span>
        <AnalyticsPreferences isZh={copy?.pricing?.currencyCode === "CNY"} />
      </div>
    </footer>
  );
}

export function SectionIntro({ label, title, body, align = "center", icon: Icon }) {
  return (
    <div className={`section-intro section-intro-${align}`}>
      {label ? (
        <p className="section-label">
          {Icon ? (
            <span className="section-label-icon" aria-hidden="true">
              <Icon size={20} weight="regular" />
            </span>
          ) : null}
          {label}
        </p>
      ) : null}
      <h2>{title}</h2>
      {body ? <p className="section-body">{body}</p> : null}
    </div>
  );
}
