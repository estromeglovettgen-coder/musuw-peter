import { test, expect } from "@playwright/test";

function parseRgb(value) {
  const channels = value.match(/[\d.]+/g)?.map(Number) ?? [];
  return channels.length >= 3 ? channels.slice(0, 3) : null;
}

function relativeLuminance(rgb) {
  const linear = rgb.map((channel) => {
    const normalized = channel / 255;
    return normalized <= 0.04045
      ? normalized / 12.92
      : ((normalized + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

async function readableContrast(locator, pseudo = null) {
  return locator.first().evaluate((element, pseudoElement) => {
    const parse = (value) => {
      const channels = value.match(/[\d.]+/g)?.map(Number) ?? [];
      if (channels.length < 3) return null;
      return [channels[0], channels[1], channels[2], channels[3] ?? 1];
    };
    const luminance = (rgb) => {
      const linear = rgb.slice(0, 3).map((channel) => {
        const normalized = channel / 255;
        return normalized <= 0.04045
          ? normalized / 12.92
          : ((normalized + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
    };

    const foreground = parse(getComputedStyle(element, pseudoElement).color);
    let background = null;
    for (let current = element; current && !background; current = current.parentElement) {
      const candidate = parse(getComputedStyle(current).backgroundColor);
      if (candidate && candidate[3] >= 0.92) background = candidate;
    }
    background ??= [255, 255, 255, 1];
    const lighter = Math.max(luminance(foreground), luminance(background));
    const darker = Math.min(luminance(foreground), luminance(background));
    return {
      background,
      foreground,
      ratio: (lighter + 0.05) / (darker + 0.05),
    };
  }, pseudo);
}

const readableSelectors = [
  [".hero-demo-answer p", null],
  [".hero-demo-answer h4", null],
  [".authoritative-chat-composer__textarea", null],
  [".authoritative-chat-composer__textarea", "::placeholder"],
  [".visual-chat-composer__combined-picker-model", null],
  [".final-cta-card .authoritative-chat-composer__textarea", null],
  [".visual-rag-pipeline__reference-summary", null],
  [".real-chat-citation", null],
  [".kb-preview-index-header span", null],
  [".kb-preview-graph-search span", null],
  [".kb-preview-index-body p", null],
  [".kb-preview-content-link", null],
  [".billing-period-label", null],
  [".plan-price span", null],
  [".footer-bottom span", null],
];

for (const theme of ["light", "dark"]) {
  test(`${theme} theme keeps every public product surface native and readable`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce", colorScheme: theme });
    await page.addInitScript(({ selectedTheme }) => {
      localStorage.setItem("musuw_locale", "zh-CN");
      localStorage.setItem("musuw-theme", selectedTheme);
    }, { selectedTheme: theme });
    await page.goto("/", { waitUntil: "domcontentloaded" });

    await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
    await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute(
      "content",
      theme === "dark" ? "#0c0c10" : "#ffffff",
    );

    for (const selector of [
      ".hero-product-demo",
      '[data-capability-demo="reasoning"]',
      ".final-cta-card",
      '[data-product-page-shell="wiki"]',
      '[data-product-page-shell="graph"]',
    ]) {
      const surface = page.locator(selector).first();
      await expect(surface, selector).toBeVisible();
      await expect.poll(
        () => surface.evaluate((element) => getComputedStyle(element).filter),
        {
          message: `${selector} must use native theme colors rather than whole-surface inversion`,
          timeout: 1_000,
        },
      ).toBe("none");
    }

    const wiki = page.locator('[data-product-page-shell="wiki"]');

    for (const [selector, pseudo] of readableSelectors) {
      const target = page.locator(selector).first();
      await expect(target, selector).toHaveCount(1);
      if (!(await target.isVisible())) continue;
      const result = await readableContrast(target, pseudo);
      expect(
        result.ratio,
        `${selector}${pseudo ?? ""}: ${JSON.stringify(result)}`,
      ).toBeGreaterThanOrEqual(4.5);
    }

    const surfaces = await page.locator([
      "body",
      ".hero-product-demo",
      '[data-capability-demo="reasoning"]',
      ".final-cta-card",
      ".authoritative-chat-composer__surface",
      ".kb-product-preview-wiki",
      ".kb-preview-graph-canvas",
      ".musuw-shell-collapsed-nav.is-active",
    ].join(",")).evaluateAll((elements) => elements.map((element) => {
      for (let current = element; current; current = current.parentElement) {
        const color = getComputedStyle(current).backgroundColor;
        const channels = color.match(/[\d.]+/g)?.map(Number) ?? [];
        if (channels.length >= 3 && (channels[3] ?? 1) >= 0.92) return color;
      }
      return getComputedStyle(document.body).backgroundColor;
    }));
    for (const color of surfaces) {
      const rgb = parseRgb(color);
      expect(rgb, color).not.toBeNull();
      const luminance = relativeLuminance(rgb);
      if (theme === "dark") {
        expect(luminance, color).toBeLessThan(0.08);
      } else {
        expect(luminance, color).toBeGreaterThan(0.82);
      }
    }

    for (const sidebar of await page.locator('[data-product-app-sidebar="true"]').all()) {
      await expect(sidebar).toHaveAttribute("data-product-app-sidebar-state", "collapsed");
    }

    await expect(wiki).toHaveAttribute("data-demo-phase", "page");
    await expect(wiki.locator('[data-wiki-page-id="index"]')).toBeVisible();
    await expect(wiki.locator('[data-wiki-auto-pointer]')).toHaveCount(0);
    const wikiCamera = wiki.locator('[data-wiki-camera="true"]');
    await expect(wikiCamera).toHaveAttribute("data-wiki-camera-scale", "1");
    const wikiMatrix = await wikiCamera.evaluate((element) => {
      const matrix = new DOMMatrix(getComputedStyle(element).transform);
      return { scaleX: matrix.a, scaleY: matrix.d, x: matrix.e, y: matrix.f };
    });
    expect(wikiMatrix, JSON.stringify(wikiMatrix)).toEqual({ scaleX: 1, scaleY: 1, x: 0, y: 0 });

    if (page.viewportSize().width < 1024) {
      await page.locator(".menu-button").click();
      const mobileMenu = page.locator(".mobile-nav");
      await expect(mobileMenu).toBeVisible();
      const menuBackground = parseRgb(await mobileMenu.evaluate((element) => getComputedStyle(element).backgroundColor));
      expect(menuBackground).not.toBeNull();
      if (theme === "dark") {
        expect(relativeLuminance(menuBackground)).toBeLessThan(0.08);
      } else {
        expect(relativeLuminance(menuBackground)).toBeGreaterThan(0.82);
      }
      await page.keyboard.press("Escape");
      await expect(mobileMenu).toBeHidden();
    }

    await page.goto("/missing", { waitUntil: "domcontentloaded" });
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
    if (theme === "dark") {
      const notFoundBackground = await page.locator(".not-found-page").evaluate(
        (element) => getComputedStyle(element).backgroundColor,
      );
      const notFoundRgb = parseRgb(notFoundBackground);
      expect(notFoundRgb, notFoundBackground).not.toBeNull();
      expect(relativeLuminance(notFoundRgb), notFoundBackground).toBeLessThan(0.08);
    }
    for (const selector of [".not-found-page > div > span", ".not-found-page h1", ".not-found-page p", ".not-found-page .button span"]) {
      const result = await readableContrast(page.locator(selector));
      expect(result.ratio, `${selector}: ${JSON.stringify(result)}`).toBeGreaterThanOrEqual(4.5);
    }

    for (const route of [
      "/terms",
      "/privacy",
      "/refund-policy",
      "/subscription-policy",
      "/acceptable-use",
      "/cookies",
      "/security",
      "/contact",
    ]) {
      await page.goto(route, { waitUntil: "domcontentloaded" });
      await expect(page.locator("html"), route).toHaveAttribute("data-theme", theme);
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth),
        `${route} must not overflow horizontally`,
      ).toBeLessThanOrEqual(1);

      const supportingCopy = page.locator([
        ".legal-sidebar > p",
        ".legal-updated",
        ".legal-contents a",
        ".legal-mobile-contents a",
        ".contact-channel-note",
        ".contact-channel-status",
      ].join(","));
      for (const element of await supportingCopy.all()) {
        if (!(await element.isVisible())) continue;
        const result = await readableContrast(element);
        expect(
          result.ratio,
          `${route}: ${JSON.stringify(result)}`,
        ).toBeGreaterThanOrEqual(4.5);
      }
    }

    await page.locator(".theme-toggle").click();
    const oppositeTheme = theme === "dark" ? "light" : "dark";
    await expect(page.locator("html")).toHaveAttribute("data-theme", oppositeTheme);
    await expect.poll(() => page.evaluate(() => localStorage.getItem("musuw-theme"))).toBe(oppositeTheme);
  });
}
