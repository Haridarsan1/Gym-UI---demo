import type { LucideIcon } from "lucide-react";
import type { Action } from "@/domain/permissions";
import type { Area } from "@/domain/roles";

/**
 * Every screen in docs/PLAN.md section 4, with where it lives and who may open it. The routes, the navigation and the
 * command palette all read this list, and a test checks it against PLAN.md so the two cannot drift apart.
 *
 * Titles match PLAN.md exactly. `label` is the shorter word used in tab bars and menus.
 */
export type Place =
  /** A tab in the bottom bar (member and trainer apps). */
  | "tab"
  /** In the avatar menu (member and trainer apps). */
  | "menu"
  /** In the sidebar, and in the bottom bar or More sheet on phones (staff consoles). */
  | "side"
  /** Reached from another screen: a sub-tab, a row, or a button. */
  | "sub"
  /** A flow started by a button, not by navigation. */
  | "flow";

export interface ScreenDef {
  id: string;
  title: string;
  label?: string;
  /** One short word for the narrow navigation rail on tablets. Falls back to `label`, then `title`. */
  short?: string;
  /** A shorter label for the sidebar, where a long one would wrap. The full `label` stays the accessible name and the tooltip. */
  side?: string;
  /** Path inside the area. "" is the area home. */
  path: string;
  /** Requirement IDs from docs/REQUIREMENTS.md. */
  req: string[];
  summary: string;
  /** Who may open it. Omit for any signed-in person in the area. */
  action?: Action;
  icon: LucideIcon;
  place: Place;
  /** Sidebar group heading for staff consoles. */
  group?: string;
  /** For sub screens: the id of the screen they belong to. */
  parent?: string;
  /** Order in the phone bottom bar for staff consoles. Lower comes first. Screens without one follow in list order. */
  mobile?: number;
}

export const MILESTONE: Record<Area, string> = { member: "M1", trainer: "M2", desk: "M3", owner: "M4", admin: "M5" };

/** The word under an icon in the tablet rail. */
export const railLabel = (s: Pick<ScreenDef, "short" | "label" | "title">): string => s.short ?? s.label ?? s.title;

/**
 * Each area registers its own screens when its code loads (`registerScreens`), so the member app never downloads the
 * trainer, desk, owner or admin lists. Tests that need every area import `@/app/screens/all`.
 */
export const SCREENS: Record<Area, ScreenDef[]> = { member: [], trainer: [], desk: [], owner: [], admin: [] };
export const registerScreens = (area: Area, defs: ScreenDef[]): void => {
  SCREENS[area] = defs;
};

/** Screens in the order they appear in navigation. */
export const screensIn = (area: Area, place: Place): ScreenDef[] => SCREENS[area].filter((s) => s.place === place);
