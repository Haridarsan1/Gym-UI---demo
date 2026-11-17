/**
 * The gym’s name and logo, kept in the browser so the header and loading screens can show them before anything has loaded.
 * They are written when the person signs in and refreshed whenever the app reads them from the gym’s record. It is keyed by
 * the gym, so another login on the same device never shows the wrong gym. This file must stay free of React Query and Dexie.
 */
export interface GymBrand {
  tenantId: string;
  name: string;
  logoUrl?: string;
}

const KEY = "ember.gym";

export function readGym(tenantId: string | null | undefined): GymBrand | null {
  if (!tenantId) return null;
  try {
    const g = JSON.parse(localStorage.getItem(KEY) ?? "null") as GymBrand | null;
    return g && g.tenantId === tenantId && typeof g.name === "string" ? g : null;
  } catch {
    return null;
  }
}

export function writeGym(gym: GymBrand): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(gym));
  } catch {
    /* Storage can be blocked. The header then waits for the first load. */
  }
}
