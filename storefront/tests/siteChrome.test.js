import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";
import { getStorefrontCopy } from "../src/i18n.js";
import { APP_LOGIN_URL, APP_URL } from "../src/productHandoff.js";
import { getPublicDocument } from "../src/legalContent.js";

const root = new URL("../", import.meta.url).pathname;

test("complete legal pages preserve their own language links before hydration", async (t) => {
  const server = await createServer({ root, appType: "custom", logLevel: "silent", server: { middlewareMode: true } });
  t.after(() => server.close());
  const { LegalPage } = await server.ssrLoadModule("/src/LegalPage.jsx");
  for (const pathname of ["/terms", "/privacy", "/contact"]) {
    const markup = renderToStaticMarkup(React.createElement(LegalPage, {
      copy: getStorefrontCopy("en"), locale: "en", document: getPublicDocument("en", pathname),
    }));
    for (const language of ["en", "zh-CN"]) assert.ok(markup.includes(`href="${pathname}?lang=${language}"`), `${pathname}: ${language}`);
  }
});

test("product entry links expose the same guest and authenticated actions on desktop and mobile", async (t) => {
  const server = await createServer({
    root,
    appType: "custom",
    logLevel: "silent",
    server: { middlewareMode: true },
  });
  t.after(() => server.close());

  const { ButtonLink, ProductEntryLinks } = await server.ssrLoadModule(
    "/src/components/SiteChrome.jsx",
  );
  assert.equal(typeof ProductEntryLinks, "function");

  for (const surface of ["desktop", "mobile"]) {
    const guestActions = renderToStaticMarkup(
      React.createElement(
        "div",
        { "data-surface": surface },
        React.createElement(ProductEntryLinks, { copy: getStorefrontCopy("en") }),
      ),
    );
    assert.equal(
      (guestActions.match(/href="https:\/\/app\.musuw\.com\/auth\/start"/g) ?? []).length,
      2,
    );
    assert.match(guestActions, />Log in<\/span>/);
    assert.match(guestActions, />Start free<\/span>/);
    assert.doesNotMatch(guestActions, /Open musuw|target="_blank"|rel="noreferrer"/);

    const authenticatedActions = renderToStaticMarkup(
      React.createElement(
        "div",
        { "data-surface": surface },
        React.createElement(ProductEntryLinks, {
          authenticated: true,
          copy: getStorefrontCopy("en"),
        }),
      ),
    );
    assert.equal((authenticatedActions.match(/<a /g) ?? []).length, 1);
    assert.match(authenticatedActions, new RegExp(`href="${APP_URL}"`));
    assert.match(authenticatedActions, />Open musuw<\/span>/);
    assert.doesNotMatch(authenticatedActions, /Log in|Start free|\/auth\/start/);
  }

  const explicitNewTab = renderToStaticMarkup(
    React.createElement(ButtonLink, { href: APP_LOGIN_URL, newTab: true }, "Open separately"),
  );
  assert.match(explicitNewTab, /target="_blank"/);
  assert.match(explicitNewTab, /rel="noreferrer"/);
});

test("language selection exposes crawlable home and article links in a compact dropdown", async (t) => {
  const server = await createServer({
    root,
    appType: "custom",
    logLevel: "silent",
    server: { middlewareMode: true },
  });
  t.after(() => server.close());

  const { LanguageSwitcher } = await server.ssrLoadModule(
    "/src/components/SiteChrome.jsx",
  );
  const english = renderToStaticMarkup(
    React.createElement(LanguageSwitcher, { locale: "en" }),
  );
  const chinese = renderToStaticMarkup(
    React.createElement(LanguageSwitcher, { locale: "zh-CN" }),
  );

  for (const markup of [english, chinese]) {
    assert.equal((markup.match(/<details\b/g) ?? []).length, 1);
    assert.match(markup, /href="\/"[^>]*lang="zh-CN"/);
    assert.match(markup, /href="\/en"[^>]*lang="en"/);
  }
  assert.match(english, /<summary[^>]*>EN/);
  assert.match(chinese, /<summary[^>]*>ZH/);
  const article = renderToStaticMarkup(React.createElement(LanguageSwitcher, { locale: "en", pathname: "/guides/citation-checks" }));
  assert.match(article, /href="\/zh\/guides\/citation-checks"/);
  assert.match(article, /href="\/guides\/citation-checks"/);
  const legal = renderToStaticMarkup(React.createElement(LanguageSwitcher, { locale: "en", pathname: "/privacy" }));
  assert.match(legal, /href="\/privacy\?lang=zh-CN"/);
  assert.match(legal, /href="\/privacy\?lang=en"/);
});

test("English navigation and logo return to the English homepage while public resources stay discoverable", async (t) => {
  const server = await createServer({ root, appType: "custom", logLevel: "silent", server: { middlewareMode: true } });
  t.after(() => server.close());
  const { SiteHeader, SiteFooter } = await server.ssrLoadModule("/src/components/SiteChrome.jsx");
  for (const component of [SiteHeader, SiteFooter]) {
    const markup = renderToStaticMarkup(React.createElement(component, { copy: getStorefrontCopy("en"), locale: "en" }));
    assert.match(markup, /class="brand" href="\/en"/);
    assert.match(markup, /href="\/en#pricing"/);
    assert.doesNotMatch(markup, /href="\/#/);
    if (component === SiteFooter) assert.match(markup, /href="\/press"/);
  }
});
