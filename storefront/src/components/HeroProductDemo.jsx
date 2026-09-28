import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { BookmarkSimple } from "@phosphor-icons/react/BookmarkSimple";
import { CaretDown } from "@phosphor-icons/react/CaretDown";
import { Check } from "@phosphor-icons/react/Check";
import { Copy } from "@phosphor-icons/react/Copy";
import { CursorClick } from "@phosphor-icons/react/CursorClick";
import { Info } from "@phosphor-icons/react/Info";
import { PencilSimple } from "@phosphor-icons/react/PencilSimple";
import { X } from "@phosphor-icons/react/X";
import { motion, useInView, useReducedMotion } from "motion/react";
import { AuthoritativeChatComposer, AuthoritativeChatSurface } from "./AuthoritativeChatSurface";
import {
  HERO_DEMO_PHASES,
  HERO_DEMO_STAGE_DURATIONS,
  nextHeroDemoPhase,
  resolveHeroDemoPhase,
} from "./productDemoMotion";
import { HERO_STORY, isChineseStory } from "../data/knowledgeStories";

const COMPLETE_PHASE = "complete";
const HERO_PIPELINE_PHASES = Object.freeze(["retrieving", "cross-checking", "drafting", "tracing"]);

function createAnswerPlan(sections) {
  let offset = 0;
  const parts = [];
  const add = (text) => {
    if (!text) return null;
    const characters = Array.from(text);
    const segment = { text, start: offset, end: offset + characters.length };
    offset = segment.end;
    parts.push(text);
    return segment;
  };
  const plan = sections.map((section) => ({
    ...section,
    heading: add(section.title),
    bodySegment: add(section.body),
    itemSegments: (section.items ?? []).map((item) => ({ ...item, segment: add(item.text) })),
    tableSegments: section.table
      ? {
          headers: section.table.headers.map((header) => add(header)),
          rows: section.table.rows.map((row) => row.map((cell) => add(cell))),
        }
      : null,
  }));
  return { sections: plan, characters: Array.from(parts.join("")) };
}

function visibleSegment(segment, answerLength) {
  if (!segment) return "";
  return Array.from(segment.text).slice(0, Math.max(0, Math.min(Array.from(segment.text).length, answerLength - segment.start))).join("");
}

function segmentStarted(segment, answerLength) {
  return Boolean(segment && answerLength > segment.start);
}

function segmentComplete(segment, answerLength) {
  return Boolean(segment && answerLength >= segment.end);
}

function InlineCitation({ sourceId, label }) {
  return (
    <span
      className="citation citation-kb hero-inline-citation"
      data-demo-source-ref={sourceId}
      data-kb-id={sourceId}
      data-chunk-id={`${sourceId}-chunk`}
      data-doc={label}
      role="button"
      tabIndex="0"
      aria-label={label}
    >
      <span className="citation-icon citation-icon--book" aria-hidden="true" />
      <span className="citation-text">{label}</span>
      <span className="citation-tip" aria-hidden="true"><span className="tip-loading" /></span>
    </span>
  );
}

function HeroPipeline({ answerStarted, copy, phase }) {
  const phaseIndex = HERO_DEMO_PHASES.indexOf(phase);
  const sendingIndex = HERO_DEMO_PHASES.indexOf("sending");
  if (phaseIndex < sendingIndex) return null;
  const showPrePipelineWait = phase === "sending";
  const showModelWait = phase === "answering" && !answerStarted;
  const showCollapsedRoot = answerStarted || ["saving", COMPLETE_PHASE].includes(phase);
  const activeIndex = HERO_PIPELINE_PHASES.indexOf(phase);
  const visibleSteps = activeIndex >= 0
    ? copy.pipelineSteps.slice(0, activeIndex + 1)
    : showModelWait ? copy.pipelineSteps : [];
  return (
    <section className="visual-rag-pipeline" aria-label={copy.pipelineStatus}>
      <div className="visual-rag-pipeline__sr" role="status" aria-live="polite">{showPrePipelineWait ? copy.preparation : showModelWait ? copy.modelPreparation : copy.pipelineSteps[Math.max(0, activeIndex)]?.title ?? copy.pipelineStatus}</div>
      {showCollapsedRoot ? (
        <button className="visual-rag-pipeline__summary" type="button" data-rag-pipeline-summary="complete" aria-expanded="false" aria-label={copy.pipelineStatus} disabled>
          <span>{copy.pipelineStatus}</span>
          <span className="visual-rag-pipeline__reference-summary">{copy.pipelineSummary}</span>
          <CaretDown className="is-folded" size={14} aria-hidden="true" />
        </button>
      ) : (
        <div className="visual-rag-timeline">
          {showPrePipelineWait ? (
            <div className="visual-rag-step is-running">
              <span className="visual-rag-step__rail" aria-hidden="true"><span className="visual-rag-step__spinner" /></span>
              <div className="visual-rag-step__body"><strong>{copy.preparation}</strong></div>
            </div>
          ) : null}
          {visibleSteps.map((step, index) => {
            const isDone = showModelWait || index < activeIndex;
            const isActive = index === activeIndex;
            return (
              <button type="button" className={`visual-rag-step${isDone ? " is-done" : ""}${isActive ? " is-running" : ""}`} key={step.phase} disabled>
                <span className="visual-rag-step__rail" aria-hidden="true">
                  {isActive ? <span className="visual-rag-step__spinner" /> : <Check size={14} weight="bold" />}
                </span>
                <span className="visual-rag-step__body"><strong>{step.title}</strong>{isDone ? <span className="visual-rag-step__summary">{step.summary}</span> : null}</span>
              </button>
            );
          })}
          {showModelWait ? (
            <div className="visual-rag-step is-running">
              <span className="visual-rag-step__rail" aria-hidden="true"><span className="visual-rag-step__spinner" /></span>
              <div className="visual-rag-step__body"><strong>{copy.modelPreparation}</strong></div>
            </div>
          ) : null}
        </div>
      )}
    </section>
  );
}

/**
 * The save gesture ends in the same SettingDrawer/manual editor seam used by
 * the product.  This is a read-only capture of that native drawer: the Hero
 * surface remains inert, but the complete state exposes the actual header,
 * grouped body sections, editor pane, and footer order users see after saving.
 */
function HeroSaveDrawer({ copy, locale, saved = false }) {
  const chinese = isChineseStory(locale);
  const basic = chinese ? "基础信息" : "Basic";
  const content = chinese ? "内容" : "Content";
  const titleLabel = chinese ? "知识标题" : "Knowledge title";
  const knowledgeBaseLabel = chinese ? "目标知识库" : "Target knowledge base";
  const titleValue = chinese ? "问题台账 · 长期课题跟踪实验" : "Question ledger · Long-running research";
  const knowledgeBase = chinese ? "个人研究知识库" : "Personal research knowledge base";
  const drawerTitle = chinese ? "在线编辑 Markdown 知识" : "Create Markdown knowledge";
  const description = chinese ? "使用 Markdown 编写知识内容，支持实时预览" : "Write knowledge in Markdown with live preview";
  const contentLabel = chinese ? "已保存的结构化回答" : "Saved structured answer";
  const cancel = chinese ? "取消" : "Cancel";
  const saveDraft = chinese ? "暂存草稿" : "Save draft";
  // This is the native editor's final commit action in the showcase.  Keep
  // the drawer pending until the guided pointer reaches this button.
  const publish = chinese ? "发布入库" : "Publish to knowledge base";
  const sourceLabel = chinese ? "引用来源" : "Cited sources";
  return (
    <>
    <div className="hero-demo-drawer-mask t-drawer__mask" aria-hidden="true" />
    <aside className="hero-demo-save-drawer setting-drawer manual-editor-drawer t-drawer__content-wrapper t-drawer__content-wrapper--right" data-hero-save-drawer="true" data-manual-editor-drawer="true" role="dialog" aria-label={drawerTitle}>
      <button type="button" className="t-drawer__close-btn" aria-label={chinese ? "关闭" : "Close"}><X size={16} /></button>
      <div className="setting-drawer__header-block">
        <div className="setting-drawer__header">
          <div className="setting-drawer__header-icon"><PencilSimple size={18} weight="bold" /></div>
          <div className="setting-drawer__header-text">
            <div className="setting-drawer__title">{drawerTitle}</div>
            <div className="setting-drawer__subtitle">{description}</div>
          </div>
        </div>
      </div>
      <div className="setting-drawer__body">
        <div className="manual-editor">
          <section className="setting-drawer__section">
            <h4 className="setting-drawer__section-title">{basic}</h4>
            <div className="form-item">
              <label className="form-label">{titleLabel}</label>
              <div className="hero-demo-drawer-input" data-drawer-field="title">{titleValue}</div>
            </div>
            <div className="form-item">
              <label className="form-label">{knowledgeBaseLabel}</label>
              <div className="hero-demo-drawer-input" data-drawer-field="knowledge-base">{knowledgeBase}</div>
            </div>
          </section>
          <section className="setting-drawer__section editor-section">
            <h4 className="setting-drawer__section-title">{content}</h4>
            <div className="editor-area hero-demo-drawer-editor">
              <div className="editor-toolbar">
                <div className="editor-toolbar__format"><span className="hero-demo-drawer-editor-mode">Markdown</span><span className="hero-demo-drawer-editor-state">{contentLabel}</span></div>
                <div className="editor-toolbar__view"><span className="hero-demo-drawer-preview">{chinese ? "预览" : "Preview"}</span></div>
              </div>
              <div className="editor-pane">
                <div className="hero-demo-drawer-content">
                  <strong>{copy.answerSections[0]?.title}</strong>
                  <p>{copy.answerSections[0]?.body}</p>
                  <strong>{copy.answerSections[3]?.title}</strong>
                  <p>{copy.answerSections[3]?.body}</p>
                  <div className="hero-demo-drawer-source-label">{sourceLabel}</div>
                  <div className="hero-demo-drawer-sources">{copy.citations.map((citation) => <span key={citation}>{citation}</span>)}</div>
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>
      <footer className="setting-drawer__footer">
        <div className="setting-drawer__footer-left"><div className="manual-editor-footer-meta"><span className="hero-demo-drawer-status">{chinese ? "当前状态：草稿" : "Current status: Draft"}</span></div></div>
        <div className="setting-drawer__footer-right"><div className="manual-editor-footer-actions">
          <button type="button" className="hero-demo-drawer-button is-cancel">{cancel}</button>
          <button type="button" className="hero-demo-drawer-button">{saveDraft}</button>
          <button type="button" className="hero-demo-drawer-button is-primary" data-hero-save-publish="true" aria-disabled={saved ? "true" : "false"}>{publish}</button>
        </div></div>
      </footer>
    </aside>
    </>
  );
}

export function HeroProductDemo({ locale = "en" }) {
  const copy = isChineseStory(locale) ? HERO_STORY["zh-CN"] : HERO_STORY.en;
  const containerRef = useRef(null);
  const messagesRef = useRef(null);
  const threadRef = useRef(null);
  const saveButtonRef = useRef(null);
  const pointerRef = useRef(null);
  const inView = useInView(containerRef, { amount: 0.32 });
  const reduceMotion = useReducedMotion();
  const questionCharacters = useMemo(() => Array.from(copy.question), [copy.question]);
  const answerPlan = useMemo(() => createAnswerPlan(copy.answerSections), [copy.answerSections]);
  const [phaseState, setPhaseState] = useState("idle");
  const [questionLength, setQuestionLength] = useState(0);
  const [answerLength, setAnswerLength] = useState(0);
  const [pointerPath, setPointerPath] = useState(null);
  const [pointerSettled, setPointerSettled] = useState(false);
  const [pointerTravelStarted, setPointerTravelStarted] = useState(false);
  const [saveDrawerOpen, setSaveDrawerOpen] = useState(false);
  const [savePublished, setSavePublished] = useState(false);
  const [saveToastVisible, setSaveToastVisible] = useState(false);
  const [saveStep, setSaveStep] = useState("bookmark");
  const pointerAnchorRef = useRef(null);
  const saveCompletionRef = useRef(null);
  const savePressTimerRef = useRef(null);
  const [playbackReady, setPlaybackReady] = useState(false);
  const phase = resolveHeroDemoPhase(phaseState, reduceMotion);

  useEffect(() => {
    // The walkthrough is non-interactive and should begin as soon as the
    // product surface is actually visible. Requiring a scroll gesture leaves
    // the Hero permanently idle on viewports where it already fits on load.
    if (reduceMotion || inView) setPlaybackReady(true);
    return undefined;
  }, [inView, reduceMotion]);

  useEffect(() => {
    if (reduceMotion) {
      setPhaseState(COMPLETE_PHASE);
      setQuestionLength(questionCharacters.length);
      setAnswerLength(answerPlan.characters.length);
      setSaveDrawerOpen(false);
      setSavePublished(true);
      setSaveToastVisible(true);
      setSaveStep("published");
      return undefined;
    }
    if (!playbackReady) {
      setPhaseState("idle");
      setQuestionLength(0);
      setAnswerLength(0);
      setPointerPath(null);
      setPointerSettled(false);
      setSaveDrawerOpen(false);
      setSavePublished(false);
      setSaveToastVisible(false);
      setSaveStep("bookmark");
      pointerAnchorRef.current = null;
      return undefined;
    }
    let cancelled = false;
    const timers = new Set();
    const wait = (milliseconds) => new Promise((resolve) => {
      const timer = window.setTimeout(() => { timers.delete(timer); resolve(); }, milliseconds);
      timers.add(timer);
    });
    const typeCharacters = (characters, setter, cadence) => new Promise((resolve) => {
      let index = 0;
      const startedAt = performance.now();
      const tick = (now) => {
        if (cancelled) {
          resolve(false);
          return;
        }
        const nextIndex = Math.min(characters.length, Math.max(1, Math.floor((now - startedAt) / cadence)));
        if (nextIndex > index) {
          index = nextIndex;
          setter(index);
        }
        if (index >= characters.length) {
          resolve(true);
          return;
        }
        window.requestAnimationFrame(tick);
      };
      window.requestAnimationFrame(tick);
    });
    const play = async () => {
        setPhaseState("idle"); setQuestionLength(0); setAnswerLength(0); setPointerPath(null); setPointerSettled(false); setSaveDrawerOpen(false); setSavePublished(false); setSaveToastVisible(false); setSaveStep("bookmark"); pointerAnchorRef.current = null;
        await wait(HERO_DEMO_STAGE_DURATIONS.idle);
        if (cancelled) return;
        setPhaseState("typing-question");
        if (!(await typeCharacters(questionCharacters, setQuestionLength, 23))) return;
        setPhaseState("sending"); await wait(HERO_DEMO_STAGE_DURATIONS.sending);
        if (cancelled) return;
        setPhaseState("retrieving"); await wait(HERO_DEMO_STAGE_DURATIONS.retrieving);
        if (cancelled) return;
        setPhaseState("cross-checking"); await wait(HERO_DEMO_STAGE_DURATIONS["cross-checking"]);
        if (cancelled) return;
        setPhaseState("drafting"); await wait(HERO_DEMO_STAGE_DURATIONS.drafting);
        if (cancelled) return;
        setPhaseState("tracing"); await wait(HERO_DEMO_STAGE_DURATIONS.tracing);
        if (cancelled) return;
        setPhaseState("answering");
        if (!(await typeCharacters(answerPlan.characters, setAnswerLength, 8))) return;
        setPhaseState("saving");
        await new Promise((resolve) => { saveCompletionRef.current = resolve; });
        if (cancelled) return;
        setPhaseState(COMPLETE_PHASE);
    };
    play();
    return () => {
      cancelled = true;
      timers.forEach((timer) => window.clearTimeout(timer));
      timers.clear();
      if (savePressTimerRef.current) {
        window.clearTimeout(savePressTimerRef.current);
        savePressTimerRef.current = null;
      }
      if (saveCompletionRef.current) {
        const finishPendingSave = saveCompletionRef.current;
        saveCompletionRef.current = null;
        finishPendingSave();
      }
    };
  }, [answerPlan.characters, copy, playbackReady, questionCharacters, reduceMotion]);

  // The native flow is two-step: bookmark opens the editor, then the bottom
  // commit action stores the entry. The inert showcase mirrors both pointer
  // clicks with a second measured target inside the mounted drawer.
  useEffect(() => {
    // A new drawer target is measured asynchronously after the drawer has
    // mounted.  Wait until that fresh path has actually started before
    // arming the commit timer; otherwise the previous bookmark path can leave
    // `pointerSettled` true for one render and publish before the cursor gets
    // a chance to visibly travel across the drawer.
    if (reduceMotion || phase !== "saving" || !pointerSettled || !pointerPath || !pointerTravelStarted) return undefined;
    // Keep the native button visibly pressed for a short, human-observable
    // interval before advancing the two-step flow. This mirrors the product
    // click feedback while preserving the inert, scripted showcase.
    if (savePressTimerRef.current) window.clearTimeout(savePressTimerRef.current);
    // Keep the first bookmark press visible long enough for the native drawer
    // to mount and for the pointer assertion/hover state to settle.  A short
    // 240 ms hold could advance to the second hop before a busy compositor
    // painted the measured bookmark target, making the cursor appear to miss.
    const holdAfterTravel = saveStep === "publish" ? 680 : 720;
    savePressTimerRef.current = window.setTimeout(() => {
      savePressTimerRef.current = null;
      if (saveStep === "bookmark") {
        setSaveDrawerOpen(true);
        setSaveStep("publish");
        setPointerSettled(false);
      } else if (saveStep === "publish") {
        setSavePublished(true);
        setSaveStep("published");
        setSaveDrawerOpen(false);
        setSaveToastVisible(true);
        saveCompletionRef.current?.();
        saveCompletionRef.current = null;
      }
    }, holdAfterTravel);
    return () => {
      if (savePressTimerRef.current) {
        window.clearTimeout(savePressTimerRef.current);
        savePressTimerRef.current = null;
      }
    };
  }, [phase, pointerPath, pointerSettled, pointerTravelStarted, reduceMotion, saveStep]);

  const answerVisible = ["answering", "saving", COMPLETE_PHASE].includes(phase);

  useLayoutEffect(() => {
    // The pointer is rendered as an overlay of the native chat body. Measure
    // against that same containing block so left/top are not compounded with
    // the assistant message's own offset or a transformed ancestor.
    const host = containerRef.current?.querySelector(".authoritative-chat-body");
    if (!host || reduceMotion || phase !== "saving") return undefined;

    let active = true;
    const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value));
    let retryTimer = 0;
    let attempts = 0;
    const measure = () => {
      if (!active) return;
      // The final answer scroll otherwise commits in a later animation frame,
      // moving the bookmark after this one-shot path has already been measured.
      if (saveStep === "bookmark" && messagesRef.current) {
        messagesRef.current.scrollTop = messagesRef.current.scrollHeight;
      }
      const hostRect = host.getBoundingClientRect();
      const button = saveStep === "publish"
        ? containerRef.current?.querySelector('[data-hero-save-publish="true"]')
        : saveButtonRef.current;
      if (!button || hostRect.width <= 0 || hostRect.height <= 0) {
        // The answer viewport may commit its scroll position one frame after
        // the saving phase. Retry briefly instead of losing the one-shot
        // pointer forever when the first measurement sees a zero rect.
        if (attempts++ < 24) retryTimer = window.setTimeout(measure, 40);
        return;
      }
      const maxX = Math.max(8, host.clientWidth - 28);
      const maxY = Math.max(8, host.clientHeight - 28);
      const buttonRect = button.getBoundingClientRect();
      if (buttonRect.width <= 0 || buttonRect.height <= 0) {
        if (attempts++ < 24) retryTimer = window.setTimeout(measure, 40);
        return;
      }
      // CursorClick's visual hotspot is ~3px from its top-left. Aim that
      // hotspot at the actual centre of the native save action. There is
      // deliberately no ResizeObserver or per-frame tracker, so the path
      // remains stable.
      // The button's offset parent is the drawer; the drawer's is the host.
      // Keep these coordinates local: viewport rects already include the
      // outer Hero's perspective and the drawer's slide transform.
      const drawer = button.closest("[data-hero-save-drawer]");
      const buttonLeft = drawer ? drawer.offsetLeft + drawer.clientLeft + button.offsetLeft : buttonRect.left - hostRect.left;
      const buttonTop = drawer ? drawer.offsetTop + drawer.clientTop + button.offsetTop : buttonRect.top - hostRect.top;
      const target = {
        x: clamp(buttonLeft + (drawer ? button.offsetWidth : buttonRect.width) * 0.5 - 3, 8, maxX),
        y: clamp(buttonTop + (drawer ? button.offsetHeight : buttonRect.height) * 0.5 - 3, 8, maxY),
      };
      const previous = saveStep === "publish" && pointerAnchorRef.current
        ? pointerAnchorRef.current
        : null;
      const start = previous ?? {
        x: clamp(target.x + Math.min(120, hostRect.width * 0.18), 8, maxX),
        y: clamp(target.y - Math.min(64, hostRect.height * 0.12), 8, maxY),
      };
      pointerAnchorRef.current = target;
      setPointerSettled(false);
      setPointerTravelStarted(false);
      setPointerPath({ start, target, step: saveStep });
    };

    // The first bookmark action is already in the committed answer DOM, so
    // measure it exactly once. Measuring again two frames later reset an
    // in-flight transition and intermittently left the pointer at its start
    // under whole-page animation load. The publish action lives inside the
    // native right drawer, whose slide-in transform otherwise reports an
    // off-screen getBoundingClientRect; wait for it to settle before the
    // second cursor hop.
    const settleDelay = saveStep === "publish" ? 520 : 0;
    if (settleDelay > 0) {
      retryTimer = window.setTimeout(measure, settleDelay);
    } else {
      measure();
    }

    return () => {
      active = false;
      if (retryTimer) window.clearTimeout(retryTimer);
    };
  }, [phase, reduceMotion, saveStep, saveDrawerOpen]);

  useEffect(() => {
    if (reduceMotion || phase !== "saving" || !pointerPath) return undefined;
    let secondFrame = 0;
    const firstFrame = window.requestAnimationFrame(() => {
      const pointer = pointerRef.current;
      if (!pointer) return;
      // Commit the authored start point before changing coordinates. Writing
      // the destination directly keeps the guided cursor deterministic even
      // while the outer Hero perspective spring is still producing frames;
      // React state only records the already-started travel for subsequent
      // renders.
      pointer.style.transition = "none";
      pointer.style.left = `${pointerPath.start.x}px`;
      pointer.style.top = `${pointerPath.start.y}px`;
      void pointer.getBoundingClientRect();
      secondFrame = window.requestAnimationFrame(() => {
        const duration = saveStep === "publish" ? 760 : 620;
        pointer.style.transition = `left ${duration}ms cubic-bezier(.16,1,.3,1), top ${duration}ms cubic-bezier(.16,1,.3,1)`;
        pointer.style.left = `${pointerPath.target.x}px`;
        pointer.style.top = `${pointerPath.target.y}px`;
        setPointerTravelStarted(true);
      });
    });
    return () => {
      window.cancelAnimationFrame(firstFrame);
      if (secondFrame) window.cancelAnimationFrame(secondFrame);
    };
  }, [phase, pointerPath, reduceMotion, saveStep]);

  useEffect(() => {
    if (reduceMotion || phase !== "saving" || pointerPath?.step !== saveStep || !pointerTravelStarted) return undefined;
    let frame = 0;
    const confirmArrival = () => {
      const pointer = pointerRef.current;
      const style = pointer ? getComputedStyle(pointer) : null;
      const drawer = containerRef.current?.querySelector('[data-hero-save-drawer="true"]');
      const drawerTransform = drawer ? new DOMMatrixReadOnly(getComputedStyle(drawer).transform) : null;
      const drawerSettled = saveStep !== "publish" || (drawerTransform && Math.abs(drawerTransform.m41) < 0.5);
      if (drawerSettled && style && Math.abs(Number.parseFloat(style.left) - pointerPath.target.x) < 0.5 &&
        Math.abs(Number.parseFloat(style.top) - pointerPath.target.y) < 0.5) {
        setPointerSettled(true);
      } else {
        frame = window.requestAnimationFrame(confirmArrival);
      }
    };
    // Preserve the nominal hold, but a busy compositor must actually reach
    // the fixed target and the drawer must finish sliding before the click.
    const timer = window.setTimeout(() => {
      frame = window.requestAnimationFrame(confirmArrival);
    }, saveStep === "publish" ? 1_240 : 900);
    return () => {
      window.clearTimeout(timer);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [phase, pointerPath, pointerTravelStarted, reduceMotion, saveStep]);

  const hasSubmitted = HERO_DEMO_PHASES.indexOf(phase) >= HERO_DEMO_PHASES.indexOf("sending");
  const hasAnswer = answerVisible;
  const isComplete = phase === COMPLETE_PHASE;
  const isSaving = phase === "saving";
  const pointerPosition = pointerPath?.target;
  const pointerVisible = Boolean(pointerPath && !reduceMotion && isSaving);
  const pointerPressing = isSaving && pointerSettled && pointerPath?.step === saveStep;

  useEffect(() => {
    if (!hasAnswer) return undefined;
    const frame = window.requestAnimationFrame(() => {
      const viewport = messagesRef.current;
      if (viewport) viewport.scrollTop = viewport.scrollHeight;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [answerLength, hasAnswer]);

  const renderAnswerSection = (section) => {
    const heading = visibleSegment(section.heading, answerLength);
    const body = visibleSegment(section.bodySegment, answerLength);
    const hasContent = segmentStarted(section.heading, answerLength) || segmentStarted(section.bodySegment, answerLength) || section.itemSegments.some(({ segment }) => segmentStarted(segment, answerLength)) || Boolean(section.tableSegments?.headers.some((segment) => segmentStarted(segment, answerLength)));
    if (!hasContent) return null;
    return (
      <section className={`hero-demo-answer-section hero-demo-answer-section-${section.id}`} data-answer-section={section.id} key={section.id}>
        {heading ? <h4>{heading}{phase === "answering" && !segmentComplete(section.heading, answerLength) ? <span className="hero-demo-caret" /> : null}</h4> : null}
        {body ? <p>{body}{phase === "answering" && !segmentComplete(section.bodySegment, answerLength) ? <span className="hero-demo-caret" /> : null}</p> : null}
        {section.itemSegments.length ? (
          <ul>
            {section.itemSegments.map(({ sourceId, segment }, index) => {
              const itemText = visibleSegment(segment, answerLength);
              if (!itemText) return null;
              const citationIndex = copy.sourceIds.indexOf(sourceId);
              const citation = citationIndex >= 0 ? copy.citations[citationIndex] : null;
              return <li key={`${section.id}-${index}`}>{itemText}{citation ? <InlineCitation sourceId={sourceId} label={citation} /> : null}{phase === "answering" && !segmentComplete(segment, answerLength) ? <span className="hero-demo-caret" /> : null}</li>;
            })}
          </ul>
        ) : null}
        {section.tableSegments ? (
          <div className="hero-demo-table-wrap chat-markdown-table">
            <table className="hero-demo-answer-table">
              <thead><tr>{section.tableSegments.headers.map((segment, index) => <th key={`header-${index}`}>{visibleSegment(segment, answerLength)}</th>)}</tr></thead>
              <tbody>{section.tableSegments.rows.map((row, rowIndex) => {
                if (!row.some((segment) => segmentStarted(segment, answerLength))) return null;
                return <tr key={`row-${rowIndex}`}>{row.map((segment, cellIndex) => <td key={`cell-${rowIndex}-${cellIndex}`}>{visibleSegment(segment, answerLength)}{phase === "answering" && !segmentComplete(segment, answerLength) ? <span className="hero-demo-caret" /> : null}</td>)}</tr>;
              })}</tbody>
            </table>
          </div>
        ) : null}
      </section>
    );
  };

  const typedQuestion = questionCharacters.slice(0, questionLength).join("");
  const retrievalPhase = HERO_PIPELINE_PHASES.includes(phase);
  const messages = (
    <>
      {hasSubmitted ? (
        <motion.article className="visual-chat-message-row is-user" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}>
          <article className="visual-user-message">
            <div className="visual-user-message__bubble hero-demo-question">{copy.question}</div>
          </article>
        </motion.article>
      ) : null}
      {hasSubmitted ? (
        <article className="visual-chat-message-row is-assistant">
          <article className="visual-assistant-message hero-demo-thread" ref={threadRef}>
            <motion.div className="visual-assistant-message__context hero-demo-retrieval" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}><div className="visual-assistant-pipeline"><HeroPipeline answerStarted={answerLength > 0} copy={copy} phase={phase} /></div></motion.div>
            {hasAnswer ? (
              <motion.section className="visual-assistant-answer hero-demo-answer" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}>
                <div className="visual-assistant-answer__content">
                  <div className="visual-assistant-markdown">
                    {answerPlan.sections.map(renderAnswerSection)}
                  </div>
                </div>
                {isSaving || isComplete ? <motion.div className="visual-assistant-toolbar hero-demo-answer-actions" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.2 }} aria-label={isChineseStory(locale) ? "回答操作" : "Answer actions"}>
                  <button type="button" className="visual-assistant-toolbar__button" data-hero-copy-action="true" aria-label={isChineseStory(locale) ? "复制回答" : "Copy answer"}><Copy size={16} /></button>
                  <button type="button" className="visual-assistant-toolbar__button" data-hero-save-action="true" data-hero-bookmark-action="true" ref={saveButtonRef} aria-label={copy.saveLabel}><BookmarkSimple size={16} /></button>
                  <button type="button" className="visual-assistant-toolbar__button is-muted" data-hero-info-action="true" aria-label={isChineseStory(locale) ? "回答信息" : "Answer info"}><Info size={16} /></button>
                </motion.div> : null}
              </motion.section>
            ) : null}
          </article>
        </article>
      ) : null}
    </>
  );

  const pointerElement = pointerVisible && pointerPosition ? (
    <span
      key={`${saveStep}-${pointerPosition.x}-${pointerPosition.y}`}
      className={`hero-demo-auto-pointer${pointerPressing ? " is-clicking" : ""}`}
      data-hero-auto-pointer="saving"
      data-hero-pointer-target={`${pointerPosition.x},${pointerPosition.y}`}
      ref={pointerRef}
      style={{
        left: `${pointerTravelStarted ? pointerPosition.x : pointerPath.start.x}px`,
        top: `${pointerTravelStarted ? pointerPosition.y : pointerPath.start.y}px`,
        transition: pointerTravelStarted
          ? `left ${saveStep === "publish" ? 760 : 620}ms cubic-bezier(.16,1,.3,1), top ${saveStep === "publish" ? 760 : 620}ms cubic-bezier(.16,1,.3,1)`
          : "none",
      }}
    >
      <CursorClick size={22} weight="fill" /><i aria-hidden="true" />
    </span>
  ) : null;

  return (
    <AuthoritativeChatSurface
      className="hero-product-demo"
      shellRef={containerRef}
      title={copy.conversation}
      data-story="research-ledger"
      data-demo-phase={phase}
      data-hero-save-step={saveStep}
      data-demo-interactive="false"
      inert
      newChat={phase === "idle" || phase === "typing-question"}
      newChatTitle={isChineseStory(locale) ? "Hi，我是 Musuw" : "Hi, I’m Musuw"}
      messagesRef={messagesRef}
      overlay={(
        <>
          {saveDrawerOpen ? <HeroSaveDrawer copy={copy} locale={locale} saved={savePublished} /> : null}
          {saveToastVisible ? <div className="hero-demo-save-toast t-message t-is-success" data-hero-save-success="true" role="status"><Check size={20} weight="fill" aria-hidden="true" /><span>{isChineseStory(locale) ? "知识已发布并开始索引" : "Knowledge published and indexing started"}</span></div> : null}
          {pointerElement}
        </>
      )}
      messages={messages}
      composer={(
        <AuthoritativeChatComposer
          className={`hero-demo-composer ${phase === "sending" ? "is-sending" : ""} ${hasSubmitted ? "has-submitted" : ""}`}
          effort={copy.effort}
          isReplying={phase === "sending" || retrievalPhase || phase === "answering" || isSaving}
          model={copy.model}
          placeholder={copy.placeholder}
          query={hasSubmitted ? "" : typedQuestion}
        />
      )}
    />
  );
}
