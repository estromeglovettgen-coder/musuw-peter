import { lazy, memo, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { motion, type Variants } from "motion/react";

import TrueFocus from "./TrueFocus";

const LiquidEther = lazy(() => import("./LiquidEther"));
// Form updates must not recreate the palette and restart the WebGL effect.
const liquidColors = ["#E5E5E5", "#737373", "#262626"];

export type AuthShowcaseState = "idle" | "curious" | "privacy" | "error";

type AuthShowcaseProps = Readonly<{
  eyebrowPhrases: readonly string[];
  headlinePre: string;
  headlineFocus: string;
  subhead: string;
  interactionState?: AuthShowcaseState;
}>;

function Typewriter({
  phrases,
  typingSpeed = 60,
  deletingSpeed = 40,
  pauseDuration = 2_000,
}: Readonly<{
  phrases: readonly string[];
  typingSpeed?: number;
  deletingSpeed?: number;
  pauseDuration?: number;
}>) {
  const [text, setText] = useState("");
  const [phraseIndex, setPhraseIndex] = useState(0);
  const [mode, setMode] = useState<"typing" | "deleting">("typing");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const phrase = phrases[phraseIndex] ?? "";

  useEffect(() => {
    if (mode === "typing") {
      timer.current = setTimeout(() => {
        if (text.length < phrase.length) {
          setText(phrase.slice(0, text.length + 1));
        } else {
          setMode("deleting");
        }
      }, text.length < phrase.length ? typingSpeed : pauseDuration);
    } else {
      timer.current = setTimeout(() => {
        if (text.length > 0) {
          setText(text.slice(0, -1));
        } else {
          setPhraseIndex((index) => (index + 1) % Math.max(phrases.length, 1));
          setMode("typing");
        }
      }, deletingSpeed);
    }

    return () => {
      if (timer.current !== null) clearTimeout(timer.current);
    };
  }, [deletingSpeed, mode, pauseDuration, phrase, phrases.length, text, typingSpeed]);

  return (
    <span>
      {text}
      <span className="auth-showcase-caret" />
    </span>
  );
}

type MousePosition = Readonly<{ x: number; y: number }>;

function useMousePosition(enabled = true): MousePosition {
  const [position, setPosition] = useState<MousePosition>({ x: 0, y: 0 });
  const lastUpdate = useRef(0);
  const frame = useRef<number | null>(null);

  const updatePosition = useCallback(
    (event: MouseEvent) => {
      if (!enabled || performance.now() - lastUpdate.current < 100 || frame.current !== null) return;
      frame.current = requestAnimationFrame(() => {
        lastUpdate.current = performance.now();
        setPosition({ x: event.clientX, y: event.clientY });
        frame.current = null;
      });
    },
    [enabled],
  );

  useEffect(() => {
    if (!enabled) return undefined;
    window.addEventListener("mousemove", updatePosition, { passive: true });
    return () => {
      window.removeEventListener("mousemove", updatePosition);
      if (frame.current !== null) cancelAnimationFrame(frame.current);
    };
  }, [enabled, updatePosition]);

  return position;
}

const rectCache = new WeakMap<Element, { rect: DOMRect; time: number }>();
const RECT_CACHE_MS = 500;

function cachedRect(element: Element): DOMRect {
  const cached = rectCache.get(element);
  const now = performance.now();
  if (cached && now - cached.time < RECT_CACHE_MS) return cached.rect;
  const rect = element.getBoundingClientRect();
  rectCache.set(element, { rect, time: now });
  return rect;
}

function mouseOffset(
  target: React.RefObject<SVGSVGElement | null>,
  mouse: MousePosition,
  maxDistance: number,
  falloff: number,
) {
  if (!target.current) return { dx: 0, dy: 0 };
  const rect = cachedRect(target.current);
  const deltaX = mouse.x - (rect.left + rect.width / 2);
  const deltaY = mouse.y - (rect.top + rect.height / 2);
  const angle = Math.atan2(deltaY, deltaX);
  const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
  const amount = Math.min(distance, maxDistance * falloff) / (maxDistance * falloff);
  return {
    dx: Math.cos(angle) * maxDistance * amount,
    dy: Math.sin(angle) * maxDistance * amount,
  };
}

const spring = { type: "spring" as const, stiffness: 300, damping: 25 };
const stateSpring = { type: "spring" as const, stiffness: 200, damping: 20 };
const curiousSpring = { type: "spring" as const, stiffness: 220, damping: 12 };

const blobVariants: Variants = {
  idle: { scale: [1, 1.03, 1], x: 0, scaleY: 1, y: 0, transition: { scale: { repeat: Infinity, duration: 3, ease: "easeInOut" } } },
  curious: { scale: 1.05, scaleY: 1.15, x: 14, y: -8, transition: curiousSpring },
  privacy: { scale: 1, x: -14, scaleX: 0.95, rotate: -8, transition: stateSpring },
  error: { scale: 1, x: 0, scaleX: 1, transition: stateSpring },
};

const tallVariants: Variants = {
  idle: { rotate: 0, scaleX: 1, scaleY: 1, x: 0, y: 0, transition: stateSpring },
  curious: { rotate: 12, scaleX: 1.05, scaleY: 1.18, x: 18, y: -12, transition: curiousSpring },
  privacy: { rotate: -15, scaleX: 1, scaleY: 1, x: -14, transition: stateSpring },
  error: { rotate: 0, scaleX: 1, scaleY: 1, x: 0, transition: stateSpring },
};

const cardVariants: Variants = {
  idle: { rotate: [0, 3, -3, 0], x: 0, scaleY: 1, y: 0, transition: { rotate: { repeat: Infinity, duration: 4, ease: "easeInOut" } } },
  curious: { rotate: 8, scaleX: 1.05, scaleY: 1.15, x: 12, y: -8, transition: curiousSpring },
  privacy: { y: 0, x: -12, scaleX: 0.96, rotate: -10, transition: stateSpring },
  error: { y: 0, x: 0, scaleX: 1, rotate: 0, transition: stateSpring },
};

const pillVariants: Variants = {
  idle: { rotate: [0, -5, 5, 0], x: 0, scaleY: 1, y: 0, transition: { rotate: { repeat: Infinity, duration: 3.5, ease: "easeInOut" } } },
  curious: { rotate: -10, scaleX: 1.06, scaleY: 1.12, x: 14, y: -8, transition: curiousSpring },
  privacy: { rotate: 12, x: -12, scaleX: 0.95, transition: stateSpring },
  error: { rotate: 0, x: 0, scaleX: 1, transition: stateSpring },
};

const eyeVariants: Variants = {
  idle: { scaleY: 1 },
  curious: { scaleY: 1.2 },
  privacy: { scaleY: 1 },
  error: { scaleY: 0.65 },
};

const tallEyeVariants: Variants = {
  ...eyeVariants,
  curious: { scaleY: 1.25 },
};

const errorShake: Variants = {
  idle: { x: 0 },
  curious: { x: 0 },
  privacy: { x: 0 },
  error: { x: [0, -5, 5, -5, 5, -2, 2, 0], transition: { duration: 0.6, ease: "easeInOut" } },
};

const tallErrorShake: Variants = {
  ...errorShake,
  error: { x: [0, -7, 7, -7, 7, -4, 4, 0], transition: { duration: 0.6, ease: "easeInOut" } },
};

function Expression({ state, curiousY, idlePath, errorPath, privacyX1, privacyX2 }: Readonly<{
  state: AuthShowcaseState;
  curiousY: number;
  idlePath: string;
  errorPath: string;
  privacyX1: number;
  privacyX2: number;
}>) {
  if (state === "error") {
    return <path d={errorPath} fill="none" stroke="white" strokeLinecap="round" strokeWidth="2.5" />;
  }
  if (state === "curious") {
    return <motion.ellipse animate={{ scale: 1 }} cx={(privacyX1 + privacyX2) / 2} cy={curiousY} fill="white" initial={{ scale: 0 }} rx="4" ry="5" transition={{ type: "spring", stiffness: 300, damping: 15 }} />;
  }
  if (state === "privacy") {
    return <line opacity="0.6" stroke="white" strokeLinecap="round" strokeWidth="2.5" x1={privacyX1} x2={privacyX2} y1={curiousY} y2={curiousY} />;
  }
  return <path d={idlePath} fill="none" stroke="white" strokeLinecap="round" strokeWidth="2.5" />;
}

const BlobCharacter = memo(function BlobCharacter({ state, mouse }: Readonly<{ state: AuthShowcaseState; mouse: MousePosition }>) {
  const root = useRef<SVGSVGElement | null>(null);
  const whole = mouseOffset(root, mouse, 5, 12);
  const left = mouseOffset(root, mouse, 5, 8);
  const right = mouseOffset(root, mouse, 5, 8);
  const idle = state === "idle";
  return (
    <motion.svg animate={state} data-auth-motion="character" fill="none" height="120" ref={root} variants={blobVariants} viewBox="0 0 140 120" width="140">
      <path d="M30 80 C10 70, 5 40, 25 25 C40 12, 65 5, 85 10 C105 15, 125 25, 130 45 C135 65, 125 85, 105 95 C85 105, 55 100, 40 95 C30 91, 25 88, 30 80Z" fill="#FF8C42" />
      <motion.g animate={{ x: idle ? whole.dx : state === "privacy" ? -8 : 0, y: idle ? whole.dy : 0 }} transition={spring}>
        <motion.g animate={state} variants={errorShake}>
          <motion.g animate={state} style={{ transformOrigin: "52px 48px" }} variants={eyeVariants}>
            <circle cx="52" cy="48" fill="white" r="12" />
            <motion.circle animate={{ cx: idle ? 52 + left.dx : state === "curious" ? 58 : state === "privacy" ? 43 : 52, cy: idle ? 48 + left.dy : 48, r: 6 }} fill="#1A1A2E" transition={spring} />
          </motion.g>
          <motion.g animate={state} style={{ transformOrigin: "82px 48px" }} variants={eyeVariants}>
            <circle cx="82" cy="48" fill="white" r="12" />
            <motion.circle animate={{ cx: idle ? 82 + right.dx : state === "curious" ? 88 : state === "privacy" ? 73 : 82, cy: idle ? 48 + right.dy : 48, r: 6 }} fill="#1A1A2E" transition={spring} />
          </motion.g>
          <Expression curiousY={70} errorPath="M58 73 Q67 67 76 73" idlePath="M58 68 Q67 76 76 68" privacyX1={58} privacyX2={76} state={state} />
        </motion.g>
      </motion.g>
    </motion.svg>
  );
});

const TallCharacter = memo(function TallCharacter({ state, mouse }: Readonly<{ state: AuthShowcaseState; mouse: MousePosition }>) {
  const root = useRef<SVGSVGElement | null>(null);
  const whole = mouseOffset(root, mouse, 6, 12);
  const left = mouseOffset(root, mouse, 5, 8);
  const right = mouseOffset(root, mouse, 5, 8);
  const idle = state === "idle";
  return (
    <motion.svg animate={state} data-auth-motion="character" fill="none" height="160" ref={root} style={{ transformOrigin: "35px 140px" }} variants={tallVariants} viewBox="0 0 70 160" width="70">
      <rect fill="#7C3AED" height="150" rx="14" width="60" x="5" y="5" />
      <motion.g animate={{ x: idle ? whole.dx : state === "privacy" ? -8 : 0, y: idle ? whole.dy : 0 }} transition={spring}>
        <motion.g animate={state} variants={tallErrorShake}>
          <motion.g animate={state} style={{ transformOrigin: "24px 50px" }} variants={tallEyeVariants}>
            <ellipse cx="24" cy="50" fill="white" rx="10" ry="11" />
            <motion.circle animate={{ cx: idle ? 24 + left.dx : state === "curious" ? 30 : state === "privacy" ? 15 : 24, cy: idle ? 50 + left.dy : 50, r: 5.5 }} fill="#1A1A2E" transition={spring} />
          </motion.g>
          <motion.g animate={state} style={{ transformOrigin: "46px 50px" }} variants={tallEyeVariants}>
            <ellipse cx="46" cy="50" fill="white" rx="10" ry="11" />
            <motion.circle animate={{ cx: idle ? 46 + right.dx : state === "curious" ? 52 : state === "privacy" ? 37 : 46, cy: idle ? 50 + right.dy : 50, r: 5.5 }} fill="#1A1A2E" transition={spring} />
          </motion.g>
          <Expression curiousY={75} errorPath="M27 77 Q35 71 43 77" idlePath="M27 72 Q35 79 43 72" privacyX1={28} privacyX2={42} state={state} />
        </motion.g>
      </motion.g>
    </motion.svg>
  );
});

const CardCharacter = memo(function CardCharacter({ state, mouse }: Readonly<{ state: AuthShowcaseState; mouse: MousePosition }>) {
  const root = useRef<SVGSVGElement | null>(null);
  const whole = mouseOffset(root, mouse, 5, 12);
  const left = mouseOffset(root, mouse, 5, 8);
  const right = mouseOffset(root, mouse, 5, 8);
  const idle = state === "idle";
  return (
    <motion.svg animate={state} data-auth-motion="character" fill="none" height="90" ref={root} variants={cardVariants} viewBox="0 0 120 90" width="120">
      <rect fill="#1A1A2E" height="80" rx="18" width="110" x="5" y="5" />
      <motion.g animate={{ x: idle ? whole.dx : state === "privacy" ? -8 : 0, y: idle ? whole.dy : 0 }} transition={spring}>
        <motion.g animate={state} variants={errorShake}>
          <motion.g animate={state} style={{ transformOrigin: "40px 45px" }} variants={eyeVariants}>
            <circle cx="40" cy="45" fill="white" r="13" />
            <motion.circle animate={{ cx: idle ? 40 + left.dx : state === "curious" ? 47 : state === "privacy" ? 31 : 40, cy: idle ? 45 + left.dy : 45, r: 6.5 }} fill="#1A1A2E" transition={spring} />
          </motion.g>
          <motion.g animate={state} style={{ transformOrigin: "80px 45px" }} variants={eyeVariants}>
            <circle cx="80" cy="45" fill="white" r="13" />
            <motion.circle animate={{ cx: idle ? 80 + right.dx : state === "curious" ? 87 : state === "privacy" ? 71 : 80, cy: idle ? 45 + right.dy : 45, r: 6.5 }} fill="#1A1A2E" transition={spring} />
          </motion.g>
          <Expression curiousY={66} errorPath="M48 68 Q60 62 72 68" idlePath="M48 63 Q60 72 72 63" privacyX1={50} privacyX2={70} state={state} />
        </motion.g>
      </motion.g>
    </motion.svg>
  );
});

const PillCharacter = memo(function PillCharacter({ state, mouse }: Readonly<{ state: AuthShowcaseState; mouse: MousePosition }>) {
  const root = useRef<SVGSVGElement | null>(null);
  const whole = mouseOffset(root, mouse, 5, 12);
  const left = mouseOffset(root, mouse, 5, 8);
  const right = mouseOffset(root, mouse, 5, 8);
  const idle = state === "idle";
  return (
    <motion.svg animate={state} data-auth-motion="character" fill="none" height="70" ref={root} style={{ transformOrigin: "75px 35px" }} variants={pillVariants} viewBox="0 0 150 70" width="150">
      <rect fill="#FBBF24" height="60" rx="30" width="140" x="5" y="5" />
      <motion.g animate={{ x: idle ? whole.dx : state === "privacy" ? -8 : 0, y: idle ? whole.dy : 0 }} transition={spring}>
        <motion.g animate={state} variants={errorShake}>
          <motion.g animate={state} style={{ transformOrigin: "55px 35px" }} variants={eyeVariants}>
            <circle cx="55" cy="35" fill="white" r="12" />
            <motion.circle animate={{ cx: idle ? 55 + left.dx : state === "curious" ? 62 : state === "privacy" ? 46 : 55, cy: idle ? 35 + left.dy : 35, r: 5.5 }} fill="#1A1A2E" transition={spring} />
          </motion.g>
          <motion.g animate={state} style={{ transformOrigin: "95px 35px" }} variants={eyeVariants}>
            <circle cx="95" cy="35" fill="white" r="12" />
            <motion.circle animate={{ cx: idle ? 95 + right.dx : state === "curious" ? 102 : state === "privacy" ? 86 : 95, cy: idle ? 35 + right.dy : 35, r: 5.5 }} fill="#1A1A2E" transition={spring} />
          </motion.g>
          <Expression curiousY={50} errorPath="M65 52 Q75 46 85 52" idlePath="M65 48 Q75 56 85 48" privacyX1={65} privacyX2={85} state={state} />
        </motion.g>
      </motion.g>
    </motion.svg>
  );
});

function CharacterGroup({ state = "idle" }: Readonly<{ state?: AuthShowcaseState }>) {
  const mouse = useMousePosition(state === "idle");
  return (
    <div className="auth-showcase-character-group">
      <div className="auth-showcase-character-canvas">
        <div className="auth-showcase-character auth-showcase-character--tall"><TallCharacter mouse={mouse} state={state} /></div>
        <div className="auth-showcase-character auth-showcase-character--blob"><BlobCharacter mouse={mouse} state={state} /></div>
        <div className="auth-showcase-character auth-showcase-character--card"><CardCharacter mouse={mouse} state={state} /></div>
        <div className="auth-showcase-character auth-showcase-character--pill"><PillCharacter mouse={mouse} state={state} /></div>
      </div>
    </div>
  );
}

function useDesktopShowcase() {
  const [desktop, setDesktop] = useState(false);
  useEffect(() => {
    const query = window.matchMedia("(min-width: 1024px)");
    setDesktop(query.matches);
    const update = (event: MediaQueryListEvent) => setDesktop(event.matches);
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return desktop;
}

export default function AuthShowcase({
  eyebrowPhrases,
  headlinePre,
  headlineFocus,
  subhead,
  interactionState = "idle",
}: AuthShowcaseProps) {
  const desktop = useDesktopShowcase();

  return (
    <aside aria-hidden="true" className="auth-showcase">
      {desktop ? (
        <Suspense fallback={null}>
          <div className="auth-showcase-backdrop">
            <LiquidEther autoIntensity={2.2} autoSpeed={0.4} colors={liquidColors} cursorSize={120} mouseForce={32} />
          </div>
        </Suspense>
      ) : null}

      <div className="auth-showcase-copy-shell">
        <div className="auth-showcase-copy">
          <p className="auth-showcase-eyebrow">
            <span aria-hidden="true" />
            <Typewriter phrases={eyebrowPhrases} />
          </p>
          <h2>
            <span className="auth-showcase-pre">{headlinePre}</span>{" "}
            <TrueFocus borderColor="#FFFFFF" glowColor="rgba(255, 255, 255, 0.45)" sentence={headlineFocus} />
          </h2>
          <p className="auth-showcase-description">{subhead}</p>
        </div>
      </div>

      <div className="auth-showcase-characters">
        <div className="auth-showcase-characters-inner">
          <CharacterGroup state={interactionState} />
        </div>
      </div>
    </aside>
  );
}
