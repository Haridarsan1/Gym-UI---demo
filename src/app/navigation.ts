import type { Action } from "@/domain/permissions";
import type { Area } from "@/domain/roles";
import { AREA_PATH } from "@/domain/roles";
import { SCREENS, screensIn, type ScreenDef } from "@/app/screens";

export type CanFn = (action: Action) => boolean;

/** Screens this person may open, in navigation order. A screen with no `action` is open to anyone in the area. */
export function visibleScreens(area: Area, can: CanFn): ScreenDef[] {
  return SCREENS[area].filter((s) => !s.action || can(s.action));
}

export const screenPath = (area: Area, s: Pick<ScreenDef, "path">): string => (s.path ? `${AREA_PATH[area]}/${s.path}` : AREA_PATH[area]);

/** Bottom tabs for the member and trainer apps (four, with the raised action in the middle). */
export function tabsFor(area: Area, can: CanFn): ScreenDef[] {
  return screensIn(area, "tab").filter((s) => !s.action || can(s.action));
}

/** Items behind the avatar in the member and trainer apps. */
export function menuFor(area: Area, can: CanFn): ScreenDef[] {
  return screensIn(area, "menu").filter((s) => !s.action || can(s.action));
}

/** Sidebar entries for a staff console, grouped under headings. */
export function sidebarFor(area: Area, can: CanFn): Array<{ group: string; items: ScreenDef[] }> {
  const groups: Array<{ group: string; items: ScreenDef[] }> = [];
  for (const s of screensIn(area, "side").filter((x) => !x.action || can(x.action))) {
    const name = s.group ?? "";
    const g = groups.find((x) => x.group === name);
    if (g) g.items.push(s);
    else groups.push({ group: name, items: [s] });
  }
  return groups;
}

/**
 * On phones a staff console shows four entries in the bottom bar, picked by each screen’s `mobile` rank and then by list
 * order. The rest go behind “More”. Five entries fit without a More button.
 */
export function mobileBar(items: ScreenDef[], size = 4): { bar: ScreenDef[]; more: ScreenDef[] } {
  if (items.length <= size + 1) return { bar: items, more: [] };
  const ranked = items.map((s, i) => ({ s, rank: s.mobile ?? 100 + i })).sort((a, b) => a.rank - b.rank).map((x) => x.s);
  return { bar: ranked.slice(0, size), more: ranked.slice(size) };
}

export interface RaisedAction {
  label: string;
  to: string;
}

/** A workout the member can start or carry on today. */
export interface TodaysWorkout {
  date: string;
  /** True when it was already started and saved as a draft. */
  resume: boolean;
}

/**
 * The big button in the middle of the member and trainer tab bars.
 * Members start today’s workout when they have one still to do, carry on one they started, and otherwise (a rest day, no
 * plan yet, or the workout is done) open their check-in pass.
 */
export function raisedAction(area: "member" | "trainer", todaysWorkout?: TodaysWorkout): RaisedAction {
  if (area === "trainer") return { label: "Log session", to: `${AREA_PATH.trainer}/log` };
  if (!todaysWorkout) return { label: "Check-in pass", to: `${AREA_PATH.member}/pass` };
  return { label: todaysWorkout.resume ? "Continue today’s workout" : "Start today’s workout", to: `${AREA_PATH.member}/workout/${todaysWorkout.date}` };
}

/** Screens that can be jumped to from the command palette: not the ones that need an id in the address. */
export function paletteScreens(area: Area, can: CanFn): ScreenDef[] {
  return visibleScreens(area, can).filter((s) => !s.path.includes(":") && s.place !== "flow");
}

/**
 * Where someone lands when they open their area. The area’s home screen if they may open it, otherwise the first screen
 * they may open. Finance staff work in the desk area but cannot check members in, so they land on invoices.
 */
export function landingScreen(area: Area, can: CanFn): ScreenDef | undefined {
  const home = SCREENS[area].find((s) => s.path === "");
  if (home && (!home.action || can(home.action))) return home;
  const open = visibleScreens(area, can).filter((s) => !s.path.includes(":") && s.place !== "flow");
  for (const id of FALLBACK_LANDING[area] ?? []) {
    const preferred = open.find((s) => s.id === id);
    if (preferred) return preferred;
  }
  return open[0];
}

/** When someone cannot open an area’s home screen, these are tried in order before falling back to the first screen they can open. */
const FALLBACK_LANDING: Partial<Record<Area, string[]>> = { desk: ["invoices", "dues", "members"] };
