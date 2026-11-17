import { ApiError } from "@/api/errors";

/** Makes the demo behave like a real network: a short delay, and failures when switched on (for retry testing). */
export interface Simulation {
  minMs: number;
  maxMs: number;
  /** 0 to 1. The share of calls that fail with a network error. */
  failureRate: number;
}

const KEY = "ember.demo.simulation";
const DEFAULTS: Simulation = { minMs: 60, maxMs: 180, failureRate: 0 };
let current: Simulation | null = null;

export function getSimulation(): Simulation {
  if (current) return current;
  try {
    const raw = typeof localStorage === "undefined" ? null : localStorage.getItem(KEY);
    current = raw ? { ...DEFAULTS, ...(JSON.parse(raw) as Partial<Simulation>) } : { ...DEFAULTS };
  } catch {
    current = { ...DEFAULTS };
  }
  return current;
}

export function configureSimulation(next: Partial<Simulation>): Simulation {
  current = { ...getSimulation(), ...next };
  try {
    if (typeof localStorage !== "undefined") localStorage.setItem(KEY, JSON.stringify(current));
  } catch {
    /* Not saved. The setting lasts for this page only. */
  }
  return current;
}

/** Waits a little, then sometimes fails. Every API call goes through this first. */
export async function simulateNetwork(): Promise<void> {
  const { minMs, maxMs, failureRate } = getSimulation();
  const wait = minMs + Math.random() * Math.max(0, maxMs - minMs);
  if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
  if (failureRate > 0 && Math.random() < failureRate) throw new ApiError("network", "We couldn’t reach the server. Check your connection and try again.");
}
