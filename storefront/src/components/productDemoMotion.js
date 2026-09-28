import { useEffect, useRef, useState } from "react";
import { useInView, useReducedMotion } from "motion/react";

export const PRODUCT_DEMO_VIEWPORT_AMOUNT = 0.5;
export const CAPABILITY_DEMO_PHASES = Object.freeze(["capture", "reason", "connect", "complete"]);
export const CAPABILITY_DEMO_STAGE_DURATION = 1_500;
export function nextCapabilityDemoPhase(phase) {
  const index = CAPABILITY_DEMO_PHASES.indexOf(phase);
  if (index < 0) return CAPABILITY_DEMO_PHASES[0];
  return CAPABILITY_DEMO_PHASES[Math.min(index + 1, CAPABILITY_DEMO_PHASES.length - 1)];
}
export function resolveCapabilityDemoPhase(phase, reducedMotion) { return reducedMotion ? "complete" : phase; }
export function useCapabilityDemoPhase() {
  const ref = useRef(null);
  const inView = useInView(ref, { amount: PRODUCT_DEMO_VIEWPORT_AMOUNT });
  const reducedMotion = useReducedMotion();
  const [phase, setPhase] = useState(CAPABILITY_DEMO_PHASES[0]);
  useEffect(() => {
    if (reducedMotion) { setPhase("complete"); return undefined; }
    if (!inView) { setPhase("capture"); return undefined; }
    if (phase === "complete") return undefined;
    const timer = window.setTimeout(() => setPhase((current) => nextCapabilityDemoPhase(current)), CAPABILITY_DEMO_STAGE_DURATION);
    return () => window.clearTimeout(timer);
  }, [inView, phase, reducedMotion]);
  return { ref, phase: resolveCapabilityDemoPhase(phase, reducedMotion) };
}

// The hero's question-ledger walkthrough follows the same compact cadence as
// a real assistant turn: compose, retrieve, cross-check, draft, trace, answer,
// then explicitly save the result. The public phase contract keeps the
// animation deterministic while the component owns the character ticker.
export const HERO_DEMO_PHASES = Object.freeze([
  "idle",
  "typing-question",
  "sending",
  "retrieving",
  "cross-checking",
  "drafting",
  "tracing",
  "answering",
  "saving",
  "complete",
]);
export const HERO_DEMO_STAGE_DURATIONS = Object.freeze({
  idle: 420,
  "typing-question": 0,
  sending: 260,
  retrieving: 740,
  "cross-checking": 860,
  drafting: 760,
  tracing: 700,
  answering: 0,
  // Leave enough time for the guided cursor to travel, settle, press, and let
  // the saved state register visibly even on a busy first render.
  saving: 2_400,
});

export function nextHeroDemoPhase(phase) {
  const index = HERO_DEMO_PHASES.indexOf(phase);
  if (index < 0) return HERO_DEMO_PHASES[0];
  return HERO_DEMO_PHASES[Math.min(index + 1, HERO_DEMO_PHASES.length - 1)];
}

export function resolveHeroDemoPhase(phase, reducedMotion) {
  return reducedMotion ? "complete" : phase;
}

// Keep the product view at its real scale. The guided cursor follows the same
// two-hop path a user would take in the product: start on the Index, follow
// its first blue link, then follow the inline reference on that page. The
// destination is terminal rather than looping; the sidebar remains visible
// but is never part of the guided interaction.
export const WIKI_DEMO_STAGES = Object.freeze([
  "page",
  "moving-to-index-link",
  "pressing-index-link",
  "section-page",
  "moving-to-inline-link",
  "pressing-inline-link",
  "linked-page",
]);
export const WIKI_STAGE_DURATIONS = Object.freeze({
  page: 820,
  "moving-to-index-link": 1_180,
  "pressing-index-link": 360,
  "section-page": 940,
  "moving-to-inline-link": 1_180,
  "pressing-inline-link": 360,
});

export function nextWikiDemoStage(stage) {
  const index = WIKI_DEMO_STAGES.indexOf(stage);
  if (index < 0) return WIKI_DEMO_STAGES[0];
  return WIKI_DEMO_STAGES[Math.min(index + 1, WIKI_DEMO_STAGES.length - 1)];
}

export function resolveWikiDemoStage(stage, reducedMotion) {
  // A reduced-motion browser still opens on the real product's Index. It
  // simply suppresses the guided cursor/navigation rather than teleporting a
  // visitor to the terminal document.
  return reducedMotion ? "page" : stage;
}

export function useWikiDemoFlow() {
  const ref = useRef(null);
  const inView = useInView(ref, { amount: PRODUCT_DEMO_VIEWPORT_AMOUNT });
  const reducedMotion = useReducedMotion();
  const [stage, setStage] = useState("page");

  useEffect(() => {
    if (reducedMotion) {
      setStage("linked-page");
      return undefined;
    }
    if (!inView) {
      setStage("page");
      return undefined;
    }
    const duration = WIKI_STAGE_DURATIONS[stage];
    if (!Number.isFinite(duration)) return undefined;
    let firstFrame = 0;
    let secondFrame = 0;
    const timer = window.setTimeout(() => {
      // Let the current scene commit one stable frame before publishing the
      // next stage. This keeps the cursor's own two-frame ready gate from
      // racing a cold layout/scroll commit on the first Wiki hop.
      firstFrame = window.requestAnimationFrame(() => {
        secondFrame = window.requestAnimationFrame(() => {
          setStage((current) => nextWikiDemoStage(current));
        });
      });
    }, duration);
    return () => {
      window.clearTimeout(timer);
      if (firstFrame) window.cancelAnimationFrame(firstFrame);
      if (secondFrame) window.cancelAnimationFrame(secondFrame);
    };
  }, [inView, reducedMotion, stage]);

  return { ref, stage: resolveWikiDemoStage(stage, reducedMotion), reducedMotion, inView };
}
