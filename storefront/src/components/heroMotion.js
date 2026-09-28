export const HERO_SOURCE_TILT = Object.freeze({
  perspective: 1200,
  translateX: 60,
  translateY: -50,
  scale: 0.8,
  rotateZ: 5,
  rotateX: 6,
  rotateY: 18,
  skewX: 7
});

export const HERO_FRONT = Object.freeze({
  perspective: 1200,
  translateX: 0,
  translateY: 0,
  scale: 1,
  rotateZ: 0,
  rotateX: 0,
  rotateY: 0,
  skewX: 0
});

export const CURSOR_SCROLL_END = 1195;

function clamp(value, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value));
}

function lerp(from, to, progress) {
  return from + (to - from) * progress;
}

export function heroVisibilityProgress({
  sceneTop,
  sceneHeight,
  viewportHeight,
  scrollY
}) {
  if (sceneHeight <= 0) return 1;

  return clamp((viewportHeight - (sceneTop - scrollY)) / sceneHeight);
}

export function sampleHeroVisibility(progress) {
  const normalizedProgress = clamp(progress);

  return {
    perspective: HERO_SOURCE_TILT.perspective,
    translateX: lerp(
      HERO_SOURCE_TILT.translateX,
      HERO_FRONT.translateX,
      normalizedProgress
    ),
    translateY: lerp(
      HERO_SOURCE_TILT.translateY,
      HERO_FRONT.translateY,
      normalizedProgress
    ),
    scale: lerp(HERO_SOURCE_TILT.scale, HERO_FRONT.scale, normalizedProgress),
    rotateZ: lerp(
      HERO_SOURCE_TILT.rotateZ,
      HERO_FRONT.rotateZ,
      normalizedProgress
    ),
    rotateX: lerp(
      HERO_SOURCE_TILT.rotateX,
      HERO_FRONT.rotateX,
      normalizedProgress
    ),
    rotateY: lerp(
      HERO_SOURCE_TILT.rotateY,
      HERO_FRONT.rotateY,
      normalizedProgress
    ),
    skewX: lerp(HERO_SOURCE_TILT.skewX, HERO_FRONT.skewX, normalizedProgress)
  };
}

export function sampleOverlayScroll(scrollY) {
  const normalizedScrollY = Math.max(0, scrollY);

  return {
    activityY: normalizedScrollY * 0.1,
    deliverableY: normalizedScrollY * 0.05
  };
}

export function sampleCursorScroll(scrollY) {
  const normalizedScrollY = Math.max(0, scrollY);
  const progress = clamp(normalizedScrollY / CURSOR_SCROLL_END);

  return {
    perspective: 1200,
    translateX: lerp(0, -10, progress),
    translateY: normalizedScrollY * 0.37 + lerp(0, 10, progress),
    scale: lerp(0.9, 1, progress),
    rotateZ: lerp(3, 0, progress),
    rotateX: lerp(5, 0, progress),
    rotateY: lerp(4, 0, progress),
    skewX: lerp(4, 0, progress)
  };
}
