import assert from "node:assert/strict";
import test from "node:test";
import { createPublicAnalytics } from "../src/publicAnalytics.js";

const measurementId = "G-TEST123456";

test("the English homepage uses the same consent boundary and strips URL details", () => {
  const env = browser({ href: "https://musuw.com/en?source=private#private" });
  const analytics = createPublicAnalytics({ ...env, measurementId });
  analytics.start();
  assert.equal(analytics.enabled, true);
  assert.equal(env.scripts.length, 0);
  analytics.setConsent("accepted");
  assert.equal(env.scripts.length, 1);
  const config = env.window.dataLayer.map((command) => [...command]).find(([command]) => command === "config")[2];
  assert.equal(config.page_location, "https://musuw.com/en");
});
function browser({ consent, href = "https://musuw.com/?email=private@example.com#private", referrer = "https://example.org/search?q=private#private" } = {}) {
  const values = new Map(consent ? [["musuw_analytics_consent_v1", consent]] : []);
  const scripts = [];
  const deletedCookies = [];
  const events = new Map();
  let cookies = "_ga=old; _ga_TEST123456=old; musuw_locale=zh";
  const win = {
    location: { href, hostname: new URL(href).hostname, reload() { win.reloaded = true; } },
    localStorage: { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) },
    addEventListener: (name, listener) => events.set(name, listener),
  };
  const doc = {
    referrer, title: "Musuw",
    createElement: () => ({ remove() { this.removed = true; } }),
    head: { appendChild: (script) => scripts.push(script) },
    get cookie() { return cookies; },
    set cookie(value) { deletedCookies.push(value); cookies = cookies.split("; ").filter((cookie) => cookie.split("=")[0] !== value.split("=")[0]).join("; "); },
  };
  return { window: win, document: doc, scripts, values, deletedCookies, events };
}

test("analytics stays completely unloaded without a valid ID or affirmative consent", () => {
  for (const id of ["", "not-a-ga-id", measurementId]) {
    const env = browser();
    const analytics = createPublicAnalytics({ ...env, measurementId: id });
    analytics.start();
    assert.equal(analytics.enabled, id === measurementId);
    assert.equal(analytics.consent, null);
    assert.equal(env.scripts.length, 0);
    assert.equal(env.window.dataLayer, undefined);
  }
});

test("accepting loads the official tag once with sanitized public metadata and no advertising", () => {
  const env = browser();
  const analytics = createPublicAnalytics({ ...env, measurementId });
  analytics.start();
  analytics.setConsent("accepted");
  analytics.start();
  analytics.setConsent("accepted");
  assert.equal(analytics.consent, "accepted");
  assert.equal(env.values.get("musuw_analytics_consent_v1"), "accepted");
  assert.equal(env.scripts.length, 1);
  assert.equal(env.scripts[0].src, "https://www.googletagmanager.com/gtag/js?id=G-TEST123456");
  const commands = env.window.dataLayer.map((command) => [...command]);
  const config = commands.find(([command]) => command === "config")[2];
  assert.equal(config.page_location, "https://musuw.com/");
  assert.equal(config.page_referrer, "https://example.org/");
  assert.equal(config.send_page_view, false);
  assert.equal(config.allow_google_signals, false);
  assert.equal(config.allow_ad_personalization_signals, false);
  assert.equal(config.cookie_domain, "none");
  assert.equal(commands.filter(([command, name]) => command === "event" && name === "page_view").length, 1);
  assert.doesNotMatch(JSON.stringify(commands), /private|email=|search\?q=|#|user_id|user_properties/);
});

test("saved acceptance resumes once while rejection and malformed preferences never load", () => {
  for (const consent of ["accepted", "rejected", "true", "invalid"]) {
    const env = browser({ consent });
    const analytics = createPublicAnalytics({ ...env, measurementId });
    analytics.start();
    analytics.start();
    assert.equal(env.scripts.length, consent === "accepted" ? 1 : 0);
    assert.equal(analytics.consent, ["accepted", "rejected"].includes(consent) ? consent : null);
  }
});

test("rejecting is remembered; withdrawing disables collection and clears GA cookies before reload", () => {
  const env = browser();
  const analytics = createPublicAnalytics({ ...env, measurementId });
  analytics.start();
  analytics.setConsent("rejected");
  assert.equal(env.scripts.length, 0);
  assert.equal(env.values.get("musuw_analytics_consent_v1"), "rejected");
  analytics.setConsent("accepted");
  analytics.setConsent("rejected");
  assert.equal(env.window[`ga-disable-${measurementId}`], true);
  assert.equal(env.window.reloaded, true);
  assert.equal(env.scripts[0].removed, true);
  assert.equal(env.document.cookie, "musuw_locale=zh");
  assert.ok(env.deletedCookies.some((cookie) => cookie.startsWith("_ga=") && cookie.includes("Max-Age=0")));
  assert.equal(env.values.get("musuw_analytics_consent_v1"), "rejected");
});

test("private, unknown, partner and preview URLs cannot load analytics even with saved acceptance", () => {
  for (const href of ["https://app.musuw.com/platform/chat/private", "https://musuw.com/private/user", "https://partners.musuw.com/", "http://localhost:3000/", "https://musuw.com/auth/callback"]) {
    const env = browser({ href, consent: "accepted" });
    const analytics = createPublicAnalytics({ ...env, measurementId });
    analytics.start();
    analytics.setConsent("accepted");
    assert.equal(analytics.enabled, false);
    assert.equal(env.scripts.length, 0);
  }
});

test("revocation in another tab stops an already active tab", () => {
  const env = browser({ consent: "accepted" });
  const analytics = createPublicAnalytics({ ...env, measurementId });
  analytics.start();
  env.values.set("musuw_analytics_consent_v1", "rejected");
  env.events.get("storage")({ key: "musuw_analytics_consent_v1" });
  assert.equal(env.window[`ga-disable-${measurementId}`], true);
  assert.equal(env.window.reloaded, true);
});

test("a blocked preference write cannot reload into an old accepted preference", () => {
  const env = browser({ consent: "accepted" });
  const analytics = createPublicAnalytics({ ...env, measurementId });
  analytics.start();
  env.window.localStorage.setItem = () => { throw new Error("Storage blocked"); };
  analytics.setConsent("rejected");
  assert.equal(analytics.consent, "rejected");
  assert.equal(env.window[`ga-disable-${measurementId}`], true);
  assert.equal(env.window.reloaded, undefined);
  assert.equal(env.document.cookie, "musuw_locale=zh");
});
