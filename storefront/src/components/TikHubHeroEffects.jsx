import { useEffect, useRef, useState } from "react";
import { motion } from "motion/react";

// Source-equivalent extraction of the TikHub homepage effects. Keep the
// timings and focus-frame geometry aligned with the captured production UI.
export function Typewriter({
  phrases,
  typingSpeed = 60,
  deletingSpeed = 40,
  pauseDuration = 2000,
}) {
  const [text, setText] = useState("");
  const [phraseIndex, setPhraseIndex] = useState(0);
  const [phase, setPhase] = useState("typing");
  const timerRef = useRef(null);

  useEffect(() => {
    const phrase = phrases[phraseIndex];

    if (phase === "typing") {
      if (text.length < phrase.length) {
        timerRef.current = window.setTimeout(() => {
          setText(phrase.slice(0, text.length + 1));
        }, typingSpeed);
      } else {
        timerRef.current = window.setTimeout(() => {
          setPhase("deleting");
        }, pauseDuration);
      }
    } else if (text.length > 0) {
      timerRef.current = window.setTimeout(() => {
        setText(text.slice(0, text.length - 1));
      }, deletingSpeed);
    } else {
      setPhraseIndex((index) => (index + 1) % phrases.length);
      setPhase("typing");
    }

    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
  }, [deletingSpeed, pauseDuration, phase, phraseIndex, phrases, text, typingSpeed]);

  return (
    <span className="hero-typewriter">
      {text}
      <span className="hero-typewriter-cursor" aria-hidden="true" />
    </span>
  );
}

export function TrueFocus({
  sentence = "True Focus",
  separator = " ",
  manualMode = false,
  blurAmount = 5,
  borderColor = "#6366F1",
  glowColor = "rgba(99, 102, 241, 0.5)",
  animationDuration = 0.5,
  pauseBetweenAnimations = 1,
  className = "",
}) {
  const words = sentence.split(separator);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [lastActiveIndex, setLastActiveIndex] = useState(null);
  const containerRef = useRef(null);
  const wordRefs = useRef([]);
  const [focusRect, setFocusRect] = useState({ x: 0, y: 0, width: 0, height: 0 });

  const measureFocusRect = () => {
    if (
      currentIndex === null ||
      currentIndex === -1 ||
      !wordRefs.current[currentIndex] ||
      !containerRef.current
    ) {
      return;
    }

    const parentRect = containerRef.current.getBoundingClientRect();
    const activeRect = wordRefs.current[currentIndex].getBoundingClientRect();
    setFocusRect({
      x: activeRect.left - parentRect.left,
      y: activeRect.top - parentRect.top,
      width: activeRect.width,
      height: activeRect.height,
    });
  };

  useEffect(() => {
    if (manualMode) return undefined;
    const interval = window.setInterval(() => {
      setCurrentIndex((index) => (index + 1) % words.length);
    }, (animationDuration + pauseBetweenAnimations) * 1000);
    return () => window.clearInterval(interval);
  }, [animationDuration, manualMode, pauseBetweenAnimations, words.length]);

  useEffect(() => {
    measureFocusRect();

    const container = containerRef.current;
    const activeWord = wordRefs.current[currentIndex];
    if (!container || !activeWord) return undefined;

    const handleResize = () => {
      measureFocusRect();
    };

    window.addEventListener("resize", handleResize);

    let resizeObserver;
    if (typeof ResizeObserver !== "undefined") {
      resizeObserver = new ResizeObserver(handleResize);
      resizeObserver.observe(container);
      resizeObserver.observe(activeWord);
    }

    return () => {
      window.removeEventListener("resize", handleResize);
      resizeObserver?.disconnect();
    };
  }, [currentIndex, words.length]);

  const handleMouseLeave = () => {
    if (manualMode && lastActiveIndex !== null) setCurrentIndex(lastActiveIndex);
  };

  return (
    <span className={`hero-true-focus ${className}`} ref={containerRef}>
      {words.map((word, index) => {
        const isActive = index === currentIndex;
        return (
          <span className="hero-true-focus-segment" key={`${word}-${index}`}>
            <span
              ref={(element) => {
                wordRefs.current[index] = element;
              }}
              className="hero-true-focus-word"
              style={{
                filter: isActive ? "blur(0px)" : `blur(${blurAmount}px)`,
                transition: `filter ${animationDuration}s ease`,
              }}
              onMouseEnter={() => {
                if (!manualMode) return;
                setLastActiveIndex(index);
                setCurrentIndex(index);
              }}
              onMouseLeave={handleMouseLeave}
            >
              {word}
            </span>
            {index < words.length - 1 ? " " : ""}
          </span>
        );
      })}
      <motion.span
        className="hero-true-focus-frame"
        style={{ boxSizing: "content-box" }}
        animate={{
          x: focusRect.x,
          y: focusRect.y,
          width: focusRect.width,
          height: focusRect.height,
          opacity: Number(currentIndex >= 0),
        }}
        transition={{ duration: animationDuration }}
      >
        <span
          className="hero-true-focus-corner hero-true-focus-corner-top-left"
          style={{
            borderColor,
            filter: `drop-shadow(0px 0px 4px ${glowColor})`,
          }}
        />
        <span
          className="hero-true-focus-corner hero-true-focus-corner-top-right"
          style={{
            borderColor,
            filter: `drop-shadow(0px 0px 4px ${glowColor})`,
          }}
        />
        <span
          className="hero-true-focus-corner hero-true-focus-corner-bottom-left"
          style={{
            borderColor,
            filter: `drop-shadow(0px 0px 4px ${glowColor})`,
          }}
        />
        <span
          className="hero-true-focus-corner hero-true-focus-corner-bottom-right"
          style={{
            borderColor,
            filter: `drop-shadow(0px 0px 4px ${glowColor})`,
          }}
        />
      </motion.span>
    </span>
  );
}
