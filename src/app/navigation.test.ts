import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DEMO_ACCOUNTS } from "@/app/demoAccounts";
import { landingScreen, menuFor, mobileBar, paletteScreens, raisedAction, screenPath, sidebarFor, tabsFor, visibleScreens } from "@/app/navigation";
import "@/app/screens/all";
import { SCREENS, screensIn } from "@/app/screens";
import { can, type Principal } from "@/domain/permissions";
import { AREAS, areaFor, type Area } from "@/domain/roles";

const principal = (userId: string): Principal => {
  const a = DEMO_ACCOUNTS.find((x) => x.userId === userId)!;
  return { userId: a.userId, role: a.role, tenantId: a.tenantId, branchIds: a.branchIds, memberId: a.memberId, limits: a.limits };
};
const canFor = (userId: string) => (action: Parameters<typeof can>[1]) => can(principal(userId), action);
const titles = (items: Array<{ title: string; label?: string }>) => items.map((s) => s.label ?? s.title);

describe("screen registry matches docs/PLAN.md section 4", () => {
  const plan = readFileSync("docs/PLAN.md", "utf8");
  const section = plan.slice(plan.indexOf("## 4. Feature map by role"), plan.indexOf("### 4.7"));
  const planned = [...section.matchAll(/^\| \*\*(.+?)\*\* \|/gm)].map((m) => m[1]!);
  const registry = new Set(Object.values(SCREENS).flat().map((s) => s.title));

  it("finds the screens listed in the plan", () => {
    expect(planned.length).toBeGreaterThanOrEqual(40);
  });

  it("has a place for every screen the plan lists", () => {
    const missing = planned.filter((t) => !registry.has(t));
    expect(missing).toEqual([]);
  });

  it("uses only requirement IDs that exist in docs/REQUIREMENTS.md", () => {
    const reqs = readFileSync("docs/REQUIREMENTS.md", "utf8");
    const known = new Set([...reqs.matchAll(/\*\*([A-Z]\d{2}) /g)].map((m) => m[1]!));
    for (const s of Object.values(SCREENS).flat()) for (const id of s.req) expect(known.has(id), `${s.title}: ${id}`).toBe(true);
  });

  it("gives every screen a place in navigation and unique ids and paths within its area", () => {
    for (const area of AREAS) {
      const list = SCREENS[area];
      expect(new Set(list.map((s) => s.id)).size, area).toBe(list.length);
      expect(new Set(list.map((s) => s.path)).size, area).toBe(list.length);
      for (const s of list) if (s.place === "sub") expect(list.some((p) => p.id === s.parent), `${area}/${s.id} parent`).toBe(true);
    }
  });
});

describe("member and trainer apps", () => {
  it("shows the member tabs Today, Program, Progress, Bookings, with Me behind the avatar", () => {
    const can = canFor("u_member_arjun");
    expect(titles(tabsFor("member", can))).toEqual(["Today", "Program", "Progress", "Bookings"]);
    expect(titles(menuFor("member", can))).toEqual(["Membership and receipts", "Check-in pass", "Profile, consent and preferences"]);
  });

  it("shows the trainer tabs Today, Clients, Schedule, Library, with Me behind the avatar", () => {
    const can = canFor("u_trainer_meera");
    expect(titles(tabsFor("trainer", can))).toEqual(["Today", "Clients", "Schedule", "Exercises"]);
    expect(titles(menuFor("trainer", can))).toEqual(["Profile and preferences"]);
  });

  it("keeps Reviews inside Progress, not in the avatar menu", () => {
    const can = canFor("u_member_arjun");
    expect(visibleScreens("member", can).filter((s) => s.parent === "progress").map((s) => s.title)).toEqual(["Reviews and check-ins"]);
    expect(screenPath("member", SCREENS.member.find((s) => s.id === "reviews")!)).toBe("/m/progress/reviews");
  });

  it("starts today’s workout when there is one, and opens the check-in pass when there is not", () => {
    expect(raisedAction("member", { date: "2026-11-17", resume: false })).toEqual({ label: "Start today’s workout", to: "/m/workout/2026-11-17" });
    expect(raisedAction("member", { date: "2026-11-17", resume: true })).toEqual({ label: "Continue today’s workout", to: "/m/workout/2026-11-17" });
    expect(raisedAction("member")).toEqual({ label: "Check-in pass", to: "/m/pass" });
    expect(raisedAction("trainer")).toEqual({ label: "Log session", to: "/t/log" });
  });

  it("keeps the sub-pages of the library out of the tab bar", () => {
    const trainer = canFor("u_trainer_meera");
    expect(visibleScreens("trainer", trainer).filter((s) => s.parent === "exercises").map((s) => s.title)).toEqual(["Templates", "Program builder"]);
  });
});

describe("staff consoles", () => {
  const side = (userId: string) => sidebarFor(areaFor(principal(userId).role), canFor(userId)).flatMap((g) => g.items.map((s) => s.title));

  it("gives front desk the desk screens but not finance", () => {
    expect(side("u_desk_andheri")).toEqual(["Check-in", "New member", "Members", "Collect payment", "Bookings", "Dues", "Day close"]);
  });

  it("gives finance the finance screens but not check-in or new member", () => {
    const s = side("u_finance");
    expect(s).toEqual(expect.arrayContaining(["Invoices and payments", "Refunds", "Reconciliation", "Exports", "Members", "Dues", "Collect payment"]));
    expect(s).not.toContain("Check-in");
    expect(s).not.toContain("New member");
  });

  it("gives the owner everything", () => {
    expect(side("u_owner")).toEqual(SCREENS.owner.filter((s) => s.place === "side").map((s) => s.title));
  });

  it("keeps a branch manager out of staff, policies, import, subscription and settings", () => {
    const s = side("u_bm_bandra");
    for (const hidden of ["Staff and roles", "Policies", "Import members", "Subscription", "Settings"]) expect(s).not.toContain(hidden);
    expect(s).toEqual(expect.arrayContaining(["Dashboard", "Reports", "Members", "Branches", "Audit log"]));
  });

  it("gives the platform admin only platform screens", () => {
    expect(side("u_admin")).toEqual(["Tenants", "Support access", "SaaS plans"]);
  });

  it("splits a long sidebar into four bottom-bar items and a More sheet on phones", () => {
    const items = visibleScreens("owner", canFor("u_owner")).filter((s) => s.place === "side");
    const { bar, more } = mobileBar(items);
    expect(bar).toHaveLength(4);
    expect(more.length).toBe(items.length - 4);
    expect(mobileBar(items.slice(0, 3))).toEqual({ bar: items.slice(0, 3), more: [] });
    expect(mobileBar(items.slice(0, 5)).more).toHaveLength(0);
  });

  it("puts check-in, members, bookings and dues in the front desk’s phone bar, and the rest behind More", () => {
    const { bar, more } = mobileBar(sidebarFor("desk", canFor("u_desk_andheri")).flatMap((g) => g.items));
    expect(titles(bar)).toEqual(["Check-in", "Members", "Bookings", "Dues"]);
    expect(titles(more)).toEqual(["New member", "Collect payment", "Day close"]);
  });

  it("lists in the palette only screens the person may open, never ones that need an id", () => {
    for (const userId of ["u_desk_andheri", "u_finance", "u_owner", "u_bm_bandra", "u_admin"]) {
      const area = areaFor(principal(userId).role);
      const list = paletteScreens(area, canFor(userId));
      expect(list.every((s) => !s.path.includes(":")), userId).toBe(true);
      expect(list.every((s) => !s.action || can(principal(userId), s.action)), userId).toBe(true);
    }
  });

  it("builds addresses inside each area", () => {
    expect(screenPath("owner", SCREENS.owner[0]!)).toBe("/owner");
    expect(screenPath("desk", SCREENS.desk.find((s) => s.id === "refunds")!)).toBe("/desk/finance/refunds");
    expect(screenPath("trainer", screensIn("trainer", "tab")[3]!)).toBe("/t/library");
  });
});

describe("every role lands somewhere it may open", () => {
  it("gives each demo login a landing screen it is allowed to open", () => {
    for (const a of DEMO_ACCOUNTS) {
      const area: Area = areaFor(a.role);
      const landing = landingScreen(area, canFor(a.userId));
      expect(landing, `${a.name} (${a.role})`).toBeDefined();
      expect(!landing!.action || can(principal(a.userId), landing!.action), `${a.name} landing`).toBe(true);
    }
  });

  it("lands finance on invoices, not on check-in, which finance cannot open", () => {
    expect(landingScreen("desk", canFor("u_finance"))?.title).toBe("Invoices and payments");
    expect(landingScreen("desk", canFor("u_desk_andheri"))?.title).toBe("Check-in");
    expect(landingScreen("owner", canFor("u_bm_bandra"))?.title).toBe("Dashboard");
  });
});
