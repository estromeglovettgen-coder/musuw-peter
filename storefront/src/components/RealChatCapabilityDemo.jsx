import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useInView, useReducedMotion } from "motion/react";
import { BookmarkSimple } from "@phosphor-icons/react/BookmarkSimple";
import { CaretDown } from "@phosphor-icons/react/CaretDown";
import { Check } from "@phosphor-icons/react/Check";
import { Copy } from "@phosphor-icons/react/Copy";
import { LinkSimple } from "@phosphor-icons/react/LinkSimple";
import { AuthoritativeChatComposer, AuthoritativeChatSurface } from "./AuthoritativeChatSurface";
import { REASONING_STORY, isChineseStory } from "../data/knowledgeStories";
import "../real-chat-demo.css";

const PHASES = Object.freeze([
  "idle", "typing", "sent", "searching", "scoping", "comparing", "drafting", "validating", "answering", "complete",
]);
export const REAL_CHAT_PHASES = PHASES;
const QUERY_TYPING_MS = 39;
const ANSWER_TYPING_MS = 9;
const phaseRank = (phase) => PHASES.indexOf(phase);

function buildTimeline(phase, copy) {
  const rank = phaseRank(phase);
  // The production chat keeps the pre-pipeline wait row separate from the
  // first retrieval event.  A step only enters the timeline when retrieval
  // has actually started, then each subsequent event turns the previous row
  // into a completed row before revealing the next one.
  if (rank <= phaseRank("sent")) return [];
  const firstActiveStage = rank - phaseRank("searching");
  const visibleCount = Math.min(copy.steps.length, Math.max(1, firstActiveStage + 1));
  return copy.steps.slice(0, visibleCount).map((step, index) => ({
    ...step,
    pending: rank < phaseRank("complete") && index === firstActiveStage,
    done: rank >= phaseRank("complete") || index < firstActiveStage,
  }));
}

function Pipeline({ answerStarted, copy, phase }) {
  const rank = phaseRank(phase);
  const timeline = buildTimeline(phase, copy);
  if (rank < phaseRank("sent")) return null;
  const showPrePipelineWait = phase === "sent";
  const showModelWait = rank >= phaseRank("answering") && !answerStarted;
  const showCollapsedRoot = answerStarted || phase === "complete";

  return (
    <section className="real-chat-pipeline visual-rag-pipeline">
      <div className="visual-rag-pipeline__sr" role="status" aria-live="polite">
        {showPrePipelineWait ? copy.preparation : showModelWait ? (copy.modelPreparation || copy.preparation) : copy.pipelineStatus}
      </div>
      {showCollapsedRoot ? (
        <button
          className="visual-rag-pipeline__summary"
          type="button"
          data-rag-pipeline-summary="complete"
          aria-expanded="false"
          aria-label={copy.pipelineStatus}
          disabled
        >
          <span>{copy.pipelineStatus}</span>
          <span className="visual-rag-pipeline__reference-summary">{copy.pipelineSummary}</span>
          <CaretDown size={14} aria-hidden="true" />
        </button>
      ) : (
        <div className="visual-rag-timeline">
          {showPrePipelineWait ? (
            <div className="visual-rag-step is-running">
              <span className="visual-rag-step__rail" aria-hidden="true"><span className="visual-rag-step__spinner" /></span>
              <span className="visual-rag-step__body"><strong>{copy.preparation}</strong></span>
            </div>
          ) : null}
          {timeline.map((step) => (
            <button
              key={step.title}
              className={`visual-rag-step${step.pending ? " is-running" : " is-done"}`}
              type="button"
              disabled
              aria-label={step.title}
            >
              <span className="visual-rag-step__rail" aria-hidden="true">
                {step.pending ? <span className="visual-rag-step__spinner" /> : <Check size={14} weight="bold" />}
              </span>
              <span className="visual-rag-step__body">
                <strong>{step.title}</strong>
                {step.done ? <span className="visual-rag-step__summary">{step.summary}</span> : null}
              </span>
            </button>
          ))}
          {showModelWait ? (
            <div className="visual-rag-step is-running">
              <span className="visual-rag-step__rail" aria-hidden="true"><span className="visual-rag-step__spinner" /></span>
              <span className="visual-rag-step__body"><strong>{copy.modelPreparation || copy.preparation}</strong></span>
            </div>
          ) : null}
        </div>
      )}
    </section>
  );
}

function StructuredAnswer({ answer, complete, sections }) {
  const visibleSections = answer.split("\n\n").filter(Boolean);
  const definitions = sections ?? [];

  return (
    <div className="visual-assistant-markdown">
      {visibleSections.map((block, sectionIndex) => {
        const [title, ...rawLines] = block.split("\n");
        const definition = definitions[sectionIndex];
        // serializeAnswerSections writes a section body before its list. Keep
        // that body as a paragraph so the fixture follows the markdown DOM
        // produced by botmsg instead of flattening it into the first bullet.
        const lines = rawLines.slice();
        const bodyLine = definition?.body && lines.length > 0 ? lines.shift() : null;
        const isLastSection = sectionIndex === visibleSections.length - 1;
        const showCaretAfterTitle = !complete && isLastSection && lines.length === 0;
        const List = definition?.ordered ? "ol" : "ul";

        return (
          <section
            className="real-chat-answer-section"
            data-answer-section={definition?.id ?? `section-${sectionIndex + 1}`}
            key={definition?.id ?? `${title}-${sectionIndex}`}
          >
            <h4>{title}{showCaretAfterTitle ? <span className="real-chat-answer__caret" aria-hidden="true" /> : null}</h4>
            {bodyLine ? <p>{bodyLine}{!complete && isLastSection && lines.length === 0 ? <span className="real-chat-answer__caret" aria-hidden="true" /> : null}</p> : null}
            {definition?.items ? (
              <List>
                {lines.map((line, lineIndex) => {
                  const visibleLine = line.replace(/^(?:•|\d+\.)\s*/, "");
                  const showCaret = !complete && isLastSection && lineIndex === lines.length - 1;
                  return (
                    <li
                      data-answer-source-ref={definition.items[lineIndex]?.sourceId}
                      key={`${definition.id}-${lineIndex}`}
                    >
                      {visibleLine}{showCaret ? <span className="real-chat-answer__caret" aria-hidden="true" /> : null}
                    </li>
                  );
                })}
              </List>
            ) : lines.length > 0 ? (
              <p>{lines.join("\n")}{!complete && isLastSection ? <span className="real-chat-answer__caret" aria-hidden="true" /> : null}</p>
            ) : null}
          </section>
        );
      })}
    </div>
  );
}

function AssistantMessage({ copy, locale, phase, answer }) {
  if (phaseRank(phase) < phaseRank("sent")) return null;
  const answerStarted = answer.length > 0;
  const answered = phaseRank(phase) >= phaseRank("answering");
  const complete = phase === "complete";
  const labels = isChineseStory(locale) ? ["用户访谈", "客服反馈", "使用漏斗"] : ["Interviews", "Support", "Usage funnel"];
  return (
    <article className="visual-assistant-message real-chat-assistant">
      <div className="visual-assistant-message__context"><div className="visual-assistant-pipeline"><Pipeline answerStarted={answerStarted} copy={copy} phase={phase} /></div></div>
      {answered && (
        <section className="real-chat-answer visual-assistant-answer">
          <div className="visual-assistant-answer__content">
            <StructuredAnswer answer={answer} complete={complete} sections={copy.answerSections} />
          </div>
          {complete && (
            <>
              <div className="real-chat-citations">
                {copy.sourceIds.map((id, index) => <span key={id} className="real-chat-citation citation demo-citation-button" data-demo-source-ref={id}><LinkSimple size={13} />{labels[index]}</span>)}
              </div>
              <div className="visual-assistant-toolbar" role="toolbar" aria-label={copy.finish}>
                <button type="button" className="visual-assistant-toolbar__button" aria-label={copy.copy} disabled><Copy size={14} /></button>
                <button type="button" className="visual-assistant-toolbar__button" title={copy.save} aria-label={copy.save} disabled><BookmarkSimple size={14} /></button>
              </div>
            </>
          )}
        </section>
      )}
    </article>
  );
}

// The public fixture follows the native composer -> pipeline -> answer contract.
// The read-only composer does not pretend to answer arbitrary visitor questions.
export function ReasoningCapabilityDemo({ locale = "en" }) {
  const copy = useMemo(() => isChineseStory(locale) ? REASONING_STORY.zh : REASONING_STORY.en, [locale]);
  const rootRef = useRef(null);
  const messagesRef = useRef(null);
  const inView = useInView(rootRef, { amount: 0.5 });
  const reducedMotion = useReducedMotion();
  const timerRefs = useRef(new Set());
  const runRef = useRef(0);
  const [phase, setPhase] = useState("idle");
  const [query, setQuery] = useState("");
  const [answer, setAnswer] = useState("");

  const clearTimers = useCallback(() => {
    timerRefs.current.forEach((timer) => { clearTimeout(timer); clearInterval(timer); });
    timerRefs.current.clear();
  }, []);
  // Keep the fixture pinned to the same live edge as the native chat view.
  // The production `scrollToBottom` helper writes scrollTop after nextTick;
  // this equivalent is intentionally direct because the marketing fixture is
  // inert and must already be at the live edge when its complete state paints.
  const scrollToBottom = useCallback(() => {
    const viewport = messagesRef.current;
    if (viewport) viewport.scrollTop = viewport.scrollHeight;
  }, []);
  const schedule = useCallback((callback, delay) => {
    const timer = setTimeout(() => { timerRefs.current.delete(timer); callback(); }, delay);
    timerRefs.current.add(timer);
    return timer;
  }, []);
  const reset = useCallback(({ scroll = true } = {}) => {
    setPhase("idle"); setQuery(""); setAnswer("");
    if (scroll && messagesRef.current) messagesRef.current.scrollTop = 0;
  }, []);
  const runTurn = useCallback(() => {
    clearTimers();
    const runId = ++runRef.current;
    if (reducedMotion) {
      // Reduced-motion is a static, already-complete turn. Do not reset the
      // viewport to zero when `inView` changes as the page is scrolled; that
      // would leave the long answer above the fold while the composer remains
      // pinned below it. The native chat follows content to the live edge.
      reset({ scroll: false });
      setPhase("complete"); setAnswer(copy.answer);
      return;
    }
    reset();
    const later = (callback, delay) => schedule(() => { if (runId === runRef.current) callback(); }, delay);
    const send = () => {
      setQuery(""); setPhase("sent");
      later(() => setPhase("searching"), 560);
      later(() => setPhase("scoping"), 1240);
      later(() => setPhase("comparing"), 1940);
      later(() => setPhase("drafting"), 2660);
      later(() => setPhase("validating"), 3380);
      later(() => {
        setPhase("answering");
        const characters = Array.from(copy.answer);
        let index = 0;
        const ticker = setInterval(() => {
          if (runId !== runRef.current) { clearInterval(ticker); return; }
          index += 1; setAnswer(characters.slice(0, index).join(""));
          if (index >= characters.length) {
          clearInterval(ticker); timerRefs.current.delete(ticker);
          later(() => setPhase("complete"), 240);
        }
        }, ANSWER_TYPING_MS);
        timerRefs.current.add(ticker);
      }, 4200);
    };
    later(() => {
      setPhase("typing");
      const characters = Array.from(copy.question);
      let index = 0;
      const ticker = setInterval(() => {
        if (runId !== runRef.current) { clearInterval(ticker); return; }
        index += 1; setQuery(characters.slice(0, index).join(""));
        if (index >= characters.length) {
          clearInterval(ticker); timerRefs.current.delete(ticker);
          later(send, 220);
        }
      }, QUERY_TYPING_MS);
      timerRefs.current.add(ticker);
    }, 520);
  }, [clearTimers, copy, reducedMotion, reset, schedule]);

  useEffect(() => {
    if (inView || reducedMotion) runTurn();
    else { ++runRef.current; clearTimers(); reset(); }
    return () => { ++runRef.current; clearTimers(); };
  }, [clearTimers, inView, reducedMotion, reset, runTurn]);

  // Layout effect mirrors the native chat's nextTick scroll and runs before
  // Playwright (or a user) can observe the completed message. The extra RAFs
  // cover delayed line wrapping/font layout without introducing visible
  // motion (reduced motion forces scroll-behavior:auto globally).
  useLayoutEffect(() => {
    if (phaseRank(phase) < phaseRank("answering")) return undefined;
    scrollToBottom();
    const firstFrame = window.requestAnimationFrame(() => {
      scrollToBottom();
      window.requestAnimationFrame(scrollToBottom);
    });
    return () => window.cancelAnimationFrame(firstFrame);
  }, [answer, inView, phase, reducedMotion, scrollToBottom]);

  // Rich markdown can grow after React commits (for example when a font or
  // image finishes layout). Follow those delayed height changes just as
  // `useStickyBottomOnResize` does in the production chat view.
  useEffect(() => {
    if (phaseRank(phase) < phaseRank("answering")) return undefined;
    const viewport = messagesRef.current;
    const messageList = viewport?.firstElementChild;
    if (!viewport || !messageList || typeof ResizeObserver === "undefined") return undefined;
    let frame = null;
    const observer = new ResizeObserver(() => {
      if (frame !== null) return;
      frame = window.requestAnimationFrame(() => {
        frame = null;
        scrollToBottom();
      });
    });
    observer.observe(messageList);
    return () => {
      observer.disconnect();
      if (frame !== null) window.cancelAnimationFrame(frame);
    };
  }, [phase, scrollToBottom]);

  const isReplying = phaseRank(phase) >= phaseRank("sent") && phase !== "complete";
  const showUserMessage = phaseRank(phase) >= phaseRank("sent");
  const showAssistantMessage = showUserMessage;

  return (
    <AuthoritativeChatSurface
      className="capability-demo capability-demo-reasoning real-chat-demo"
      data-capability-demo="reasoning"
      data-chat-phase={phase}
      data-demo-interactive="false"
      inert
      messagesRef={messagesRef}
      shellRef={rootRef}
      title={copy.title}
      welcome={phase === "idle" || phase === "typing" ? (isChineseStory(locale) ? "Hi，我是 Musuw" : "Hi, I’m Musuw") : null}
      messages={(
        <>
          {showUserMessage && <article className="visual-chat-message-row is-user"><article className="visual-user-message real-chat-user-message"><div className="visual-user-message__bubble">{copy.question}</div></article></article>}
          {showAssistantMessage && <article className="visual-chat-message-row is-assistant"><AssistantMessage copy={copy} locale={locale} phase={phase} answer={answer} /></article>}
        </>
      )}
      composer={(
        <AuthoritativeChatComposer
          className="real-chat-composer"
          effort={copy.effort}
          isReplying={isReplying}
          model={copy.model}
          placeholder={copy.placeholder}
          query={query}
          sendLabel={copy.send}
          stopLabel={copy.stop}
        />
      )}
    />
  );
}
export default ReasoningCapabilityDemo;
