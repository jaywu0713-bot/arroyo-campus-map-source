export function renderPixelRatio(dpr: number, touch: boolean) {
  return Math.max(1, Math.min(dpr || 1, touch ? 1.25 : 1.5));
}
export function needsFrame(
  now: number,
  lastActivity: number,
  active: boolean,
  visible: boolean,
) {
  // Give orbit damping time to settle after a gesture, then stop scheduling.
  return visible && (active || now - lastActivity < 900);
}
