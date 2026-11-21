import { describe, expect, it } from "vitest";
import { onboardingSteps, tenantHealth, validateSaasPlan, validateSupportRequest } from "@/domain/platform";
import { subscriptionStatus } from "@/domain/subscription";

const today = "2026-11-17";
const st = (over: Parameters<typeof subscriptionStatus>[0]) => subscriptionStatus(over, "Pulse Fitness", today);

describe("subscription status", () => {
  it("paid and trial are fully open", () => {
    expect(st({ state: "paid" })).toMatchObject({ effective: "paid", access: "full" });
    expect(st({ state: "trial", trialEndsAt: "2026-11-29T04:30:00.000Z" })).toMatchObject({ effective: "trial", access: "full" });
  });
  it("overdue keeps everything working through its grace period, says so, then becomes read-only", () => {
    const a = st({ state: "past_due", pastDueSince: "2026-11-15" });
    expect(a).toMatchObject({ effective: "past_due", access: "full", graceEndsOn: "2026-11-22" });
    expect(a.banner!.body).toMatch(/keeps working until 22 Nov 2026/);
    expect(st({ state: "past_due", pastDueSince: "2026-11-09" })).toMatchObject({ effective: "suspended", access: "readonly" });
    expect(subscriptionStatus({ state: "past_due", pastDueSince: "2026-11-09" }, "Pulse Fitness", "2026-11-17").note).toMatch(/read-only because its subscription is overdue past its grace period/);
  });
  it("suspended is read-only with downloads; canceled is downloads only for 30 days", () => {
    expect(st({ state: "suspended" })).toMatchObject({ effective: "suspended", access: "readonly", banner: { tone: "danger", title: "This gym is read-only" } });
    expect(st({ state: "canceled", canceledOn: "2026-11-10" })).toMatchObject({ effective: "canceled", access: "export_only", exportUntil: "2026-12-10" });
    expect(st({ state: "canceled", canceledOn: "2026-11-10" }).note).toMatch(/only downloads are available.*10 Dec 2026/);
  });
  it("a trial that has run out is overdue from the next day, then read-only", () => {
    expect(st({ state: "trial", trialEndsAt: "2026-11-16T04:30:00.000Z" })).toMatchObject({ effective: "past_due", access: "full", graceEndsOn: "2026-11-24" });
    expect(st({ state: "trial", trialEndsAt: "2026-11-16T04:30:00.000Z" }).banner!.title).toBe("Your free trial has ended");
    expect(st({ state: "trial", trialEndsAt: "2026-11-01T04:30:00.000Z" })).toMatchObject({ effective: "suspended", access: "readonly" });
  });
});

describe("health and onboarding", () => {
  const base = { status: st({ state: "paid" }), usage: [{ label: "Branches", level: "ok" as const }], lastActivityOn: "2026-11-16", onboardingPercent: 100, createdOn: "2026-01-01", today };
  it("a paid gym with room and activity is healthy; each concern is said", () => {
    expect(tenantHealth(base)).toEqual({ level: "good", reasons: [] });
    expect(tenantHealth({ ...base, usage: [{ label: "Branches", level: "full" }, { label: "Staff accounts", level: "near" }] })).toEqual({ level: "watch", reasons: ["Branches are at the plan’s limit", "Staff accounts are close to the plan’s limit"] });
    expect(tenantHealth({ ...base, lastActivityOn: "2026-10-20" }).reasons).toEqual(["Nothing has happened for 28 days"]);
    expect(tenantHealth({ ...base, onboardingPercent: 50 }).reasons).toEqual(["Set-up isn’t finished"]);
    expect(tenantHealth({ ...base, status: st({ state: "trial", trialEndsAt: "2026-11-20T04:30:00.000Z" }), trialEndsOn: "2026-11-20" }).reasons).toEqual(["The trial ends in 3 days"]);
  });
  it("suspended, canceled and overdue are at risk", () => {
    expect(tenantHealth({ ...base, status: st({ state: "suspended" }) })).toEqual({ level: "risk", reasons: ["Suspended: the gym is read-only"] });
    expect(tenantHealth({ ...base, status: st({ state: "canceled", canceledOn: today }) }).level).toBe("risk");
    expect(tenantHealth({ ...base, status: st({ state: "past_due", pastDueSince: "2026-11-15" }) }).reasons[0]).toBe("Payment is overdue, grace ends 2026-11-22");
  });
  it("onboarding counts the four steps of S01", () => {
    expect(onboardingSteps({ ownerInvited: false, branchesConfigured: false, membersImported: false }).percent).toBe(25);
    expect(onboardingSteps({ ownerInvited: true, branchesConfigured: true, membersImported: false })).toMatchObject({ percent: 75 });
    expect(onboardingSteps({ ownerInvited: true, branchesConfigured: true, membersImported: true }).steps.every((s) => s.done)).toBe(true);
  });
});

describe("requests and plans", () => {
  it("a support request needs the gym, a reason the owner can read and one of the durations", () => {
    expect(validateSupportRequest({ tenantId: "t", reason: "Fix the import", minutes: 30 })).toEqual({});
    expect(validateSupportRequest({ tenantId: "", reason: "short", minutes: 45 })).toEqual({ tenantId: "Choose the gym.", reason: "Say why you need access, in at least 10 characters. The gym’s owner can read it.", minutes: "Choose 15, 30, 60, 120 minutes." });
  });
  it("a plan needs a name and features; an empty limit is no limit", () => {
    const d = { name: "Studio", monthlyRupees: "1999", branches: "1", staff: "", activeMembers: "50", features: ["memberships"], blurb: "" };
    expect(validateSaasPlan(d, ["Growth"])).toEqual({});
    expect(validateSaasPlan({ ...d, name: "growth", branches: "0", staff: "x", monthlyRupees: "12.345", features: [] }, ["Growth"])).toEqual({
      name: "Another plan has this name.", branches: "Enter a whole number above 0, or leave it empty for no limit.", staff: "Enter a whole number above 0, or leave it empty for no limit.",
      monthlyRupees: "Enter the monthly price in rupees before GST, or leave it empty for “agreed with Ember”.", features: "Choose at least one feature.",
    });
  });
});
