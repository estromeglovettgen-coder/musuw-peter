import { test, expect } from "@playwright/test";
import {
  LITTLE_PRINCE_GRAPH_TOTALS,
  LITTLE_PRINCE_GRAPH_VIEW,
} from "../src/data/littlePrinceGraph.js";

async function checkPageWidth(page) {
  const sizes = await page.evaluate(() => ({ viewport: innerWidth, content: document.documentElement.scrollWidth }));
  expect(sizes.content, JSON.stringify(sizes)).toBeLessThanOrEqual(sizes.viewport + 2);
}
async function capture(locator, name, testInfo) {
  const path = testInfo.outputPath(`${name}.png`);
  const page = locator.page();
  const bounds = await locator.boundingBox();
  expect(bounds).not.toBeNull();
  const viewport = page.viewportSize();
  const x = Math.max(0, bounds.x);
  const y = Math.max(0, bounds.y);
  const width = Math.min(viewport.width, bounds.x + bounds.width) - x;
  const height = Math.min(viewport.height, bounds.y + bounds.height) - y;
  expect(width).toBeGreaterThan(0);
  expect(height).toBeGreaterThan(0);
  // Element screenshots may scroll a spring-driven hero repeatedly while waiting
  // for stability. Capture the actual visible pixels without directing the page.
  await page.screenshot({ path, clip: { x, y, width, height } });
  await testInfo.attach(name, { path, contentType: "image/png" });
}
async function waitWikiPhase(page, phase) {
  await page.waitForFunction(
    (value) => document.querySelector('[data-product-page-shell="wiki"]')?.dataset.demoPhase === value,
    phase,
    { polling: "raf", timeout: 15_000 },
  );
}
async function checkWikiPointerMovement(wiki, phase, start) {
  await expect.poll(async () => {
    const sample = await wiki.evaluate((root, movingPhase) => {
      const rect = root.querySelector(`[data-wiki-auto-pointer="${movingPhase}"]`)?.getBoundingClientRect();
      return { phase: root.dataset.demoPhase, position: rect ? { x: rect.x, y: rect.y } : null };
    }, phase);
    if (sample.phase !== phase) {
      throw new Error(`Wiki left ${phase} for ${sample.phase} before pointer movement was observed`);
    }
    return sample.position ? Math.hypot(sample.position.x - start.x, sample.position.y - start.y) : 0;
  }, { intervals: [50] }).toBeGreaterThan(4);
}
async function checkWikiCameraFixed(wiki) {
  const camera = wiki.locator('[data-wiki-camera="true"]');
  await expect(camera).toHaveAttribute("data-wiki-camera-scale", "1");
  const matrix = await camera.evaluate((node) => {
    const transform = getComputedStyle(node).transform;
    const value = new DOMMatrix(transform);
    return { a: value.a, d: value.d, e: value.e, f: value.f, transform };
  });
  expect(matrix.a, JSON.stringify(matrix)).toBeCloseTo(1, 4);
  expect(matrix.d, JSON.stringify(matrix)).toBeCloseTo(1, 4);
  expect(matrix.e, JSON.stringify(matrix)).toBeCloseTo(0, 4);
  expect(matrix.f, JSON.stringify(matrix)).toBeCloseTo(0, 4);
}
async function waitGraphStage(page, phase, timeout = 30_000) {
  await page.waitForFunction(
    (value) => document.querySelector('[data-product-page-shell="graph"]')?.dataset.demoPhase === value,
    phase,
    { polling: "raf", timeout },
  );
}

async function checkAuthoritativeChatSurface(surface) {
  await expect(surface).toHaveAttribute("data-authoritative-chat-surface", "true");
  await expect(surface.locator('[data-authoritative-chat-composer="true"]')).toHaveCount(1);
  const sidebar = surface.locator('[data-product-app-sidebar="true"]');
  await expect(sidebar).toHaveCount(1);
  await expect(sidebar).toHaveAttribute("data-product-app-sidebar-state", "collapsed");
  await expect(surface.locator(".visual-chat-suggestions, [data-suggested-questions]")).toHaveCount(0);
  const geometry = await surface.evaluate((root) => {
    const workspace = root.querySelector(".musuw-shell-workspace");
    const composer = root.querySelector('[data-authoritative-chat-composer="true"]');
    const readableCopy = root.querySelector(".hero-demo-answer, .visual-assistant-markdown, .authoritative-chat-welcome");
    const workspaceRect = workspace?.getBoundingClientRect();
    const composerRect = composer?.getBoundingClientRect();
    return {
      rootTransform: getComputedStyle(root).transform,
      rootOverflow: root.scrollWidth - root.clientWidth,
      workspaceOverflow: workspace ? workspace.scrollWidth - workspace.clientWidth : Number.POSITIVE_INFINITY,
      composerWidth: composer?.offsetWidth ?? 0,
      workspaceWidth: workspace?.clientWidth ?? 0,
      composerFontSize: Number.parseFloat(getComputedStyle(root.querySelector(".authoritative-chat-composer__textarea")).fontSize),
      copyFontSize: readableCopy ? Number.parseFloat(getComputedStyle(readableCopy).fontSize) : 0,
      sidebarWidth: root.querySelector('[data-product-app-sidebar="true"]')?.offsetWidth ?? 0,
      composerBottomGap: workspaceRect && composerRect ? workspaceRect.bottom - composerRect.bottom : Number.POSITIVE_INFINITY,
    };
  });
  expect(geometry.rootTransform, JSON.stringify(geometry)).toBe("none");
  expect(geometry.rootOverflow, JSON.stringify(geometry)).toBeLessThanOrEqual(2);
  expect(geometry.workspaceOverflow, JSON.stringify(geometry)).toBeLessThanOrEqual(2);
  expect(geometry.composerWidth, JSON.stringify(geometry)).toBeGreaterThan(160);
  expect(geometry.composerWidth, JSON.stringify(geometry)).toBeLessThanOrEqual(geometry.workspaceWidth);
  expect(geometry.composerFontSize, JSON.stringify(geometry)).toBeGreaterThanOrEqual(12);
  expect(geometry.copyFontSize, JSON.stringify(geometry)).toBeGreaterThanOrEqual(12);
  expect(geometry.sidebarWidth, JSON.stringify(geometry)).toBeCloseTo(56, 0);
  expect(geometry.composerBottomGap, JSON.stringify(geometry)).toBeGreaterThanOrEqual(0);
  expect(geometry.composerBottomGap, JSON.stringify(geometry)).toBeLessThanOrEqual(34);
}

async function graphPointerOffset(focusCanvas, stage) {
  return focusCanvas.evaluate((node, pointerStage) => {
    const pointer = node.querySelector(`[data-graph-auto-pointer="${pointerStage}"]`);
    const pointerBox = pointer?.getBoundingClientRect();
    const canvasBox = node.getBoundingClientRect();
    const focusX = Number(node.dataset.graphFocusX);
    const focusY = Number(node.dataset.graphFocusY);
    if (!pointerBox || !Number.isFinite(focusX) || !Number.isFinite(focusY)) return Number.POSITIVE_INFINITY;
    const pointerHotspotX = pointerBox.left - canvasBox.left + 3;
    const pointerHotspotY = pointerBox.top - canvasBox.top + 3;
    return Math.hypot(pointerHotspotX - focusX, pointerHotspotY - focusY);
  }, stage);
}

// Observe the one-shot walkthrough before networkidle or page assertions can
// miss it. Keep five records; each press measures its own target in one frame.
async function observeHeroWalkthrough(page) {
  await page.addInitScript(() => {
    const records = window.__musuwHeroFrames = [];
    const seen = new Set();
    const record = (stage, detail) => {
      if (!seen.has(stage)) { seen.add(stage); records.push({ stage, ...detail }); }
    };
    const visible = (node) => Boolean(node && node.getBoundingClientRect().width > 0
      && node.getBoundingClientRect().height > 0 && getComputedStyle(node).visibility !== "hidden");
    const sample = () => {
      const hero = document.querySelector('[data-story="research-ledger"]');
      if (hero) {
        const phase = hero.dataset.demoPhase;
        const step = hero.dataset.heroSaveStep;
        const welcome = hero.querySelector(".visual-new-chat-title");
        const pointer = hero.querySelector('[data-hero-auto-pointer="saving"]');
        if (welcome) record("welcome", { phase, text: welcome.textContent });
        if (phase === "answering") record("answering", { pointerCount: hero.querySelectorAll('[data-hero-auto-pointer]').length });
        if (phase === "saving" && ["bookmark", "publish"].includes(step) && pointer?.classList.contains("is-clicking")) {
          const button = hero.querySelector(step === "bookmark" ? '[data-hero-save-action="true"]' : '[data-hero-save-publish="true"]');
          const p = pointer.getBoundingClientRect();
          const b = button?.getBoundingClientRect();
          const drawer = hero.querySelector('[data-hero-save-drawer="true"]');
          const pointerStyle = getComputedStyle(pointer);
          record(step, {
            pointerVisible: visible(pointer), buttonVisible: visible(button),
            opacity: Number(pointerStyle.opacity),
            position: { left: pointerStyle.left, top: pointerStyle.top, target: pointer.dataset.heroPointerTarget },
            drawerTransform: drawer ? getComputedStyle(drawer).transform : null,
            distance: b ? Math.hypot(p.x + 3 - (b.x + b.width / 2), p.y + 3 - (b.y + b.height / 2)) : null,
            drawerVisible: visible(drawer),
            successCount: hero.querySelectorAll('[data-hero-save-success="true"]').length,
          });
        }
        if (phase === "complete") { record("complete", { step }); observer.disconnect(); }
      }
    };
    // A software-rendered CI frame can take longer than the 720 ms press.
    // Observe committed DOM states as well as frames so that a real, measured
    // click cannot disappear between two samples. Keep every geometry check.
    const observer = new MutationObserver(sample);
    observer.observe(document, {
      subtree: true, childList: true, attributes: true,
      attributeFilter: ["class", "data-demo-phase", "data-hero-save-step"],
    });
    const sampleFrame = () => {
      sample();
      if (!seen.has("complete")) requestAnimationFrame(sampleFrame);
    };
    requestAnimationFrame(sampleFrame);
  });
}

for (const locale of ["zh-CN", "en"]) {
  for (const reducedMotion of ["no-preference", "reduce"]) {
    test(`${locale} / ${reducedMotion}: four independent stories`, async ({ page }, testInfo) => {
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.emulateMedia({ reducedMotion });
      await page.addInitScript((value) => {
        window.__MUSUW_LOCALE__ = value;
        localStorage.setItem("musuw_locale", value);
      }, locale);
      if (reducedMotion === "no-preference") await observeHeroWalkthrough(page);
      await page.goto(locale === "en" ? "/en" : "/", { waitUntil: "networkidle" });
      await expect(page.locator("html")).toHaveAttribute("lang", locale);
      await expect(page.locator("header.site-header")).toHaveCount(1);
      await expect(page.locator(".desktop-nav")).toHaveCount(1);
      await expect(page.locator("h1[aria-label]")).toHaveAttribute("aria-label", locale === "zh-CN" ? "建立你的AI知识库 让知识持续积累" : "Build your AI knowledge base Let knowledge keep growing");
      await expect(page.locator(".feature-story")).toHaveCount(3);
      await checkPageWidth(page);

      const hero = page.locator('[data-story="research-ledger"]');
      await hero.scrollIntoViewIfNeeded();
      await expect(hero).toHaveAttribute("data-demo-phase", "complete", { timeout: 45_000 });
      if (reducedMotion === "no-preference") {
        await expect.poll(() => page.evaluate(() => window.__musuwHeroFrames.map(({ stage }) => stage)))
          .toEqual(["welcome", "answering", "bookmark", "publish", "complete"]);
        const [welcome, answering, bookmark, publish, complete] = await page.evaluate(() => window.__musuwHeroFrames);
        expect(welcome.text).toBe(locale === "zh-CN" ? "Hi，我是 Musuw" : "Hi, I’m Musuw");
        expect(["idle", "typing-question"]).toContain(welcome.phase);
        expect(answering.pointerCount).toBe(0);
        for (const press of [bookmark, publish]) {
          expect(press.pointerVisible, JSON.stringify(press)).toBe(true);
          expect(press.buttonVisible, JSON.stringify(press)).toBe(true);
          expect(press.opacity, JSON.stringify(press)).toBeGreaterThan(0.5);
          expect(press.distance, JSON.stringify(press)).not.toBeNull();
          expect(press.distance, JSON.stringify(press)).toBeLessThan(34);
          expect(press.successCount, JSON.stringify(press)).toBe(0);
        }
        expect(bookmark.drawerVisible).toBe(false);
        expect(publish.drawerVisible).toBe(true);
        expect(complete.step).toBe("published");
      }
      await expect(hero).toHaveAttribute("data-hero-save-step", "published");
      await expect(hero.locator(".hero-demo-question")).toContainText(locale === "zh-CN" ? "问题台账" : "question ledger");
      await expect(hero.locator(".hero-inline-citation")).toHaveCount(3);
      await expect(hero.locator('[data-answer-section="conclusion"]')).toContainText(locale === "zh-CN" ? "核心作用" : "Core role");
      await expect(hero.locator('[data-answer-section="evidence"] [data-demo-source-ref]')).toHaveCount(3);
      await expect(hero.locator('[data-answer-section="impact"]')).toContainText(locale === "zh-CN" ? "对长期实验的影响" : "Impact on the long-running experiment");
      await expect(hero.locator(".hero-demo-answer-table")).toBeVisible();
      await expect(hero.locator('[data-hero-save-action="true"]')).toHaveCount(1);
      await expect(hero.locator('.hero-demo-answer-actions .visual-assistant-toolbar__button')).toHaveCount(3);
      await expect(hero.locator('[data-hero-save-success="true"]')).toBeVisible();
      await expect(hero.locator('[data-hero-save-drawer="true"]')).toHaveCount(0);
      await expect(hero).toHaveAttribute("data-demo-interactive", "false");
      await expect(hero.locator(".demo-scope-note")).toHaveCount(0);
      await expect(hero.locator("[data-demo-source]")).toHaveCount(0);
      const heroGeometry = await hero.locator(".hero-demo-thread").evaluate((node) => ({ height: node.clientHeight, scroll: node.scrollHeight, overflow: getComputedStyle(node).overflowY }));
      expect(heroGeometry.overflow !== "hidden" || heroGeometry.scroll <= heroGeometry.height + 2, JSON.stringify(heroGeometry)).toBeTruthy();
      await checkAuthoritativeChatSurface(hero);
      await capture(hero, "hero-answer", testInfo);

      const chat = page.locator('[data-capability-demo="reasoning"]');
      await chat.scrollIntoViewIfNeeded();
      if (reducedMotion === "no-preference") {
        await expect(chat.locator(".authoritative-chat-welcome")).toHaveText(locale === "zh-CN" ? "Hi，我是 Musuw" : "Hi, I’m Musuw");
        await expect(chat).toHaveAttribute("data-chat-phase", "validating", { timeout: 20_000 });
        await expect(chat.locator(".visual-rag-step")).toHaveCount(5);
        await expect(chat.locator(".visual-rag-timeline")).toContainText(locale === "zh-CN" ? "混合召回（BM25 + 向量）" : "Hybrid retrieval (BM25 + vector)");
        await expect(chat.locator(".visual-rag-timeline")).toContainText("Rerank");
        await capture(chat, "reasoning-retrieval", testInfo);
      }
      await expect(chat).toHaveAttribute("data-chat-phase", "complete", { timeout: 45_000 });
      await expect(chat.locator(".visual-assistant-markdown")).toBeVisible();
      await expect(chat.locator(".visual-assistant-markdown")).toContainText(locale === "zh-CN" ? "首次练习" : "completed first exercise");
      await expect(chat.locator("[data-answer-section]")).toHaveCount(5);
      await expect(chat.locator('[data-answer-section="conclusion"]')).toContainText(locale === "zh-CN" ? "优先判断" : "Priority conclusion");
      await expect(chat.locator('[data-answer-section="evidence"] [data-answer-source-ref]')).toHaveCount(3);
      await expect(chat.locator('[data-answer-section="validation"]')).toContainText(locale === "zh-CN" ? "验证方案" : "Validation plan");
      await expect(chat.locator('[data-answer-section="limits"]')).toContainText(locale === "zh-CN" ? "判断边界" : "Decision limits");
      await expect(chat.locator(".demo-scope-note")).toHaveCount(0);
      await expect(chat.locator('[data-rag-pipeline-summary="complete"]')).toBeVisible();
      await expect(chat.locator('[data-rag-pipeline-summary="complete"]')).toContainText("Rerank");
      await expect(chat).not.toContainText(/18 个结果|18 results|模拟研究资料|Simulated research/);
      await expect(chat).toHaveAttribute("data-demo-interactive", "false");
      await expect(chat.locator("[data-demo-source]")).toHaveCount(0);
      const answerFit = await chat.evaluate((root) => {
        const viewport = root.querySelector(".authoritative-chat-scroll")?.getBoundingClientRect();
        const answer = root.querySelector(".real-chat-answer")?.getBoundingClientRect();
        const citations = root.querySelector(".real-chat-citations")?.getBoundingClientRect();
        const toolbar = root.querySelector(".visual-assistant-toolbar")?.getBoundingClientRect();
        if (!viewport || !answer || !citations || !toolbar) return null;
        return {
          topOverflow: viewport.top - answer.top,
          bottomOverflow: Math.max(answer.bottom, citations.bottom, toolbar.bottom) - viewport.bottom,
          scrollTop: root.querySelector(".authoritative-chat-scroll")?.scrollTop ?? 0,
        };
      });
      expect(answerFit, JSON.stringify(answerFit)).not.toBeNull();
      expect(answerFit.scrollTop > 0 || answerFit.topOverflow <= 2, JSON.stringify(answerFit)).toBeTruthy();
      expect(answerFit.bottomOverflow, JSON.stringify(answerFit)).toBeLessThanOrEqual(2);
      await checkAuthoritativeChatSurface(chat);
      await capture(chat, "reasoning-answer", testInfo);

      const wiki = page.locator('[data-product-page-shell="wiki"]');
      await wiki.scrollIntoViewIfNeeded();
      await expect(wiki.locator('[data-real-product-view="wiki"]')).toBeVisible();
      await expect(wiki.locator('[data-wiki-surface="true"]')).toBeVisible();
      await expect(wiki.locator('[data-wiki-sidebar="true"]')).toHaveCount(1);
      if (testInfo.project.name === "mobile") await expect(wiki.locator('[data-wiki-sidebar="true"]')).toBeHidden();
      else await expect(wiki.locator('[data-wiki-sidebar="true"]')).toBeVisible();
      await expect(wiki.locator('[data-wiki-reader="true"]')).toBeVisible();
      await expect(wiki.locator('img[src="/images/musuw-wiki-page.jpg"]')).toHaveCount(0);
      if (reducedMotion === "no-preference") {
        await expect(wiki.locator('[data-wiki-page-id="index"]')).toBeVisible();
        await expect(wiki.locator('.wiki-reader-title-text, .kb-preview-index-header h4').first()).toHaveText(locale === "zh-CN" ? "索引" : "Index");
        await expect(wiki.locator('[data-wiki-demo-link="index"]')).toBeVisible();
      }
      await expect(wiki).toHaveAttribute("data-demo-interactive", "false");
      const wikiAppSidebar = wiki.locator('[data-product-app-sidebar="true"]');
      await expect(wikiAppSidebar).toHaveCount(1);
      await expect(wikiAppSidebar).toBeVisible();
      await expect(wikiAppSidebar).toHaveAttribute("data-product-app-sidebar-state", "collapsed");
      await expect.poll(async () => wikiAppSidebar.evaluate((node) => node.offsetWidth)).toBe(56);
      await expect(wiki.locator("[data-demo-source], [data-demo-pointer]")).toHaveCount(0);
      await checkWikiCameraFixed(wiki);
      if (reducedMotion === "reduce") {
        await waitWikiPhase(page, "page");
        await expect(wiki.locator('[data-wiki-auto-pointer]')).toHaveCount(0);
        await expect(wiki.locator('[data-wiki-page-id="index"]')).toBeVisible();
        await expect(wiki.locator(".kb-preview-index-header h4")).toHaveText(locale === "zh-CN" ? "索引" : "Index");
        await checkWikiCameraFixed(wiki);
        await capture(wiki, "wiki-linked-page-reduced", testInfo);
      } else {
        await waitWikiPhase(page, "moving-to-index-link");
        const pointer = wiki.locator('[data-wiki-auto-pointer="moving-to-index-link"]');
        const sourceLink = wiki.locator('[data-wiki-demo-link="index"]:visible');
        await expect(pointer).toBeVisible();
        await expect(sourceLink).toHaveAttribute("data-wiki-link-state", "approaching");
        const pointerStart = await pointer.boundingBox();
        expect(pointerStart).not.toBeNull();
        await checkWikiPointerMovement(wiki, "moving-to-index-link", pointerStart);
        await checkWikiCameraFixed(wiki);

        await waitWikiPhase(page, "pressing-index-link");
        const pressingPointer = wiki.locator('[data-wiki-auto-pointer="pressing-index-link"]');
        await expect(pressingPointer).toBeVisible();
        await expect(sourceLink).toHaveAttribute("data-wiki-link-state", "pressing");
        const hit = await wiki.evaluate((root) => {
          const cursor = root.querySelector('[data-wiki-auto-pointer="pressing-index-link"]');
          const link = root.querySelector('[data-wiki-demo-link="index"]');
          const host = root.querySelector(".kb-preview-wiki-host");
          const cursorRect = cursor?.getBoundingClientRect();
          const linkRect = link?.getBoundingClientRect();
          const hostRect = host?.getBoundingClientRect();
          if (!cursorRect || !linkRect || !hostRect) return null;
          const hotspot = { x: cursorRect.left + 3, y: cursorRect.top + 3 };
          return {
            hotspotInsideLink: hotspot.x >= linkRect.left - 2 && hotspot.x <= linkRect.right + 2 && hotspot.y >= linkRect.top - 2 && hotspot.y <= linkRect.bottom + 2,
            pointerLinkDistance: Math.hypot((cursorRect.left + cursorRect.width / 2) - (linkRect.left + linkRect.width / 2), (cursorRect.top + cursorRect.height / 2) - (linkRect.top + linkRect.height / 2)),
            pointerInsideHost: cursorRect.left >= hostRect.left && cursorRect.right <= hostRect.right && cursorRect.top >= hostRect.top && cursorRect.bottom <= hostRect.bottom,
          };
        });
        expect(hit, JSON.stringify(hit)).not.toBeNull();
        expect(hit.hotspotInsideLink, JSON.stringify(hit)).toBe(true);
        expect(hit.pointerLinkDistance, JSON.stringify(hit)).toBeLessThanOrEqual(24);
        expect(hit.pointerInsideHost, JSON.stringify(hit)).toBe(true);
        // Capture the terminal page below: encoding a screenshot here can
        // outlast the next 940 ms scene and make its assertions miss it.

        await waitWikiPhase(page, "section-page");
        await expect(wiki.locator('[data-wiki-page-id="evaluation-tasks"]')).toBeVisible();
        await expect(wiki.locator(".wiki-reader-title-text")).toHaveText(locale === "zh-CN" ? "评估任务" : "Evaluation tasks");
        await expect(wiki.locator('[data-wiki-auto-pointer="section-page"]')).toBeVisible();

        await waitWikiPhase(page, "moving-to-inline-link");
        const inlinePointer = wiki.locator('[data-wiki-auto-pointer="moving-to-inline-link"]');
        const inlineLink = wiki.locator('[data-wiki-demo-link="inline"]');
        await expect(inlinePointer).toBeVisible();
        await expect(inlineLink).toHaveAttribute("data-wiki-link-state", "approaching");
        const inlineStart = await inlinePointer.boundingBox();
        expect(inlineStart).not.toBeNull();
        await checkWikiPointerMovement(wiki, "moving-to-inline-link", inlineStart);

        await waitWikiPhase(page, "pressing-inline-link");
        const inlinePressingPointer = wiki.locator('[data-wiki-auto-pointer="pressing-inline-link"]');
        await expect(inlinePressingPointer).toBeVisible();
        await expect(inlineLink).toHaveAttribute("data-wiki-link-state", "pressing");
        const inlineHit = await wiki.evaluate((root) => {
          const cursor = root.querySelector('[data-wiki-auto-pointer="pressing-inline-link"]');
          const link = root.querySelector('[data-wiki-demo-link="inline"]');
          const host = root.querySelector(".kb-preview-wiki-host");
          const cursorRect = cursor?.getBoundingClientRect();
          const linkRect = link?.getBoundingClientRect();
          const hostRect = host?.getBoundingClientRect();
          if (!cursorRect || !linkRect || !hostRect) return null;
          const hotspot = { x: cursorRect.left + 3, y: cursorRect.top + 3 };
          return {
            hotspotInsideLink: hotspot.x >= linkRect.left - 2 && hotspot.x <= linkRect.right + 2 && hotspot.y >= linkRect.top - 2 && hotspot.y <= linkRect.bottom + 2,
            pointerLinkDistance: Math.hypot((cursorRect.left + cursorRect.width / 2) - (linkRect.left + linkRect.width / 2), (cursorRect.top + cursorRect.height / 2) - (linkRect.top + linkRect.height / 2)),
            pointerInsideHost: cursorRect.left >= hostRect.left && cursorRect.right <= hostRect.right && cursorRect.top >= hostRect.top && cursorRect.bottom <= hostRect.bottom,
          };
        });
        expect(inlineHit, JSON.stringify(inlineHit)).not.toBeNull();
        expect(inlineHit.hotspotInsideLink, JSON.stringify(inlineHit)).toBe(true);
        expect(inlineHit.pointerLinkDistance, JSON.stringify(inlineHit)).toBeLessThanOrEqual(24);
        expect(inlineHit.pointerInsideHost, JSON.stringify(inlineHit)).toBe(true);
        await capture(wiki, "wiki-inline-link-press", testInfo);

        await waitWikiPhase(page, "linked-page");
        await expect(wiki.locator('[data-wiki-auto-pointer]')).toHaveCount(0);
        await expect(wiki.locator('[data-wiki-page-id="longmemeval"]')).toBeVisible();
        await expect(wiki.locator(".wiki-reader-title-text")).toHaveText("LongMemEval");
        await expect(wiki.locator(".kb-preview-wiki-tree .is-selected")).toContainText("LongMemEval");
        await checkWikiCameraFixed(wiki);
        await capture(wiki, "wiki-linked-page", testInfo);
        await page.waitForTimeout(2800);
        await expect(wiki).toHaveAttribute("data-demo-phase", "linked-page");
        await expect(wiki.locator('[data-wiki-page-id="longmemeval"]')).toBeVisible();
        await checkWikiCameraFixed(wiki);
      }

      const graph = page.locator('[data-product-page-shell="graph"]');
      await graph.scrollIntoViewIfNeeded();
      await expect(graph).toContainText(locale === "zh-CN" ? "《小王子》阅读笔记" : "The Little Prince");
      await expect(graph.locator("canvas")).toBeVisible();
      await expect(graph.locator("[data-playback-total]")).toHaveAttribute("data-playback-total", String(LITTLE_PRINCE_GRAPH_TOTALS.nodes));
      if (reducedMotion === "reduce") {
        await expect(graph.locator("[data-playback-total]")).toHaveAttribute("data-playback-visible", String(LITTLE_PRINCE_GRAPH_TOTALS.nodes));
        await expect(graph.locator("[data-playback-total]")).toHaveAttribute("data-playback-state", "idle");
      } else {
        await expect(graph.locator("[data-playback-total]")).toHaveAttribute("data-playback-state", "playing");
        await waitGraphStage(page, "seed");
        const growingVisible = Number(await graph.locator("[data-playback-total]").getAttribute("data-playback-visible"));
        expect(growingVisible).toBeGreaterThan(0);
        expect(growingVisible).toBeLessThan(LITTLE_PRINCE_GRAPH_TOTALS.nodes);
        expect(Number(await graph.locator("[data-graph-camera-scale]").getAttribute("data-graph-camera-scale"))).toBeCloseTo(0.55, 2);

        const verifiesFullStory = locale === "zh-CN";
        if (verifiesFullStory) {
          const progressionStartedAt = Date.now();
          await page.waitForFunction(
            () => Number(document.querySelector('[data-product-page-shell="graph"] [data-playback-visible]')?.dataset.playbackVisible) > 28,
            undefined,
            { polling: "raf", timeout: 12_000 },
          );
          await waitGraphStage(page, "grow");
          await page.evaluate(() => {
            const graphRoot = document.querySelector('[data-product-page-shell="graph"]');
            const camera = graphRoot?.querySelector("[data-graph-camera-scale]");
            window.__graphGrowthScaleSamples = [];
            const record = () => {
              if (graphRoot?.dataset.demoPhase !== "grow" || !camera) return;
              window.__graphGrowthScaleSamples.push(Number(camera.dataset.graphCameraScale));
            };
            window.__graphGrowthScaleObserver = new MutationObserver(record);
            if (camera) window.__graphGrowthScaleObserver.observe(camera, { attributes: true, attributeFilter: ["data-graph-camera-scale"] });
            record();
          });
          await expect.poll(
            async () => Number(await graph.locator("[data-graph-camera-scale]").getAttribute("data-graph-camera-scale")),
            { timeout: 12_000 },
          ).toBeLessThan(0.55);
          await expect(graph.locator("[data-playback-total]")).toHaveAttribute("data-playback-state", "complete", { timeout: 32_000 });
          const growthScaleSamples = await page.evaluate(() => {
            window.__graphGrowthScaleObserver?.disconnect();
            return window.__graphGrowthScaleSamples;
          });
          expect(growthScaleSamples.length).toBeGreaterThan(3);
          for (let index = 1; index < growthScaleSamples.length; index += 1) {
            expect(growthScaleSamples[index]).toBeLessThanOrEqual(growthScaleSamples[index - 1]);
          }
          expect(growthScaleSamples.at(-1)).toBeLessThan(growthScaleSamples[0]);
          const progressionElapsed = Date.now() - progressionStartedAt;
          expect(progressionElapsed).toBeGreaterThan(10_000);
          expect(progressionElapsed).toBeLessThan(22_000);
          await page.evaluate(() => {
            const graphRoot = document.querySelector('[data-product-page-shell="graph"]');
            window.__graphDrawerFirstFrame = null;
            const captureDrawerFrame = () => {
              if (window.__graphDrawerFirstFrame || graphRoot?.dataset.demoPhase !== "drawer") return;
              const focusCanvas = graphRoot.querySelector('[data-graph-focus-node="character:prince"]');
              window.__graphDrawerFirstFrame = {
                visible: focusCanvas?.dataset.graphFocusVisible ?? null,
                total: focusCanvas?.dataset.graphFocusTotal ?? null,
                allVisible: focusCanvas?.dataset.graphFocusAllVisible ?? null,
                rightInset: focusCanvas?.dataset.graphFocusRightInset ?? null,
                bottomInset: focusCanvas?.dataset.graphFocusBottomInset ?? null,
                pointerStage: graphRoot.querySelector("[data-graph-auto-pointer]")?.dataset.graphAutoPointer ?? null,
              };
              window.__graphDrawerFirstFrameObserver?.disconnect();
            };
            window.__graphDrawerFirstFrameObserver = new MutationObserver(captureDrawerFrame);
            window.__graphDrawerFirstFrameObserver.observe(graphRoot, { attributes: true, attributeFilter: ["data-demo-phase"] });
            captureDrawerFrame();
          });
          await waitGraphStage(page, "hover", 5_000);
          await expect(graph.locator('[data-graph-auto-pointer="hover"]')).toBeVisible();
          await expect(graph.locator('[data-directed-focus="hover"]')).toHaveAttribute("data-directed-node", "character:prince");
          const hoverFocusCanvas = graph.locator('[data-graph-focus-node="character:prince"]');
          expect(await graphPointerOffset(hoverFocusCanvas, "hover")).toBeLessThan(6);
          // Keep screenshot encoding out of short, one-shot graph phases.
          // Geometry is checked here; capture the stable linked page below.
          await waitGraphStage(page, "drawer", 5_000);
          await expect(graph.locator('[data-graph-node-drawer="open"]')).toBeVisible();
          await expect(graph.locator('[data-graph-node-drawer="open"]')).toHaveAttribute("data-graph-drawer-node-id", "character:prince");
          await expect(graph.locator('[data-directed-focus="selected"]')).toHaveAttribute("data-directed-node", "character:prince");
          const drawerFirstFrame = await page.evaluate(() => window.__graphDrawerFirstFrame);
          expect(drawerFirstFrame, JSON.stringify(drawerFirstFrame)).not.toBeNull();
          const graphShellBox = await graph.locator(".kb-product-preview").boundingBox();
          expect(graphShellBox, JSON.stringify(drawerFirstFrame)).not.toBeNull();
          const minimumRightInset = graphShellBox.width <= 760 ? 176 : 255;
          expect(Number(drawerFirstFrame.rightInset), JSON.stringify({ ...drawerFirstFrame, minimumRightInset })).toBeGreaterThanOrEqual(minimumRightInset);
          expect(Number(drawerFirstFrame.bottomInset), JSON.stringify(drawerFirstFrame)).toBe(0);
          expect(drawerFirstFrame.pointerStage, JSON.stringify(drawerFirstFrame)).toBe("drawer");
          const focusCanvas = graph.locator('[data-graph-focus-node="character:prince"]');
          await expect.poll(async () => Number(await focusCanvas.getAttribute("data-graph-focus-right-inset"))).toBeGreaterThanOrEqual(minimumRightInset);
          await expect.poll(async () => Number(await focusCanvas.getAttribute("data-graph-focus-bottom-inset"))).toBe(0);
          await expect(focusCanvas).toHaveAttribute("data-graph-focus-all-visible", "true");
          await expect.poll(
            async () => Number(await focusCanvas.getAttribute("data-graph-focus-coverage")),
            { timeout: 2_500 },
          ).toBeGreaterThanOrEqual(0.45);
          // The production graph detail surface is a full-height right
          // drawer at every breakpoint. Assert its actual geometry rather
          // than relying only on the renderer inset, so a mobile CSS change
          // cannot silently regress to a bottom sheet or overlay the fit
          // neighborhood.
          await expect.poll(
            async () => graph.evaluate((root) => {
              const shell = root.querySelector(".kb-product-preview")?.getBoundingClientRect();
              const layer = root.querySelector(".graph-node-drawer-layer")?.getBoundingClientRect();
              const panel = root.querySelector(".graph-node-drawer")?.getBoundingClientRect();
              if (!shell || !layer || !panel) return false;
              const epsilon = 1.5;
              return Math.abs(layer.right - shell.right) <= epsilon
                && Math.abs(panel.right - shell.right) <= epsilon
                && Math.abs(layer.top - shell.top) <= epsilon
                && Math.abs(panel.top - shell.top) <= epsilon
                && Math.abs(layer.bottom - shell.bottom) <= epsilon
                && Math.abs(panel.bottom - shell.bottom) <= epsilon
                && layer.left > shell.left
                && panel.left > shell.left;
            }),
            { timeout: 2_500 },
          ).toBe(true);
          const pointerOffset = await graphPointerOffset(focusCanvas, "drawer");
          expect(pointerOffset).toBeLessThan(6);
          await waitGraphStage(page, "drawer-link-moving", 3_000);
          const drawerLink = graph.locator('[data-graph-drawer-link-slug="summary:chapter:21"]');
          await expect(drawerLink).toHaveAttribute("data-graph-drawer-link-state", "drawer-link-moving");
          await expect(graph.locator('[data-graph-auto-pointer="drawer-link-moving"]')).toBeVisible();
          await expect(focusCanvas).toHaveAttribute("data-graph-focus-visible", "27");
          await expect(focusCanvas).toHaveAttribute("data-graph-focus-total", "27");
          await expect(focusCanvas).toHaveAttribute("data-graph-focus-all-visible", "true");

          await waitGraphStage(page, "drawer-link-press", 3_000);
          await expect(drawerLink).toHaveAttribute("data-graph-drawer-link-state", "drawer-link-press");
          await expect(graph.locator('[data-graph-auto-pointer="drawer-link-press"]')).toBeVisible();

          await waitGraphStage(page, "linked-page", 3_000);
          await expect(graph.locator('[data-graph-node-drawer="open"]')).toHaveAttribute("data-graph-drawer-node-id", "summary:chapter:21");
          await expect(graph.locator(".graph-node-drawer-title")).toHaveText(locale === "zh-CN" ? "第21章总结：狐狸讲述关系如何形成" : "Chapter 21 summary: The fox teaches how bonds are made");
          await expect(graph.locator('[data-directed-focus="selected"]')).toHaveAttribute("data-directed-node", "summary:chapter:21");
          await expect(graph.locator(".graph-node-drawer-wiki-body table")).toHaveCount(1);
          await expect(graph.locator(".graph-node-drawer-wiki-body .wiki-content-link")).toHaveCount(6);
          await expect(graph.locator(".graph-node-drawer")).not.toContainText(/节点概览|阅读脉络|关系线索|一跳关联|相关节点/);
          const linkedFocusCanvas = graph.locator('[data-graph-focus-node="summary:chapter:21"]');
          await expect(linkedFocusCanvas).toHaveAttribute("data-graph-focus-visible", "9");
          await expect(linkedFocusCanvas).toHaveAttribute("data-graph-focus-total", "9");
          await expect(linkedFocusCanvas).toHaveAttribute("data-graph-focus-all-visible", "true");
          await expect(graph.locator('[data-graph-auto-pointer]')).toHaveCount(0);
          await page.waitForTimeout(500);
          const frozenFrame = await linkedFocusCanvas.evaluate((node) => ({
            bounds: node.dataset.graphFocusBounds,
            cameraScale: Number(node.dataset.graphCameraScale),
            focusX: Number(node.dataset.graphFocusX),
            focusY: Number(node.dataset.graphFocusY),
          }));
          await page.waitForTimeout(900);
          await expect(graph).toHaveAttribute("data-demo-phase", "linked-page");
          const laterFrozenFrame = await linkedFocusCanvas.evaluate((node) => ({
            bounds: node.dataset.graphFocusBounds,
            cameraScale: Number(node.dataset.graphCameraScale),
            focusX: Number(node.dataset.graphFocusX),
            focusY: Number(node.dataset.graphFocusY),
          }));
          expect(laterFrozenFrame.bounds).toBe(frozenFrame.bounds);
          expect(laterFrozenFrame.cameraScale).toBeCloseTo(frozenFrame.cameraScale, 3);
          expect(laterFrozenFrame.focusX).toBeCloseTo(frozenFrame.focusX, 1);
          expect(laterFrozenFrame.focusY).toBeCloseTo(frozenFrame.focusY, 1);
          await capture(graph, "graph-linked-page", testInfo);
        }
      }
      await expect(graph.locator("[data-graph-node-count]")).toHaveAttribute("data-graph-node-count", String(LITTLE_PRINCE_GRAPH_TOTALS.nodes));
      await expect(graph.locator('[data-graph-legend-type]')).toHaveCount(7);
      const graphSidebar = graph.locator('[data-product-app-sidebar-state="collapsed"]');
      await expect(graphSidebar).toHaveCount(1);
      await expect(graphSidebar).toBeVisible();
      await expect(graph.locator('[data-graph-action], [data-graph-settings="true"]')).toHaveCount(0);
      const cameraScale = Number(await graph.locator("[data-graph-camera-scale]").getAttribute("data-graph-camera-scale"));
      const surfaceScale = await graph.locator(".kb-product-preview").evaluate((node) => new DOMMatrix(getComputedStyle(node).transform).a);
      expect(surfaceScale).toBeCloseTo(1, 2);
      const graphPhase = await graph.getAttribute("data-demo-phase");
      if (["drawer", "drawer-link-moving", "drawer-link-press", "linked-page"].includes(graphPhase)) {
        const focusCanvas = graph.locator(".kb-preview-graph-canvas");
        expect(cameraScale).toBeGreaterThan(0.02);
        expect(Number(await focusCanvas.getAttribute("data-graph-focus-coverage"))).toBeGreaterThanOrEqual(0.45);
        await expect(focusCanvas).toHaveAttribute("data-graph-focus-all-visible", "true");
        expect(cameraScale).toBeLessThanOrEqual(LITTLE_PRINCE_GRAPH_VIEW.focusScale);
      } else {
        expect(cameraScale).toBeGreaterThanOrEqual(0.1);
        expect(cameraScale * surfaceScale).toBeLessThanOrEqual(LITTLE_PRINCE_GRAPH_VIEW.initialScale);
      }
      const graphPointerEvents = await graph.locator(".kb-preview-graph-canvas").evaluate((node) => getComputedStyle(node).pointerEvents);
      expect(graphPointerEvents).toBe("none");
      const graphFrame = await graph.evaluate((node) => {
        const styles = getComputedStyle(node);
        return { borderWidth: styles.borderTopWidth, borderRadius: styles.borderTopLeftRadius, boxShadow: styles.boxShadow };
      });
      expect(graphFrame).toEqual({ borderWidth: "0px", borderRadius: "0px", boxShadow: "none" });
      const [graphShell, graphSidebarBox, graphMain, graphSurface, graphCanvas] = await Promise.all([
        graph.locator(".kb-product-preview").boundingBox(),
        graphSidebar.boundingBox(),
        graph.locator(".kb-preview-knowledge-page").boundingBox(),
        graph.locator(".kb-preview-graph").boundingBox(),
        graph.locator("canvas").boundingBox(),
      ]);
      const logicalSidebarWidth = graphSidebarBox.width / surfaceScale;
      expect(logicalSidebarWidth).toBeCloseTo(56, 0);
      expect(graphMain.x - graphShell.x).toBeCloseTo(graphSidebarBox.width, 0);
      expect(graphMain.width + graphSidebarBox.width).toBeCloseTo(graphShell.width, 0);
      expect(graphCanvas.width / graphSurface.width).toBeGreaterThan(0.98);
      expect(graphCanvas.width / graphSurface.width).toBeLessThanOrEqual(1.01);
      expect(graphCanvas.height / graphSurface.height).toBeGreaterThan(0.98);
      expect(graphCanvas.height / graphSurface.height).toBeLessThanOrEqual(1.01);
      expect(graphCanvas.width).toBeGreaterThan(200);
      expect(graphCanvas.height).toBeGreaterThan(150);
      await capture(graph, "graph", testInfo);
      await checkPageWidth(page);
      expect(errors).toEqual([]);
    });
  }
}

test("hero shell stays complete across desktop breakpoint and phone widths", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.addInitScript(() => {
    window.__MUSUW_LOCALE__ = "zh-CN";
    localStorage.setItem("musuw_locale", "zh-CN");
  });

  for (const viewport of [
    { width: 1024, height: 900 },
    { width: 768, height: 900 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto("/", { waitUntil: "networkidle" });
    const hero = page.locator('[data-story="research-ledger"]');
    await hero.scrollIntoViewIfNeeded();
    await checkAuthoritativeChatSurface(hero);
    const geometry = await hero.evaluate((root) => {
      const rootRect = root.getBoundingClientRect();
      const railRect = root.querySelector('[data-product-app-sidebar="true"]')?.getBoundingClientRect();
      const avatarRect = root.querySelector(".musuw-shell-avatar")?.getBoundingClientRect();
      return {
        root: { left: rootRect.left, right: rootRect.right, top: rootRect.top, bottom: rootRect.bottom },
        rail: railRect ? { left: railRect.left, right: railRect.right, top: railRect.top, bottom: railRect.bottom } : null,
        avatar: avatarRect ? { top: avatarRect.top, bottom: avatarRect.bottom } : null,
      };
    });
    expect(geometry.root.left, JSON.stringify({ viewport, geometry })).toBeGreaterThanOrEqual(-1);
    expect(geometry.root.right, JSON.stringify({ viewport, geometry })).toBeLessThanOrEqual(viewport.width + 1);
    expect(geometry.rail.left, JSON.stringify({ viewport, geometry })).toBeGreaterThanOrEqual(geometry.root.left - 1);
    expect(geometry.rail.right, JSON.stringify({ viewport, geometry })).toBeLessThanOrEqual(geometry.root.right + 1);
    expect(geometry.avatar.top, JSON.stringify({ viewport, geometry })).toBeGreaterThanOrEqual(geometry.root.top - 1);
    expect(geometry.avatar.bottom, JSON.stringify({ viewport, geometry })).toBeLessThanOrEqual(geometry.root.bottom + 1);
    await checkPageWidth(page);
  }
});
