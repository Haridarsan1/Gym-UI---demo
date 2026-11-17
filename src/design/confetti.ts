/**
 * A short burst of confetti on a canvas that covers the screen and ignores taps. Under a second, in Ember, mint and
 * lilac. It is loaded only when a record or badge is celebrated (see celebrate.ts) and removes itself when done.
 */
export const CONFETTI_MS = 900;
export const CONFETTI_COLORS = ["#D14000", "#FF7A3D", "#6FCFA6", "#3FB68B", "#B9A7FB", "#8B6CF6"] as const;

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  spin: number;
  angle: number;
  color: string;
}

/** Pieces fly up and out from one point, then fall. `random` is passed in so a test can fix it. */
export function makeParticles(count: number, originX: number, originY: number, random: () => number = Math.random): Particle[] {
  return Array.from({ length: count }, (_, i) => {
    const heading = -Math.PI / 2 + (random() - 0.5) * Math.PI * 1.1;
    const speed = 340 + random() * 420;
    return {
      x: originX, y: originY, vx: Math.cos(heading) * speed, vy: Math.sin(heading) * speed, size: 5 + random() * 6,
      spin: (random() - 0.5) * 14, angle: random() * Math.PI, color: CONFETTI_COLORS[i % CONFETTI_COLORS.length]!,
    };
  });
}

/** Moves a piece on by `dt` seconds with gravity and a little drag. */
export function stepParticle(p: Particle, dt: number): Particle {
  const drag = 1 - 1.6 * dt;
  return { ...p, x: p.x + p.vx * dt, y: p.y + p.vy * dt, vx: p.vx * drag, vy: p.vy * drag + 1400 * dt, angle: p.angle + p.spin * dt };
}

export function burst(): void {
  const canvas = document.createElement("canvas");
  canvas.setAttribute("data-confetti", "");
  canvas.setAttribute("aria-hidden", "true");
  const ratio = Math.min(2, window.devicePixelRatio || 1);
  const w = window.innerWidth;
  const h = window.innerHeight;
  canvas.width = w * ratio;
  canvas.height = h * ratio;
  Object.assign(canvas.style, { position: "fixed", inset: "0", width: "100%", height: "100%", pointerEvents: "none", zIndex: "90" });
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.scale(ratio, ratio);
  document.body.appendChild(canvas);

  let pieces = makeParticles(48, w / 2, h * 0.42);
  const start = performance.now();
  let last = start;
  const frame = (now: number) => {
    const t = now - start;
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    ctx.clearRect(0, 0, w, h);
    if (t >= CONFETTI_MS) return canvas.remove();
    pieces = pieces.map((p) => stepParticle(p, dt));
    ctx.globalAlpha = Math.min(1, (CONFETTI_MS - t) / 300);
    for (const p of pieces) {
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.angle);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
      ctx.restore();
    }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
  // If the tab is hidden the animation frames stop; make sure the canvas still goes away.
  window.setTimeout(() => canvas.remove(), CONFETTI_MS + 200);
}
