import {
  motion,
  useMotionTemplate,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform
} from "motion/react";
import { lazy, Suspense, useRef } from "react";
import { ButtonLink } from "./SiteChrome";
import { HeroProductDemo } from "./HeroProductDemo";
import { TrueFocus, Typewriter } from "./TikHubHeroEffects";
import { APP_LOGIN_URL } from "../productHandoff";
import {
  sampleHeroVisibility
} from "./heroMotion";

// Reuse the already-vendored source implementation shared with the auth shell.
// It is loaded only on the client so the homepage keeps TikHub's lazy WebGL path.
const LiquidEther = lazy(() => import("../../../auth/src/LiquidEther.tsx"));
const HERO_LIQUID_COLORS = ["#6366F1", "#818CF8", "#A78BFA"];

export function HeroScene({ copy, locale }) {
  // Server rendering has no motion preference: keep the initial copy readable.
  const reduceMotion = useReducedMotion() ?? true;
  const typewriterPhrases = copy.hero.typewriterPhrases || [copy.hero.eyebrow];
  const focusSegments = copy.hero.titleFocusSegments || [copy.hero.titleLine2];
  const heroTitle = [copy.hero.titleLine1, copy.hero.titleLine2].filter(Boolean).join(" ");
  const sceneRef = useRef(null);
  const { scrollYProgress: sceneVisibilityProgress } = useScroll({
    target: sceneRef,
    offset: ["start end", "end end"]
  });
  const smoothSceneProgress = useSpring(sceneVisibilityProgress, {
    stiffness: 500,
    damping: 60,
    mass: 1
  });
  const sceneX = useTransform(smoothSceneProgress, (value) =>
    reduceMotion ? 0 : sampleHeroVisibility(value).translateX
  );
  const sceneY = useTransform(smoothSceneProgress, (value) =>
    reduceMotion ? 0 : sampleHeroVisibility(value).translateY
  );
  const sceneScale = useTransform(smoothSceneProgress, (value) =>
    reduceMotion ? 1 : sampleHeroVisibility(value).scale
  );
  const sceneRotateZ = useTransform(smoothSceneProgress, (value) =>
    reduceMotion ? 0 : sampleHeroVisibility(value).rotateZ
  );
  const sceneRotateX = useTransform(smoothSceneProgress, (value) =>
    reduceMotion ? 0 : sampleHeroVisibility(value).rotateX
  );
  const sceneRotateY = useTransform(smoothSceneProgress, (value) =>
    reduceMotion ? 0 : sampleHeroVisibility(value).rotateY
  );
  const sceneSkewX = useTransform(smoothSceneProgress, (value) =>
    reduceMotion ? 0 : sampleHeroVisibility(value).skewX
  );
  const sceneTransform = useMotionTemplate`perspective(1200px) translateX(${sceneX}px) translateY(${sceneY}px) scale(${sceneScale}) rotate(${sceneRotateZ}deg) rotateX(${sceneRotateX}deg) rotateY(${sceneRotateY}deg) skewX(${sceneSkewX}deg)`;

  const bkpwddTransition = {
    type: "spring",
    bounce: 0.1,
    duration: reduceMotion ? 0 : 0.8,
    delay: 0
  };

  const subtitleTransition = {
    type: "spring",
    bounce: 0.2,
    duration: reduceMotion ? 0 : 0.8,
    delay: reduceMotion ? 0 : 0.2
  };

  const springScaleTransition = {
    type: "spring",
    bounce: 0,
    duration: reduceMotion ? 0 : 1,
    delay: 0
  };

  return (
    <section className="hero" id="hero">
      {!reduceMotion ? (
        <div className="hero-liquid" aria-hidden="true">
          <Suspense fallback={null}>
            <LiquidEther
              colors={HERO_LIQUID_COLORS}
              mouseForce={8}
              cursorSize={80}
              isViscous
              viscous={60}
              iterationsViscous={32}
              iterationsPoisson={32}
              resolution={0.5}
              isBounce={false}
              autoDemo
              autoSpeed={0.3}
              autoIntensity={0.6}
              takeoverDuration={0.25}
              autoResumeDelay={5000}
              autoRampDuration={0.6}
              style={{ width: "100%", height: "100%" }}
            />
          </Suspense>
        </div>
      ) : null}
      <div className="hero-dots" aria-hidden="true" />
      <div className="container hero-copy">
        <motion.div
          className="hero-eyebrow"
          initial={false}
          animate={{ opacity: 1, y: 0 }}
          transition={bkpwddTransition}
        >
          {reduceMotion ? (
            typewriterPhrases[0]
          ) : (
            <Typewriter
              key={locale}
              phrases={typewriterPhrases}
              typingSpeed={50}
              deletingSpeed={35}
              pauseDuration={2000}
            />
          )}
        </motion.div>
        <motion.h1
          aria-label={heroTitle}
          initial={false}
          animate={{ opacity: 1, y: 0 }}
          transition={bkpwddTransition}
        >
          {copy.hero.titleLine1 ? (
            <>
              {copy.hero.titleLine1}
              <br />
            </>
          ) : null}
          <span className="hero-focus-line" aria-hidden="true">
            {reduceMotion ? (
              copy.hero.titleLine2
            ) : (
              <TrueFocus
                sentence={focusSegments.join(" ")}
                manualMode={false}
                blurAmount={4}
                borderColor="#6366F1"
                glowColor="rgba(99, 102, 241, 0.4)"
                animationDuration={0.5}
                pauseBetweenAnimations={1.2}
              />
            )}
          </span>
        </motion.h1>
        <motion.p
          className="hero-description"
          initial={false}
          animate={{ opacity: 1, y: 0 }}
          transition={subtitleTransition}
        >
          {copy.hero.descriptionLine1}
          {copy.hero.descriptionLine2 ? (
            <>
              <br className="hero-description-break" />
              {" "}
              {copy.hero.descriptionLine2}
            </>
          ) : null}
        </motion.p>
        <motion.div
          className="hero-actions"
          initial={false}
          animate={{ opacity: 1, y: 0 }}
          transition={subtitleTransition}
        >
          <ButtonLink href={APP_LOGIN_URL}>{copy.hero.getStarted}</ButtonLink>
          <ButtonLink href="#demo" variant="secondary">
            {copy.hero.talkToSales}
          </ButtonLink>
        </motion.div>
      </div>

      <div className="container hero-stage" id="demo">
        <motion.div
          className="dashboard-entry"
          initial={false}
          animate={{ opacity: 1, scale: 1 }}
          transition={springScaleTransition}
        >
          <motion.div
            ref={sceneRef}
            className="dashboard-scene"
            style={{ transform: sceneTransform }}
          >
            <div className="dashboard-frame">
              <HeroProductDemo locale={locale} />
            </div>
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
}
