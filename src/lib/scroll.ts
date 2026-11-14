/**
 * Smooth scroll to an element, driven by requestAnimationFrame.
 * The browser's native smooth scroll gets cancelled by the pinned (sticky) sections on the home page,
 * so in-page links use this instead. Respects reduced motion.
 */
const NAV_OFFSET = 96;

export function scrollToId(id: string) {
  const el = document.getElementById(id);
  if (!el) return;
  const root = document.documentElement;
  const target = Math.max(0, el.getBoundingClientRect().top + window.scrollY - NAV_OFFSET);
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const prev = root.style.scrollBehavior;
  root.style.scrollBehavior = "auto";

  if (reduced) {
    window.scrollTo(0, target);
    root.style.scrollBehavior = prev;
    return;
  }

  const start = window.scrollY;
  const distance = target - start;
  const duration = Math.min(1400, 450 + Math.abs(distance) * 0.12);
  const t0 = performance.now();
  const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

  const step = (now: number) => {
    const p = Math.min(1, (now - t0) / duration);
    window.scrollTo(0, start + distance * ease(p));
    if (p < 1) requestAnimationFrame(step);
    else {
      // Correct for any layout shift that happened during the scroll.
      const final = Math.max(0, el.getBoundingClientRect().top + window.scrollY - NAV_OFFSET);
      window.scrollTo(0, final);
      root.style.scrollBehavior = prev;
    }
  };
  requestAnimationFrame(step);
}
