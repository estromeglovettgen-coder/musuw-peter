import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import "../wiki-product-surface.css";
import { ArrowLeft } from "@phosphor-icons/react/ArrowLeft";
import { BookOpenText } from "@phosphor-icons/react/BookOpenText";
import { CaretDown } from "@phosphor-icons/react/CaretDown";
import { CaretLeft } from "@phosphor-icons/react/CaretLeft";
import { CaretRight } from "@phosphor-icons/react/CaretRight";
import { ChatCenteredText } from "@phosphor-icons/react/ChatCenteredText";
import { ClockCounterClockwise } from "@phosphor-icons/react/ClockCounterClockwise";
import { CursorClick } from "@phosphor-icons/react/CursorClick";
import { FileText } from "@phosphor-icons/react/FileText";
import { FolderSimple } from "@phosphor-icons/react/FolderSimple";
import { Graph } from "@phosphor-icons/react/Graph";
import { ListBullets } from "@phosphor-icons/react/ListBullets";
import { MagnifyingGlass } from "@phosphor-icons/react/MagnifyingGlass";
import { PencilSimple } from "@phosphor-icons/react/PencilSimple";
import { Plus } from "@phosphor-icons/react/Plus";
import { Tag } from "@phosphor-icons/react/Tag";
import { Trash } from "@phosphor-icons/react/Trash";
import { TreeStructure } from "@phosphor-icons/react/TreeStructure";
import { UsersThree } from "@phosphor-icons/react/UsersThree";
import { motion } from "motion/react";
import { GraphNodeDetailDrawer } from "./GraphNodeDetailDrawer";
import { ObsidianGraphCanvas } from "./ObsidianGraphCanvas";
import {
  GRAPH_SHOWCASE_MOTION,
  graphShowcaseProgressionTimeScale,
  graphNeighborSlugs,
} from "./graphShowcaseMotion";
import { obsidianTextAlpha } from "./obsidian-graph/obsidianNativeGraphContract.ts";
import { KNOWLEDGE_STORIES, isChineseStory } from "../data/knowledgeStories";
import {
  LITTLE_PRINCE_GRAPH_TOTALS,
  LITTLE_PRINCE_GRAPH_VIEW,
  createLittlePrinceGraph,
} from "../data/littlePrinceGraph";

const GRAPH_PREVIEW_SETTINGS = Object.freeze({
  scale: LITTLE_PRINCE_GRAPH_VIEW.initialScale,
  textFadeMultiplier: LITTLE_PRINCE_GRAPH_VIEW.textFadeMultiplier,
  nodeSizeMultiplier: LITTLE_PRINCE_GRAPH_VIEW.nodeSizeMultiplier,
  lineSizeMultiplier: LITTLE_PRINCE_GRAPH_VIEW.lineSizeMultiplier,
  centerStrength: LITTLE_PRINCE_GRAPH_VIEW.centerStrength,
  repelStrength: LITTLE_PRINCE_GRAPH_VIEW.repelStrength,
  linkStrength: LITTLE_PRINCE_GRAPH_VIEW.linkStrength,
  linkDistance: LITTLE_PRINCE_GRAPH_VIEW.linkDistance,
});
const GRAPH_FOCUS_SLUG = "character:prince";
const GRAPH_LINK_TARGET_SLUG = "summary:chapter:21";
const GRAPH_TERMINAL_TEXT_FADE = 1.2;
const GRAPH_FIT_SETTLE_MS = 220;
const WIKI_POINTER_TRANSITION = Object.freeze({ duration: 0.94, ease: [0.16, 1, 0.3, 1] });
export const GRAPH_PREVIEW_TOTALS = LITTLE_PRINCE_GRAPH_TOTALS;

function ProductSidebar({ collapsed = false, copy }) {
  const today = copy.sessions.slice(0, 1);
  const recent = copy.sessions.slice(1);
  return (
    <aside className={`visual-sidebar kb-preview-app-sidebar${collapsed ? " is-collapsed" : ""}`} data-product-app-sidebar="true" data-product-app-sidebar-state={collapsed ? "collapsed" : "expanded"}>
      <header className="visual-sidebar__header kb-preview-sidebar-header"><img src="/images/musuw-logo.png" alt="" draggable={false} />{collapsed ? <CaretRight size={12} aria-hidden="true" /> : <CaretLeft size={12} aria-hidden="true" />}</header>
      <div className="visual-sidebar__primary-actions kb-preview-primary-actions">
        <button className="visual-sidebar__primary is-new kb-preview-primary is-new" type="button"><ChatCenteredText size={13} /><b>{copy.newChat}</b></button>
        <button className="visual-sidebar__primary is-kb is-active kb-preview-primary is-active" type="button"><FolderSimple size={13} /><b>{copy.knowledgeBases}</b><small>3</small></button>
        <button className="visual-sidebar__primary is-native kb-preview-primary" type="button"><UsersThree size={13} /><b>{copy.agents}</b></button>
      </div>
      <div className="visual-sidebar__history kb-preview-history">
        <section><h5>{copy.today}</h5>{today.map((item) => <span key={item}>{item}</span>)}</section>
        <section><h5>{copy.recent}</h5>{recent.map((item) => <span key={item}>{item}</span>)}</section>
      </div>
      <footer className="visual-sidebar__footer kb-preview-user"><i>M</i><span><b>{copy.userName}</b><small>{copy.userMeta}</small></span><CaretDown size={10} /></footer>
    </aside>
  );
}

function KnowledgeHeader({ active = "graph", copy }) {
  return (
    <header className="visual-knowledge-header kb-preview-knowledge-header">
      <div className="visual-knowledge-header__copy kb-preview-header-copy">
        <div className="visual-knowledge-breadcrumb kb-preview-breadcrumb"><CaretLeft size={10} /><span>{copy.knowledgeBases}</span><em>/</em><strong>{copy.current}</strong><CaretDown size={9} /><em>/</em><span>{active === "wiki" ? copy.wiki : copy.graph}</span></div>
        <p>{copy.description}</p>
      </div>
      <div className="visual-knowledge-header__actions kb-preview-header-actions">
        <div className="visual-knowledge-tabs kb-preview-tabs" role="tablist">
          <button aria-selected="false" data-kb-tab="documents" role="tab" type="button"><FileText size={12} />{copy.documents}</button>
          <button aria-selected={active === "wiki"} className={active === "wiki" ? "is-active" : ""} data-kb-tab="wiki" role="tab" type="button"><BookOpenText size={12} />{copy.wiki}</button>
          <button aria-selected={active === "graph"} className={active === "graph" ? "is-active" : ""} data-kb-tab="graph" role="tab" type="button"><Graph size={12} />{copy.graph}</button>
        </div>
      </div>
    </header>
  );
}

function WikiSidebar({ copy, linkRef, linkState = "idle", targetItem }) {
  return (
    <aside className="wiki-sidebar kb-preview-wiki-sidebar" data-wiki-sidebar="true">
      <div className="wiki-sidebar-header kb-preview-wiki-sidebar-header">
        <label className="kb-preview-wiki-search">
          <MagnifyingGlass size={13} aria-hidden="true" />
          <input aria-label={copy.search} placeholder={copy.search} readOnly type="search" value="" />
        </label>
      </div>
      <div className="wiki-page-list kb-preview-wiki-page-list">
        <div className={`wiki-nav-item kb-preview-wiki-index${copy.pageId === "index" ? " is-active" : ""}`}><FileText size={12} aria-hidden="true" /><span>{copy.index}</span></div>
        <div className="wiki-sidebar-divider kb-preview-wiki-divider" />
        <div className="wiki-tab-bar kb-preview-wiki-tabbar">
          <strong>{copy.knowledge}</strong><span>{copy.summaries}</span>
          <i aria-hidden="true"><TreeStructure size={12} /><ListBullets size={12} /></i>
          <FolderSimple size={12} aria-hidden="true" /><Plus size={11} aria-hidden="true" />
        </div>
        <div className="wiki-tree-list kb-preview-wiki-tree">
          {copy.groups.map((group) => (
            <section key={group.label}>
              <div><CaretRight className={group.items.length ? "is-open" : ""} size={10} aria-hidden="true" /><strong>{group.label}</strong><small>{group.count}</small></div>
              {group.items.map((item) => {
                const isTarget = item === targetItem;
                return (
                  <span
                    className={`${item === copy.pageTitle ? "is-selected" : ""}${isTarget && linkState === "pressing" ? " is-pressing" : ""}`}
                    data-wiki-demo-link={isTarget ? "sidebar" : undefined}
                    data-wiki-link-state={isTarget ? linkState : undefined}
                    key={item}
                    ref={isTarget ? linkRef : undefined}
                  >
                    <Tag size={11} aria-hidden="true" />
                    <b>{item}</b>
                  </span>
                );
              })}
            </section>
          ))}
        </div>
      </div>
    </aside>
  );
}

function WikiIndexReader({ copy, sourcePage, indexRef, indexState = "idle" }) {
  return (
    <article className="wiki-reader kb-preview-wiki-reader kb-preview-wiki-index-reader" data-wiki-page-id="index" data-wiki-reader="true">
      <div className="wiki-reader-inner kb-preview-wiki-reader-inner">
        <div className="wiki-nav-bar"><div className="wiki-nav-back kb-preview-reader-back"><ArrowLeft size={10} aria-hidden="true" />{copy.back}</div></div>
        <div className="kb-preview-index-header">
          <h4>{copy.index}</h4>
          <span>{copy.indexType ?? copy.index}</span>
        </div>
        <div className="kb-preview-index-body">
          <h5>{copy.indexOverview}</h5>
          <p>{copy.indexLead}</p>
          <p>{copy.indexHint}</p>
          <section>
            <h5>{copy.summaries}</h5>
            <p>
              <a
                className={`wiki-content-link kb-preview-content-link${indexState === "pressing" ? " is-pressing" : ""}`}
                data-wiki-demo-link="index"
                data-wiki-index-link="summary"
                data-wiki-link-state={indexState}
                href={`#${sourcePage.pageId}`}
                ref={indexRef}
              >
                {sourcePage.pageTitle}
              </a>
              <span> — {sourcePage.lead}</span>
            </p>
          </section>
          <section>
            <h5>{copy.knowledge}</h5>
            {copy.groups.map((group) => (
              <p key={group.label}><strong>{group.label}</strong><span> · {group.items.join(" · ")}</span></p>
            ))}
          </section>
        </div>
      </div>
    </article>
  );
}

function WikiReader({ copy, linkKind = "inline", linkRef, linkState = "idle" }) {
  return (
    <article className="wiki-reader kb-preview-wiki-reader" data-wiki-page-id={copy.pageId} data-wiki-reader="true">
      <div className="wiki-reader-inner kb-preview-wiki-reader-inner">
        <div className="wiki-nav-bar"><div className="wiki-nav-back kb-preview-reader-back"><ArrowLeft size={10} aria-hidden="true" />{copy.back}</div></div>
        <div className="wiki-reader-header kb-preview-reader-header">
          <div className="wiki-reader-title-row kb-preview-reader-title-row">
            <div className="wiki-reader-title-block">
              <h4 className="wiki-reader-title"><span className="wiki-reader-title-text">{copy.pageTitle}</span></h4>
              <div className="wiki-reader-title-badges wiki-reader-title-badges--secondary kb-preview-reader-badges"><span className="wiki-badge wiki-badge--type"><Tag size={10} aria-hidden="true" />{copy.type}</span><span className="wiki-badge wiki-badge--ver">v1</span></div>
            </div>
            <div className="wiki-reader-aside"><div className="wiki-reader-actions kb-preview-reader-actions" aria-hidden="true"><PencilSimple size={13} /><ClockCounterClockwise size={13} /><Graph size={13} /><Trash size={13} /></div></div>
          </div>
        </div>
        <div className="kb-preview-reader-time"><ClockCounterClockwise size={10} aria-hidden="true" />{copy.updatedAt}</div>
        <div className="kb-preview-wiki-main-section">
          <p className="kb-preview-reader-lead">{copy.lead}</p>
          <div className="wiki-reader-body kb-preview-reader-body">
            <p>
              {copy.introBeforeLink}
              {linkRef ? (
                <a
                  className={`wiki-content-link kb-preview-content-link${linkState === "pressing" ? " is-pressing" : ""}`}
                  data-wiki-demo-link={linkKind}
                  data-wiki-link-state={linkState}
                  href={`#${copy.linkedPage.pageId}`}
                  ref={linkRef}
                >
                  {copy.inlineLink}
                </a>
              ) : <span className="wiki-content-link kb-preview-content-link">{copy.inlineLink}</span>}
              {copy.introAfterLink}
            </p>
            <h5>{copy.core}</h5>
            <ul>{copy.bullets.map((item) => <li key={item}>{item}</li>)}</ul>
          </div>
        </div>
        <div className="wiki-reader-body kb-preview-reader-body kb-preview-wiki-reader-tail">
          <h5>{copy.audienceTitle}</h5>
          <p>{copy.audience}</p>
          <h5>{copy.assessmentTitle}</h5>
          <p>{copy.assessment}</p>
        </div>
        <footer className="wiki-reader-footer kb-preview-reader-footer">
          <div className="wiki-reader-footer-row"><span className="wiki-reader-footer-label">{copy.linkedFrom}</span><span className="wiki-reader-footer-value"><span className="wiki-content-link kb-preview-content-link">{copy.backlinkTitle}</span></span></div>
          <div className="wiki-reader-footer-row"><span className="wiki-reader-footer-label">{copy.sources}</span><span className="wiki-reader-footer-value"><span className="wiki-content-link kb-preview-content-link">{copy.sourceTitle}</span></span></div>
        </footer>
      </div>
    </article>
  );
}

function WikiProductSurface({ copy, header, reducedMotion, sidebar, stage }) {
  const hostRef = useRef(null);
  const indexLinkRef = useRef(null);
  const readerLinkRef = useRef(null);
  const pointerRef = useRef(null);
  const pointerMotionGenerationRef = useRef(0);
  const [pointerPath, setPointerPath] = useState(null);
  const [displayPosition, setDisplayPosition] = useState(null);
  const linked = stage === "linked-page";
  const sectionVisible = ["section-page", "moving-to-inline-link", "pressing-inline-link"].includes(stage);
  const indexVisible = ["page", "moving-to-index-link", "pressing-index-link"].includes(stage);
  const indexCopy = useMemo(() => ({
    ...copy,
    pageId: "index",
    pageTitle: copy.index,
    type: copy.indexType ?? copy.index,
  }), [copy]);
  const sectionCopy = useMemo(() => ({
    ...copy,
    ...copy.linkedPage,
    linkedPage: copy.linkedPage.destinationPage,
  }), [copy]);
  const destinationCopy = useMemo(() => ({
    ...copy,
    ...copy.linkedPage,
    ...copy.linkedPage.destinationPage,
  }), [copy]);
  const readerCopy = linked ? destinationCopy : sectionVisible ? sectionCopy : indexCopy;
  const targetMode = linked
    ? null
    : stage === "section-page"
      ? "hold"
    : ["moving-to-inline-link", "pressing-inline-link"].includes(stage)
      ? "inline"
      : "index";
  const firstActionState = stage === "pressing-index-link"
    ? "pressing"
    : stage === "moving-to-index-link"
      ? "approaching"
      : "idle";
  const inlineActionState = stage === "pressing-inline-link"
    ? "pressing"
    : stage === "moving-to-inline-link"
      ? "approaching"
      : "idle";
  const readerLinkKind = sectionVisible ? "inline" : "inline-primary";
  const readerLinkState = sectionVisible ? inlineActionState : "idle";

  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host || !targetMode || targetMode === "hold") return undefined;
    let frame = 0;
    let active = true;
    const measure = () => {
      frame = 0;
      if (!active) return;
      const hostRect = host.getBoundingClientRect();
      const candidates = targetMode === "inline"
        ? [{ kind: "inline", node: readerLinkRef.current }]
        : [{ kind: "index", node: indexLinkRef.current }];
      const activeTarget = candidates.find(({ node }) => {
        const rect = node?.getBoundingClientRect();
        return rect && rect.width > 0 && rect.height > 0;
      });
      let linkRect = activeTarget?.node?.getBoundingClientRect();
      if (!activeTarget || hostRect.width <= 0 || hostRect.height <= 0 || !linkRect) return;
      const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value));
      // In the narrow live product viewport a real Wiki page is taller than
      // the clipped reader. Bring the next link into that reader before the
      // pointer travels to it; otherwise the cursor is forced to the frame
      // edge while the actual anchor remains below the visible surface.
      const reader = activeTarget.node.closest("[data-wiki-reader='true']");
      const linkCenterY = linkRect.top + linkRect.height * 0.5;
      const safeTop = hostRect.top + 18;
      const safeBottom = hostRect.bottom - 30;
      if (reader && (linkCenterY < safeTop || linkCenterY > safeBottom)) {
        const desiredCenterY = hostRect.top + clamp(hostRect.height * 0.56, 22, hostRect.height - 34);
        reader.scrollTop += linkCenterY - desiredCenterY;
        linkRect = activeTarget.node.getBoundingClientRect();
      }
      const target = {
        // `CursorClick` uses the native arrow tip near (3, 3) as its click
        // hotspot. Put that tip—not the decorative icon centre—at the centre
        // of the live blue anchor so short labels are clicked reliably too.
        x: clamp(linkRect.left - hostRect.left + linkRect.width * 0.5 - 3, 8, hostRect.width - 28),
        y: clamp(linkRect.top - hostRect.top + linkRect.height * 0.5 - 3, 8, hostRect.height - 28),
      };
      let start = {
        x: clamp(hostRect.width * 0.8, 12, hostRect.width - 28),
        y: clamp(hostRect.height * 0.78, 12, hostRect.height - 28),
      };
      if (Math.hypot(start.x - target.x, start.y - target.y) < 90) {
        start = { x: clamp(hostRect.width - 32, 12, hostRect.width - 28), y: clamp(hostRect.height - 36, 12, hostRect.height - 28) };
      }
      setPointerPath((current) => {
        if (
          stage !== "moving-to-index-link"
          && current
          && current.kind === activeTarget.kind
          && current.target.x === target.x
          && current.target.y === target.y
        ) return current;
        const transitionStart = stage === "moving-to-index-link"
          ? start
          : current?.target ?? start;
        return {
          kind: activeTarget.kind,
          start: transitionStart,
          target,
        };
      });
    };
    const queueMeasure = () => {
      if (frame) window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(measure);
    };
    const observer = new ResizeObserver(queueMeasure);
    observer.observe(host);
    if (indexLinkRef.current) observer.observe(indexLinkRef.current);
    if (readerLinkRef.current) observer.observe(readerLinkRef.current);
    queueMeasure();
    document.fonts?.ready?.then(() => { if (active) queueMeasure(); });
    return () => {
      active = false;
      if (frame) window.cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [readerCopy.pageId, stage, targetMode]);

  // Position the cursor with an explicit ready frame. Updating left/top and
  // the moving stage in the same React commit can leave Chromium's CSS
  // transition at currentTime=0 while the page is settling. First publish the
  // stable start point and force layout, then wait two animation frames before
  // writing the destination. The span itself stays mounted for both hops.
  useLayoutEffect(() => {
    const pointer = pointerRef.current;
    const generation = pointerMotionGenerationRef.current + 1;
    pointerMotionGenerationRef.current = generation;
    if (!pointer || !pointerPath || linked || reducedMotion) {
      setDisplayPosition(null);
      return undefined;
    }
    const positionTransition = `left ${WIKI_POINTER_TRANSITION.duration}s cubic-bezier(${WIKI_POINTER_TRANSITION.ease.join(",")}), top ${WIKI_POINTER_TRANSITION.duration}s cubic-bezier(${WIKI_POINTER_TRANSITION.ease.join(",")})`;
    const moving = ["moving-to-index-link", "moving-to-inline-link"].includes(stage);
    const start = moving ? pointerPath.start : pointerPath.target;
    const target = pointerPath.target;
    pointer.style.transition = "none";
    pointer.style.left = `${start.x}px`;
    pointer.style.top = `${start.y}px`;
    // Force the initial position to commit before scheduling the destination.
    void pointer.getBoundingClientRect();
    setDisplayPosition(start);
    if (!moving) {
      return undefined;
    }
    let firstFrame = 0;
    let secondFrame = 0;
    firstFrame = window.requestAnimationFrame(() => {
      secondFrame = window.requestAnimationFrame(() => {
        if (pointerMotionGenerationRef.current !== generation) return;
        pointer.style.transition = positionTransition;
        pointer.style.left = `${target.x}px`;
        pointer.style.top = `${target.y}px`;
        setDisplayPosition(target);
      });
    });
    return () => {
      if (firstFrame) window.cancelAnimationFrame(firstFrame);
      if (secondFrame) window.cancelAnimationFrame(secondFrame);
    };
  }, [linked, pointerPath, reducedMotion, stage]);

  const pointerVisible = stage !== "page";
  const pointerPressing = ["pressing-index-link", "pressing-inline-link"].includes(stage);

  return (
    <div className="kb-product-preview kb-product-preview-wiki is-wiki" data-real-product-view="wiki" data-wiki-surface="true">
      <ProductSidebar collapsed copy={sidebar} />
      <main className="visual-knowledge-page kb-preview-knowledge-page is-wiki-tab">
        <KnowledgeHeader active="wiki" copy={header} />
        <section className="visual-knowledge-wiki-host kb-preview-wiki-host" ref={hostRef}>
          <div className="kb-preview-wiki-camera" data-wiki-camera="true" data-wiki-camera-scale="1">
            <div className="wiki-browser kb-preview-wiki-browser" data-wiki-flow-state={stage}>
              <WikiSidebar
                copy={readerCopy}
                targetItem={undefined}
              />
              <motion.div
                animate={{ opacity: 1, y: 0 }}
                className="wiki-content kb-preview-wiki-content"
                initial={linked && !reducedMotion ? { opacity: 0.68, y: 7 } : false}
                key={readerCopy.pageId}
                transition={{ duration: 0.34, ease: [0.22, 1, 0.36, 1] }}
              >
                {indexVisible ? (
                  <WikiIndexReader
                    copy={indexCopy}
                    indexRef={indexLinkRef}
                    indexState={pointerPath?.kind === "index" ? firstActionState : "idle"}
                    sourcePage={copy}
                  />
                ) : (
                  <WikiReader
                    copy={readerCopy}
                    linkKind={readerLinkKind}
                    linkRef={linked ? null : readerLinkRef}
                    linkState={readerLinkState}
                  />
                )}
              </motion.div>
            </div>
          </div>
          {pointerPath && !linked && !reducedMotion ? (
            <span
              aria-hidden="true"
              className={`kb-preview-wiki-pointer${pointerPressing ? " is-clicking" : ""}`}
              data-wiki-auto-pointer={stage}
              data-wiki-pointer-position={displayPosition ? `${displayPosition.x},${displayPosition.y}` : undefined}
              ref={pointerRef}
              style={{
                opacity: pointerVisible ? 1 : 0,
                transform: `scale(${pointerPressing ? 0.88 : 1})`,
              }}
            >
              <CursorClick size={22} weight="fill" />
              <i aria-hidden="true" />
            </span>
          ) : null}
        </section>
      </main>
    </div>
  );
}

function graphColor(value) {
  return typeof value === "number" ? `#${value.toString(16).padStart(6, "0")}` : value;
}

function graphPreviewUsesBottomDrawer(surface) {
  // The production Wiki always renders this detail surface as a right-side
  // drawer. Keep the preview on that same contract at every breakpoint; a
  // bottom sheet changes the graph's usable viewport and is not representative
  // of the real user flow.
  void surface;
  return false;
}

function graphDrawerInset(surface) {
  const viewport = surface?.closest(".kb-product-preview-viewport");
  const drawerLayer = viewport?.querySelector(".graph-node-drawer-layer");
  const drawerRect = drawerLayer?.getBoundingClientRect();
  const canvasRect = viewport?.querySelector(".kb-preview-graph-canvas")?.getBoundingClientRect();
  // The renderer's inset is measured from the canvas edge, not the shell edge.
  // A collapsed sidebar shifts the canvas inward, so using the drawer's full
  // width would reserve an extra sidebar gutter and leave no mobile graph
  // viewport. This overlap is the exact region that can be covered.
  const measuredOverlap = drawerRect && canvasRect ? canvasRect.right - drawerRect.left : 0;
  const narrowViewport = (viewport?.clientWidth ?? 0) > 0 && (viewport?.clientWidth ?? 0) <= 760;
  if (Number.isFinite(measuredOverlap) && measuredOverlap > 0) {
    // Leave a 4px breathing edge inside the drawer overlap on narrow shells;
    // the renderer's own 18px fit padding then keeps every focused node just
    // left of the panel instead of allowing a force tick to clip its outline.
    return narrowViewport ? Math.max(0, measuredOverlap - 4) : measuredOverlap;
  }
  const shellWidth = surface?.closest(".kb-product-preview")?.clientWidth ?? surface?.clientWidth ?? 0;
  const narrow = shellWidth > 0 && shellWidth <= 760;
  // Mirror the drawer layer's CSS width contract. The measured layer is used
  // whenever available, so fit() and the visible right edge cannot drift apart
  // when a container query changes the responsive width.
  return Math.min(350, Math.max(narrow ? 176 : 255, shellWidth * (narrow ? 0.5 : 0.35)));
}

function graphDrawerBottomInset(surface) {
  // No bottom sheet at any viewport width: the right drawer does not cover
  // the canvas vertically, so the native fit contract reserves no bottom
  // inset. Keep the argument for call-site parity with the production API.
  void surface;
  return 0;
}

function createGraphDrawerPayload(
  graphData,
  locale,
  orderedNeighborSlugs = null,
  focusSlug = GRAPH_FOCUS_SLUG,
) {
  const language = isChineseStory(locale) ? "zh" : "en";
  const node = graphData.nodes.find(({ slug }) => slug === focusSlug);
  if (!node) return null;
  const category = graphData.categories.find(({ id }) => id === node.page_type);
  const neighborSlugs = new Set(graphNeighborSlugs(graphData.nodes, graphData.edges, node.slug));
  const neighborOrder = Array.isArray(orderedNeighborSlugs)
    ? orderedNeighborSlugs.filter((slug) => neighborSlugs.has(slug))
    : graphData.nodes.filter((candidate) => neighborSlugs.has(candidate.slug)).map(({ slug }) => slug);
  const neighborBySlug = new Map(graphData.nodes.map((candidate) => [candidate.slug, candidate]));
  const neighbors = neighborOrder
    .map((slug) => neighborBySlug.get(slug))
    .filter(Boolean)
    .map((candidate) => ({
      ...candidate,
      color: graphColor(candidate.color),
    }));
  const link = (slug, text) => ({ slug, text });
  const document = node.slug === GRAPH_FOCUS_SLUG
    ? language === "zh"
      ? {
          lead: "英文标题：The Little Prince",
          blocks: [
            { type: "paragraph", text: "小王子来自 B-612 小行星。在跨越不同星球的旅程中，他持续追问责任、友谊与事物真正的价值。" },
            { type: "heading", text: "资料中的关键线索" },
            { type: "paragraph", segments: [
              "在 ",
              link("summary:chapter:21", "第21章总结：狐狸讲述关系如何形成"),
              " 中，狐狸用耐心、仪式与共同度过的时间解释关系如何形成；小王子也由此重新理解自己对玫瑰的责任。",
            ] },
            { type: "heading", text: "关联页面" },
            { type: "list", items: [
              [link("place:b612", "B-612 小行星")],
              [link("character:rose", "玫瑰")],
              [link("character:fox", "狐狸")],
            ] },
          ],
        }
      : {
          lead: "English title: The Little Prince",
          blocks: [
            { type: "paragraph", text: "The Little Prince comes from asteroid B-612. Across his journey, he keeps testing what responsibility, friendship, and lasting value mean." },
            { type: "heading", text: "Key evidence in the source" },
            { type: "paragraph", segments: [
              "In ",
              link("summary:chapter:21", "Chapter 21 summary: The fox explains how bonds are formed"),
              ", the fox connects patience, ritual, and shared time to the formation of a relationship. The encounter changes how the prince understands his responsibility for the rose.",
            ] },
            { type: "heading", text: "Linked pages" },
            { type: "list", items: [
              [link("place:b612", "Asteroid B-612")],
              [link("character:rose", "The rose")],
              [link("character:fox", "The fox")],
            ] },
          ],
        }
    : node.slug === GRAPH_LINK_TARGET_SLUG
      ? language === "zh"
        ? {
            lead: "英文标题：Chapter 21 summary: The fox teaches how bonds are made",
            blocks: [
              { type: "paragraph", text: "小王子在玫瑰园发现许多相似的玫瑰后遇见狐狸。狐狸将“建立联系”解释为一个需要耐心、规律与共同时间的过程。" },
              { type: "heading", text: "关键事件" },
              { type: "list", items: [
                [link("chapter:21:event:1", "狐狸请小王子用耐心建立联系")],
                [link("chapter:21:event:2", "仪式与共同度过的时间让彼此变得独特")],
                [link("chapter:21:event:3", "小王子理解了自己对玫瑰负有责任")],
              ] },
              { type: "heading", text: "关系演变" },
              { type: "table", headers: ["阶段", "资料事实", "变化"], rows: [
                ["接近", "狐狸要求保持距离并耐心等待", "从陌生到建立预期"],
                ["形成", "固定时间见面，共同建立仪式", "彼此从同类中变得独特"],
                ["确认", "小王子重新理解玫瑰的意义", "关系转化为持续的责任"],
              ] },
              { type: "heading", text: "归纳" },
              { type: "paragraph", text: "本章把关系描述为可逐步形成、可由行为验证的过程：投入时间产生独特性，独特性进一步带来责任。" },
              { type: "heading", text: "关联页面" },
              { type: "paragraph", segments: [
                link("chapter:21", "第21章：狐狸讲述关系如何形成"),
                " · ",
                link("relation:21:character", "人物关系"),
                " · ",
                link("relation:21:theme", "主题关系"),
              ] },
            ],
          }
        : {
            lead: "Chapter 21 summary: The fox teaches how bonds are made",
            blocks: [
              { type: "paragraph", text: "After finding a garden full of similar roses, the Little Prince meets the fox. The fox describes forming a bond as a process built through patience, ritual, and shared time." },
              { type: "heading", text: "Key events" },
              { type: "list", items: [
                [link("chapter:21:event:1", "The fox asks the prince to create a bond patiently")],
                [link("chapter:21:event:2", "Ritual and shared time make each relationship distinct")],
                [link("chapter:21:event:3", "The prince understands his responsibility for the rose")],
              ] },
              { type: "heading", text: "How the relationship changes" },
              { type: "table", headers: ["Stage", "Source fact", "Change"], rows: [
                ["Approach", "The fox asks for distance and patient repetition", "Strangers begin to expect each other"],
                ["Formation", "They meet at a fixed time and establish a ritual", "Each becomes distinct from others"],
                ["Recognition", "The prince reconsiders what makes the rose matter", "Attachment becomes continuing responsibility"],
              ] },
              { type: "heading", text: "Synthesis" },
              { type: "paragraph", text: "The chapter presents a bond as a process that can be traced through behavior: invested time creates distinctiveness, and distinctiveness creates responsibility." },
              { type: "heading", text: "Linked pages" },
              { type: "paragraph", segments: [
                link("chapter:21", "Chapter 21: The fox teaches how bonds are made"),
                " · ",
                link("relation:21:character", "Character relations"),
                " · ",
                link("relation:21:theme", "Theme relations"),
              ] },
            ],
          }
      : {
          lead: language === "zh" ? "此页面由知识库资料解析生成。" : "This page was parsed from the knowledge base source.",
          blocks: [{ type: "heading", text: language === "zh" ? "关联" : "Links" }],
        };
  return {
    node: {
      ...node,
      categoryLabel: category?.label,
      color: graphColor(node.color),
    },
    neighbors,
    document,
    activeLinkSlug: node.slug === GRAPH_FOCUS_SLUG ? GRAPH_LINK_TARGET_SLUG : null,
    linkTargetSlug: node.slug === GRAPH_FOCUS_SLUG ? GRAPH_LINK_TARGET_SLUG : null,
    neighborHint: language === "zh"
      ? `已显示邻居 ${neighborSlugs.size}/${node.link_count ?? neighborSlugs.size}`
      : `${neighborSlugs.size}/${node.link_count ?? neighborSlugs.size} neighbors shown`,
  };
}

function GraphProductSurface({ autoPlay, copy, locale, onDrawerChange, onStageChange }) {
  const canvasRef = useRef(null);
  const graphViewportRef = useRef(null);
  const pointerRef = useRef(null);
  const surfaceRef = useRef(null);
  const focusSlugRef = useRef(GRAPH_FOCUS_SLUG);
  const focusRightInsetRef = useRef(LITTLE_PRINCE_GRAPH_VIEW.fitRightInset);
  const focusBottomInsetRef = useRef(0);
  const terminalTimersRef = useRef([]);
  const fitTimerRef = useRef(null);
  const growthScaleCapRef = useRef(LITTLE_PRINCE_GRAPH_VIEW.initialScale);
  const growthFitActiveRef = useRef(false);
  const terminalStartedRef = useRef(false);
  const graphData = useMemo(() => createLittlePrinceGraph(locale), [locale]);
  const drawerPayload = useMemo(() => createGraphDrawerPayload(graphData, locale), [graphData, locale]);
  const defaultFocusNeighborSlugs = useMemo(
    () => drawerPayload?.neighbors?.map(({ slug }) => slug).filter(Boolean) ?? [],
    [drawerPayload],
  );
  const [terminalNeighborSlugs, setTerminalNeighborSlugs] = useState(defaultFocusNeighborSlugs);
  const terminalNeighborSlugsRef = useRef(defaultFocusNeighborSlugs);
  const [focusSlug, setFocusSlug] = useState(GRAPH_FOCUS_SLUG);
  const focusNodeSlugs = useMemo(() => {
    // Selection brightens every direct relation, so the click-time camera must
    // fit that same complete set. Fitting only a hand-picked prefix leaves
    // bright edges pointing at off-screen nodes and makes the graph look fake.
    const slugs = new Set([focusSlug]);
    for (const slug of terminalNeighborSlugs) {
      if (slug) slugs.add(slug);
    }
    return [...slugs];
  }, [focusSlug, terminalNeighborSlugs]);
  const total = graphData.nodes.length;
  const [playback, setPlayback] = useState(() => ({ state: "idle", visible: total, total }));
  const [showcaseStage, setShowcaseStage] = useState("idle");
  // The drawer is owned by the parent surface while the graph playback lives
  // here. Commit both in the timer callback, not through a child effect: a
  // deferred parent update shortens the cursor's visible travel time under
  // render load even though the timer itself is correct.
  const commitShowcaseStage = useCallback((nextStage) => {
    setShowcaseStage(current => current === nextStage ? current : nextStage);
    onStageChange?.(nextStage);
  }, [onStageChange]);
  const [fittedCameraScale, setFittedCameraScale] = useState(LITTLE_PRINCE_GRAPH_VIEW.initialScale);
  const visibleCount = Math.max(0, Math.min(playback.visible, total));
  const terminal = ["settle", "focus", "hover", "drawer", "drawer-link-moving", "drawer-link-press", "linked-page"].includes(showcaseStage);
  const cameraScale = fittedCameraScale;
  const textFadeMultiplier = terminal
    ? GRAPH_TERMINAL_TEXT_FADE
    : LITTLE_PRINCE_GRAPH_VIEW.textFadeMultiplier;
  const labelAlpha = obsidianTextAlpha(cameraScale, textFadeMultiplier);

  const clearTerminalTimers = useCallback(() => {
    for (const timer of terminalTimersRef.current) window.clearTimeout(timer);
    terminalTimersRef.current = [];
  }, []);

  const fitVisibleNodes = useCallback(() => {
    void canvasRef.current?.fit({
      visibleOnly: true,
      // Keep the initial presentation scale as the upper bound rather than
      // feeding the last fit back as a permanent ceiling. A single force
      // tick can briefly place an outlier far away; using that transient fit
      // as maxScale used to monotonically lock every subsequent fit to a tiny
      // camera scale. The renderer still eases each target, and later fits
      // are free to recover when the layout settles.
      maxScale: growthFitActiveRef.current
        ? growthScaleCapRef.current
        : LITTLE_PRINCE_GRAPH_VIEW.initialScale,
    });
  }, []);

  const handleCameraScaleChange = useCallback((scale) => {
    if (!Number.isFinite(scale)) return;
    const maxScale = growthFitActiveRef.current
      ? LITTLE_PRINCE_GRAPH_VIEW.initialScale
      : LITTLE_PRINCE_GRAPH_VIEW.focusScale;
    const nextScale = Math.min(
      maxScale,
      Math.max(Number.EPSILON, scale),
    );
    const fittedScale = growthFitActiveRef.current
      ? Math.min(growthScaleCapRef.current, nextScale)
      : nextScale;
    if (growthFitActiveRef.current) growthScaleCapRef.current = fittedScale;
    setFittedCameraScale(fittedScale);
  }, []);

  const scheduleVisibleFit = useCallback(() => {
    // The native fit() eases over 420ms. Coalesce the high-frequency node
    // unlock callbacks into one trailing fit so a new force tick updates the
    // target without repeatedly cancelling that camera easing mid-flight.
    if (fitTimerRef.current) return;
    fitVisibleNodes();
    fitTimerRef.current = window.setTimeout(() => {
      fitTimerRef.current = null;
      fitVisibleNodes();
    }, GRAPH_FIT_SETTLE_MS);
  }, [fitVisibleNodes]);

  const chooseNearestTerminalNeighbors = useCallback((sourceSlug = focusSlugRef.current) => {
    const center = canvasRef.current?.getNodeViewportPoint(sourceSlug);
    const sourceNeighbors = graphNeighborSlugs(graphData.nodes, graphData.edges, sourceSlug);
    if (!center) return sourceNeighbors.length > 0 ? sourceNeighbors : terminalNeighborSlugsRef.current;
    const ranked = sourceNeighbors
      .map((slug) => ({ slug, point: canvasRef.current?.getNodeViewportPoint(slug) }))
      .filter(({ point }) => point && Number.isFinite(point.x) && Number.isFinite(point.y))
      .sort((left, right) => (
        (left.point.x - center.x) ** 2 + (left.point.y - center.y) ** 2
        - (right.point.x - center.x) ** 2 - (right.point.y - center.y) ** 2
      ))
      .map(({ slug }) => slug);
    const next = ranked.length > 0 ? ranked : terminalNeighborSlugsRef.current;
    terminalNeighborSlugsRef.current = next;
    setTerminalNeighborSlugs(current => current.join("|") === next.join("|") ? current : next);
    return next;
  }, [graphData]);

  const beginTerminalSequence = useCallback(() => {
    if (terminalStartedRef.current) return;
    terminalStartedRef.current = true;
    clearTerminalTimers();
    if (fitTimerRef.current) window.clearTimeout(fitTimerRef.current);
    fitTimerRef.current = null;
    focusSlugRef.current = GRAPH_FOCUS_SLUG;
    setFocusSlug(GRAPH_FOCUS_SLUG);
    canvasRef.current?.clearSelection();
    onDrawerChange?.(null);
    commitShowcaseStage("settle");

    const focusTimer = window.setTimeout(() => {
      commitShowcaseStage("focus");
    }, GRAPH_SHOWCASE_MOTION.settleDurationMs);
    const hoverTimer = window.setTimeout(() => {
      // Once the force layout has settled, keep every direct neighbour in a
      // stable distance order. The click-time fit uses this complete set so
      // every bright endpoint is inside the unobscured graph viewport.
      chooseNearestTerminalNeighbors(GRAPH_FOCUS_SLUG);
      commitShowcaseStage("hover");
      canvasRef.current?.setHoveredNode(GRAPH_FOCUS_SLUG);
    }, GRAPH_SHOWCASE_MOTION.settleDurationMs + GRAPH_SHOWCASE_MOTION.focusDurationMs);
    const drawerTimer = window.setTimeout(() => {
      const rightInset = graphDrawerInset(surfaceRef.current);
      const bottomInset = graphDrawerBottomInset(surfaceRef.current);
      focusRightInsetRef.current = rightInset;
      focusBottomInsetRef.current = bottomInset;
      // Publish the click-time viewport contract before the parent exposes
      // the drawer stage.  The native fit and the drawer then begin on the
      // same rendered frame instead of briefly reporting the seed inset.
      if (graphViewportRef.current) {
        graphViewportRef.current.dataset.graphFocusRightInset = rightInset.toFixed(2);
        graphViewportRef.current.dataset.graphFocusBottomInset = bottomInset.toFixed(2);
      }
      const terminalNeighbors = terminalNeighborSlugsRef.current;
      const focusNodeSlugs = [GRAPH_FOCUS_SLUG, ...terminalNeighbors];
      const terminalPayload = createGraphDrawerPayload(graphData, locale, terminalNeighbors, GRAPH_FOCUS_SLUG);

      // One click, one camera action: lock the force positions first, then
      // start the native 420ms fit on the same event-loop turn in which the
      // real 420ms right drawer begins opening. The fit reserves the drawer
      // width, so the frozen focus cluster zooms in and shifts left once.
      canvasRef.current?.freezeLayout();
      canvasRef.current?.setSelectedNode(GRAPH_FOCUS_SLUG);
      commitShowcaseStage("drawer");
      onDrawerChange?.(terminalPayload);
      const fitPromise = canvasRef.current?.fit({
        nodeSlugs: focusNodeSlugs,
        rightInset,
        bottomInset,
        maxScale: LITTLE_PRINCE_GRAPH_VIEW.focusScale,
      });
      if (fitPromise?.then) void fitPromise.then(() => canvasRef.current?.settleCamera());
    }, GRAPH_SHOWCASE_MOTION.settleDurationMs + GRAPH_SHOWCASE_MOTION.focusDurationMs + GRAPH_SHOWCASE_MOTION.hoverDurationMs);
    const drawerAt = GRAPH_SHOWCASE_MOTION.settleDurationMs + GRAPH_SHOWCASE_MOTION.focusDurationMs + GRAPH_SHOWCASE_MOTION.hoverDurationMs;
    const linkMoveTimer = window.setTimeout(() => {
      commitShowcaseStage("drawer-link-moving");
    }, drawerAt + GRAPH_SHOWCASE_MOTION.drawerReadDurationMs);
    const linkPressTimer = window.setTimeout(() => {
      commitShowcaseStage("drawer-link-press");
    }, drawerAt + GRAPH_SHOWCASE_MOTION.drawerReadDurationMs + GRAPH_SHOWCASE_MOTION.drawerLinkMoveDurationMs);
    const linkNavigateTimer = window.setTimeout(() => {
      const targetSlug = GRAPH_LINK_TARGET_SLUG;
      focusSlugRef.current = targetSlug;
      setFocusSlug(targetSlug);
      const targetNeighbors = chooseNearestTerminalNeighbors(targetSlug);
      terminalNeighborSlugsRef.current = targetNeighbors;
      setTerminalNeighborSlugs(targetNeighbors);
      canvasRef.current?.setSelectedNode(targetSlug);
      onDrawerChange?.(createGraphDrawerPayload(graphData, locale, targetNeighbors, targetSlug));
      commitShowcaseStage("linked-page");
      const focusPromise = canvasRef.current?.fit({
        nodeSlugs: [targetSlug, ...targetNeighbors],
        rightInset: focusRightInsetRef.current,
        bottomInset: focusBottomInsetRef.current,
        maxScale: LITTLE_PRINCE_GRAPH_VIEW.focusScale,
      });
      if (focusPromise?.then) void focusPromise.then(() => canvasRef.current?.settleCamera());
    }, drawerAt + GRAPH_SHOWCASE_MOTION.drawerReadDurationMs + GRAPH_SHOWCASE_MOTION.drawerLinkMoveDurationMs + GRAPH_SHOWCASE_MOTION.drawerLinkPressDurationMs);
    terminalTimersRef.current = [focusTimer, hoverTimer, drawerTimer, linkMoveTimer, linkPressTimer, linkNavigateTimer];
  }, [chooseNearestTerminalNeighbors, clearTerminalTimers, commitShowcaseStage, graphData, locale, onDrawerChange]);

  const handlePlaybackChange = useCallback((snapshot) => {
    setPlayback(snapshot);
    if (snapshot.state === "playing") {
      growthFitActiveRef.current = true;
      const growthTimeScale = graphShowcaseProgressionTimeScale(snapshot.visible, total, {
        accelerationStartNode: LITTLE_PRINCE_GRAPH_VIEW.progressionAccelerationStartNode,
        accelerationEndNode: LITTLE_PRINCE_GRAPH_VIEW.progressionAccelerationEndNode,
        progressionTimeScale: LITTLE_PRINCE_GRAPH_VIEW.progressionTimeScale,
        progressionMaxTimeScale: LITTLE_PRINCE_GRAPH_VIEW.progressionMaxTimeScale,
      });
      canvasRef.current?.setProgressionTimeScale(growthTimeScale);
      if (snapshot.visible <= 1) {
        terminalStartedRef.current = false;
        clearTerminalTimers();
        if (fitTimerRef.current) window.clearTimeout(fitTimerRef.current);
        fitTimerRef.current = null;
        onDrawerChange?.(null);
        canvasRef.current?.clearSelection();
        focusSlugRef.current = GRAPH_FOCUS_SLUG;
        setFocusSlug(GRAPH_FOCUS_SLUG);
        growthFitActiveRef.current = true;
        growthScaleCapRef.current = LITTLE_PRINCE_GRAPH_VIEW.initialScale;
        terminalNeighborSlugsRef.current = defaultFocusNeighborSlugs;
        setTerminalNeighborSlugs(defaultFocusNeighborSlugs);
        setFittedCameraScale(LITTLE_PRINCE_GRAPH_VIEW.initialScale);
      } else if (snapshot.visible > LITTLE_PRINCE_GRAPH_VIEW.seedNodeCount) {
        scheduleVisibleFit();
      }
      commitShowcaseStage(snapshot.visible <= LITTLE_PRINCE_GRAPH_VIEW.seedNodeCount ? "seed" : "grow");
    } else if (snapshot.state === "complete") {
      beginTerminalSequence();
    }
  }, [beginTerminalSequence, clearTerminalTimers, commitShowcaseStage, defaultFocusNeighborSlugs, onDrawerChange, scheduleVisibleFit, total]);

  useEffect(() => {
    // Release the monotonic growth ceiling only after React has committed the
    // terminal stage. Otherwise the completion fit can report a tiny rebound
    // while the DOM still says `grow`, which reads as a last-frame zoom-in.
    if (showcaseStage === "settle") growthFitActiveRef.current = false;
  }, [showcaseStage]);

  useEffect(() => {
    canvasRef.current?.setSettings({
      ...GRAPH_PREVIEW_SETTINGS,
      scale: cameraScale,
      textFadeMultiplier,
    });
  }, [cameraScale, textFadeMultiplier]);

  useEffect(() => {
    if (!["hover", "drawer", "drawer-link-moving", "drawer-link-press", "linked-page"].includes(showcaseStage)) return undefined;
    let frameId = 0;
    const trackFocus = () => {
      const viewport = graphViewportRef.current;
      const pointer = pointerRef.current;
      const focusPoint = canvasRef.current?.getNodeViewportPoint(focusSlug);
      if (viewport && focusPoint) {
        const points = focusNodeSlugs
          .map((slug) => canvasRef.current?.getNodeViewportPoint(slug))
          .filter(Boolean);
        const bounds = points.reduce((result, point) => ({
          minX: Math.min(result.minX, point.x),
          maxX: Math.max(result.maxX, point.x),
          minY: Math.min(result.minY, point.y),
          maxY: Math.max(result.maxY, point.y),
        }), { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity });
        if (points.length > 0) {
          viewport.dataset.graphFocusBounds = [bounds.minX, bounds.maxX, bounds.minY, bounds.maxY].map(value => value.toFixed(2)).join(",");
        }
        // Keep the DOM acceptance bounds in lock-step with the native
        // renderer's calculateFit() margins. The compact mobile canvas uses
        // a 16px horizontal margin (rather than the old fixed 18px check),
        // otherwise nodes that are genuinely inside the renderer's fit box
        // were reported as clipped by two pixels and triggered an endless
        // refit loop.
        const usableWidthForFit = Math.max(1, viewport.clientWidth - focusRightInsetRef.current);
        const usableHeightForFit = Math.max(1, viewport.clientHeight - focusBottomInsetRef.current);
        const horizontalPadding = Math.min(60, Math.max(16, usableWidthForFit * 0.12));
        const verticalPadding = Math.min(
          focusBottomInsetRef.current > 0 ? 32 : 60,
          Math.max(16, usableHeightForFit * 0.12),
        );
        const leftEdge = horizontalPadding;
        const rightEdge = viewport.clientWidth - focusRightInsetRef.current - horizontalPadding;
        const topEdge = verticalPadding;
        const bottomEdge = viewport.clientHeight - focusBottomInsetRef.current - verticalPadding;
        const usableWidth = Math.max(1, rightEdge - leftEdge);
        const usableHeight = Math.max(1, bottomEdge - topEdge);
        // Force ticks can move a node centre by a sub-pixel after the native
        // fit has settled. On the compact right-drawer canvas, accept a
        // 4px breathing tolerance inside the still-visible canvas; this does
        // not change the renderer's inset or allow a node beneath the panel,
        // whose edge starts 4px before the reserved inset.
        const visibilityTolerance = focusRightInsetRef.current > 0 && viewport.clientWidth <= 760 ? 4 : 0;
        const visibleLeft = Math.max(0, leftEdge - visibilityTolerance);
        const visibleRight = Math.min(viewport.clientWidth - focusRightInsetRef.current + visibilityTolerance, rightEdge + visibilityTolerance);
        const visibleTop = Math.max(0, topEdge - visibilityTolerance);
        const visibleBottom = Math.min(viewport.clientHeight - focusBottomInsetRef.current + visibilityTolerance, bottomEdge + visibilityTolerance);
        const coverage = Math.max(
          (bounds.maxX - bounds.minX) / usableWidth,
          (bounds.maxY - bounds.minY) / usableHeight,
        );
        // This loop is observational only. It updates acceptance diagnostics
        // and keeps the cursor attached to the selected node; camera movement
        // remains exclusively owned by the single click-time fit above.
        viewport.dataset.graphFocusCoverage = coverage.toFixed(3);
        const allVisible = points.length === focusNodeSlugs.length && points.every((point) => (
          point.x >= visibleLeft
          && point.x <= visibleRight
          && point.y >= visibleTop
          && point.y <= visibleBottom
        ));
        viewport.dataset.graphFocusNode = focusSlug;
        viewport.dataset.graphFocusX = focusPoint.x.toFixed(2);
        viewport.dataset.graphFocusY = focusPoint.y.toFixed(2);
        viewport.dataset.graphFocusVisible = String(points.filter((point) => (
          point.x >= visibleLeft
          && point.x <= visibleRight
          && point.y >= visibleTop
          && point.y <= visibleBottom
        )).length);
        viewport.dataset.graphFocusTotal = String(focusNodeSlugs.length);
        viewport.dataset.graphFocusAllVisible = String(allVisible);
        viewport.dataset.graphFocusRightInset = focusRightInsetRef.current.toFixed(2);
        viewport.dataset.graphFocusBottomInset = focusBottomInsetRef.current.toFixed(2);
        viewport.dataset.graphCameraScale = focusPoint.scale.toFixed(3);
        if (pointer) {
          pointer.style.left = `${focusPoint.x - 3}px`;
          pointer.style.top = `${focusPoint.y - 3}px`;
        }
      }
      frameId = window.requestAnimationFrame(trackFocus);
    };
    trackFocus();
    return () => window.cancelAnimationFrame(frameId);
  }, [focusNodeSlugs, focusSlug, showcaseStage]);

  useEffect(() => () => {
    clearTerminalTimers();
    if (fitTimerRef.current) window.clearTimeout(fitTimerRef.current);
    onDrawerChange?.(null);
  }, [clearTerminalTimers, onDrawerChange]);

  return (
    <div className="wiki-browser kb-preview-wiki-browser is-graph" data-graph-label-alpha={Number(labelAlpha.toFixed(3))} data-graph-node-count={total} data-graph-showcase-stage={showcaseStage} data-graph-focus-slug={focusSlug} ref={surfaceRef}>
      <div className="wiki-graph kb-preview-graph">
        <div className="wiki-graph-search-container kb-preview-graph-search-container"><div className="wiki-graph-search-row kb-preview-graph-search-row"><div className="wiki-graph-search kb-preview-graph-search"><MagnifyingGlass size={12} /><span>{copy.search}</span><CaretDown size={10} /></div></div></div>
        <div className="wiki-graph-canvas kb-preview-graph-canvas" data-graph-camera-scale={Number(cameraScale.toFixed(3))} ref={graphViewportRef} style={{ pointerEvents: "none" }}>
          <ObsidianGraphCanvas autoPlay={autoPlay} data={graphData} onCameraScaleChange={handleCameraScaleChange} onPlaybackChange={handlePlaybackChange} progressionTimeScale={LITTLE_PRINCE_GRAPH_VIEW.progressionTimeScale} ref={canvasRef} settings={GRAPH_PREVIEW_SETTINGS} />
          {["hover", "drawer"].includes(showcaseStage) ? (
            <motion.span
              animate={{
                opacity: showcaseStage === "drawer" ? [1, 1, 0] : 1,
                scale: showcaseStage === "drawer" ? [1, 0.86, 0.92] : 1,
              }}
              className={`kb-preview-graph-pointer${showcaseStage === "drawer" ? " is-clicking" : ""}`}
              data-graph-auto-pointer={showcaseStage}
              initial={{ opacity: 0, scale: 0.9 }}
              ref={pointerRef}
              transition={{ duration: showcaseStage === "drawer" ? 0.28 : 0.36, ease: [0.22, 1, 0.36, 1] }}
            >
              <CursorClick size={22} weight="fill" />
              <i aria-hidden="true" />
            </motion.span>
          ) : null}
        </div>
        <aside className="wiki-graph-legend kb-preview-graph-legend">
          <div className="legend-items kb-preview-legend-items">{graphData.categories.map(({ id, label, color }) => <span className="legend-item" data-graph-legend-type={id} key={id}><i className="legend-dot" style={{ background: color }} />{label}</span>)}</div>
          <div className="legend-divider kb-preview-legend-divider" />
          <div className="wiki-graph-status-card kb-preview-legend-status"><span><Graph size={11} />{copy.overview}</span><strong>{visibleCount} / {total} {copy.count}</strong><small>{playback.state === "playing" ? copy.playbackRunning : copy.status}</small></div>
        </aside>
      </div>
    </div>
  );
}

export function KnowledgeBaseProductPreview({ graphAutoPlay = false, locale = "en", shellRef, view, wikiFlow }) {
  const story = isChineseStory(locale) ? KNOWLEDGE_STORIES.zh : KNOWLEDGE_STORIES.en;
  const wikiCopy = story.wiki;
  const graphCopy = story.graph;
  const viewportRef = useRef(null);
  const [graphDrawer, setGraphDrawer] = useState(null);
  const [graphStage, setGraphStage] = useState("idle");
  const attachRef = useCallback((node) => {
    viewportRef.current = node;
    if (typeof shellRef === "function") shellRef(node);
    else if (shellRef) shellRef.current = node;
  }, [shellRef]);
  const stage = wikiFlow?.stage ?? "page";
  const reducedMotion = Boolean(wikiFlow?.reducedMotion);

  return (
    <div className={`kb-product-preview-viewport kb-product-preview-${view}`} data-capability-demo={view} data-demo-interactive="false" data-demo-phase={view === "wiki" ? stage : graphStage} data-product-page-shell={view} inert ref={attachRef}>
      {view === "wiki" ? (
        <WikiProductSurface
          copy={wikiCopy.content}
          header={wikiCopy.header}
          reducedMotion={reducedMotion}
          sidebar={wikiCopy.app}
          stage={stage}
        />
      ) : (
        <>
          <div className="kb-product-preview is-graph">
            <ProductSidebar collapsed copy={graphCopy.app} />
            <main className="visual-knowledge-page kb-preview-knowledge-page is-graph-tab"><KnowledgeHeader active="graph" copy={graphCopy.header} /><section className="visual-knowledge-wiki-host kb-preview-wiki-host"><GraphProductSurface autoPlay={graphAutoPlay} copy={graphCopy.content} locale={locale} onDrawerChange={setGraphDrawer} onStageChange={setGraphStage} /></section></main>
          </div>
          <GraphNodeDetailDrawer
            activeLinkSlug={graphDrawer?.activeLinkSlug}
            document={graphDrawer?.document}
            linkMoveDurationMs={GRAPH_SHOWCASE_MOTION.drawerLinkMoveDurationMs}
            locale={locale}
            neighborHint={graphDrawer?.neighborHint}
            node={graphDrawer?.node}
            open={Boolean(graphDrawer)}
            pointerStage={graphStage}
          />
        </>
      )}
    </div>
  );
}
