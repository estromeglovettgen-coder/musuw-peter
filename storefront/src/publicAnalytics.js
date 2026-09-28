import { PUBLIC_DOCUMENT_PATHS } from "./legalContent.js";
import { CITATION_GUIDES } from "./citationGuideContent.js";
import { NOTEBOOK_COMPARISONS } from "./notebookComparisonContent.js";

const CONSENT_KEY = "musuw_analytics_consent_v1";
const PUBLIC_PATHS = new Set(["/", "/en", "/zh", "/press", ...PUBLIC_DOCUMENT_PATHS,
  ...Object.values(CITATION_GUIDES).map((page) => page.path),
  ...Object.values(NOTEBOOK_COMPARISONS).map((page) => page.path)]);

function publicPage(href) {
  try {
    const url = new URL(href);
    return url.protocol === "https:" && ["musuw.com", "www.musuw.com"].includes(url.hostname)
      && PUBLIC_PATHS.has(url.pathname.replace(/\/$/, "") || "/") ? url : null;
  } catch { return null; }
}

export function createPublicAnalytics({ measurementId, window: win, document: doc }) {
  const page = publicPage(win?.location.href);
  const enabled = /^G-[A-Z0-9]{6,20}$/.test(measurementId ?? "") && !!page;
  let consent = null;
  let loaded = false;
  let started = false;
  let script;

  function readConsent() {
    try {
      const value = win.localStorage.getItem(CONSENT_KEY);
      return ["accepted", "rejected"].includes(value) ? value : null;
    } catch { return null; }
  }

  function stop(reload = true) {
    // The documented kill switch applies before clearing cookies or reloading.
    win[`ga-disable-${measurementId}`] = true;
    try {
      const names = doc.cookie.split(";").map((part) => part.trim().split("=")[0]).filter((name) => /^_ga(?:_|$)/.test(name));
      const domains = ["", `; Domain=${page.hostname}`, "; Domain=musuw.com"];
      for (const name of names) {
        for (const domain of new Set(domains)) doc.cookie = `${name}=; Max-Age=0; Path=/${domain}; SameSite=Lax; Secure`;
      }
    } catch { /* Cookie access can be blocked; the collection kill switch still applies. */ }
    // Unload all SDK timers/listeners; consent remains rejected on the next page.
    if (loaded && reload) {
      script?.remove();
      win.location.reload();
    }
  }

  function load() {
    if (!enabled || consent !== "accepted") return;
    win[`ga-disable-${measurementId}`] = false;
    if (loaded) return;
    loaded = true;
    let referrer = "";
    try {
      const source = new URL(doc.referrer);
      if (["http:", "https:"].includes(source.protocol)) referrer = `${source.origin}/`;
    } catch { /* No referrer. */ }
    const metadata = { page_location: `${page.origin}${page.pathname}`, page_referrer: referrer, page_title: doc.title };
    win.dataLayer = win.dataLayer || [];
    win.gtag = function () { win.dataLayer.push(arguments); };
    win.gtag("consent", "default", {
      analytics_storage: "granted", ad_storage: "denied", ad_user_data: "denied", ad_personalization: "denied",
    });
    win.gtag("set", { ...metadata, ads_data_redaction: true, url_passthrough: false });
    win.gtag("js", new Date());
    win.gtag("config", measurementId, {
      ...metadata, send_page_view: false, allow_google_signals: false,
      allow_ad_personalization_signals: false, cookie_domain: "none", cookie_flags: "SameSite=Lax;Secure",
    });
    win.gtag("event", "page_view", { ...metadata, send_to: measurementId });
    script = doc.createElement("script");
    script.async = true;
    script.referrerPolicy = "no-referrer";
    script.src = `https://www.googletagmanager.com/gtag/js?id=${measurementId}`;
    doc.head.appendChild(script);
  }

  return {
    enabled,
    get consent() { return consent; },
    start() {
      if (!enabled || started) return;
      started = true;
      consent = readConsent();
      win.addEventListener("storage", (event) => {
        if (event.key !== CONSENT_KEY && event.key !== null) return;
        consent = readConsent();
        if (consent === "accepted") load();
        else stop();
      });
      if (consent === "accepted") load();
      else stop();
    },
    setConsent(next) {
      if (!enabled || !["accepted", "rejected"].includes(next)) return;
      consent = next;
      let persisted = false;
      try { win.localStorage.setItem(CONSENT_KEY, next); persisted = true; } catch { /* Keep the current tab choice. */ }
      if (next === "accepted") load();
      // Do not reload into a stale accepted value if the browser blocks writes.
      else stop(persisted);
    },
  };
}

let runtime;
export function getPublicAnalytics() {
  if (typeof window === "undefined") return null;
  runtime ??= createPublicAnalytics({
    measurementId: import.meta.env?.VITE_GA_MEASUREMENT_ID ?? "",
    window, document,
  });
  return runtime;
}
