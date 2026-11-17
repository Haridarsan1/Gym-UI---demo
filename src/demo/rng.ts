/** Small seeded random numbers, so the same seed always gives the same gym. */
export function rng(seed: number) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const int = (min: number, max: number) => min + Math.floor(next() * (max - min + 1));
  const pick = <T,>(list: readonly T[]): T => list[Math.floor(next() * list.length)] as T;
  const shuffle = <T,>(list: readonly T[]): T[] => {
    const out = [...list];
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(next() * (i + 1));
      [out[i], out[j]] = [out[j] as T, out[i] as T];
    }
    return out;
  };
  const weighted = <T,>(items: ReadonlyArray<readonly [T, number]>): T => {
    const total = items.reduce((n, [, w]) => n + w, 0);
    let r = next() * total;
    for (const [item, w] of items) {
      r -= w;
      if (r < 0) return item;
    }
    return items[items.length - 1]![0];
  };
  return { next, int, pick, shuffle, weighted };
}

export type Rng = ReturnType<typeof rng>;
