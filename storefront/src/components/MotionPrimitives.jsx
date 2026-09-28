import { useEffect, useRef, useState } from "react";
import { motion, useInView, useReducedMotion } from "motion/react";

const directionOffsets = {
  left: (distance) => ({ x: -distance, y: 0 }),
  right: (distance) => ({ x: distance, y: 0 }),
  up: (distance) => ({ x: 0, y: distance }),
};

function useReplayableInView(amount) {
  const ref = useRef(null);
  const inView = useInView(ref, { amount });
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  return { ref, inView, mounted };
}

export function Reveal({ children, className = "", delay = 0, amount = 0.5, ...rootProps }) {
  const reduceMotion = useReducedMotion();
  const { ref, inView, mounted } = useReplayableInView(amount);

  return (
    <motion.div
      {...rootProps}
      ref={ref}
      animate={reduceMotion || !mounted || inView ? "visible" : "hidden"}
      className={className}
      initial={false}
      variants={{
        hidden: reduceMotion ? {} : { opacity: 0, y: 24 },
        visible: {
          opacity: 1,
          y: 0,
          transition: {
            duration: reduceMotion ? 0 : 0.65,
            delay: reduceMotion ? 0 : delay,
            ease: [0.16, 1, 0.3, 1],
          },
        },
      }}
    >
      {children}
    </motion.div>
  );
}

export function StaggerGroup({
  children,
  className = "",
  amount = 0.5,
  stagger = 0.09,
}) {
  const reduceMotion = useReducedMotion();
  const { ref, inView, mounted } = useReplayableInView(amount);

  return (
    <motion.div
      ref={ref}
      animate={reduceMotion || !mounted || inView ? "visible" : "hidden"}
      className={className}
      initial={false}
      variants={{
        hidden: {},
        visible: {
          transition: {
            staggerChildren: reduceMotion ? 0 : stagger,
          },
        },
      }}
    >
      {children}
    </motion.div>
  );
}

export function StaggerItem({
  children,
  className = "",
  direction = "up",
  distance = 48,
  ...rootProps
}) {
  const reduceMotion = useReducedMotion();
  const offset = directionOffsets[direction]?.(distance) ?? directionOffsets.up(distance);

  return (
    <motion.div
      {...rootProps}
      className={className}
      variants={{
        hidden: reduceMotion
          ? {}
          : {
              opacity: 0,
              scale: 0.985,
              ...offset,
            },
        visible: {
          opacity: 1,
          scale: 1,
          x: 0,
          y: 0,
          transition: reduceMotion
            ? { duration: 0 }
            : {
                type: "spring",
                stiffness: 105,
                damping: 19,
                mass: 0.74,
              },
        },
      }}
    >
      {children}
    </motion.div>
  );
}
