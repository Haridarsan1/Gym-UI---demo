import { describe, expect, it } from "vitest";
import { checkInDecision, SCAN_WINDOW_MINUTES, whyNotValid, type DecisionInput } from "@/domain/checkin";

const base = { status: "active" as const, startsOn: "2026-11-01", endsOn: "2026-12-01", visitsRemaining: null, terms: { kind: "time" as const, branchIds: ["b1", "b2"] } };
const input = (over: Partial<DecisionInput> = {}): DecisionInput => ({ membership: base, branchId: "b1", today: "2026-11-17", nowIso: "2026-11-17T01:30:00.000Z", recent: [], ...over });

describe("who can check in (M05)", () => {
  it("lets an active member in without using a visit on a time plan", () => {
    expect(checkInDecision(input())).toEqual({ result: "allowed", visitDebited: false, inGrace: false });
  });
  it("flags open dues but still lets the member in", () => {
    expect(checkInDecision(input({ hasOpenDues: true })).result).toBe("allowed_with_dues");
  });
  it("uses one visit on a visit pass, and refuses when none is left", () => {
    const pass = { ...base, terms: { kind: "visit" as const, branchIds: ["b1"] } };
    expect(checkInDecision(input({ membership: { ...pass, visitsRemaining: 4 } })).visitDebited).toBe(true);
    expect(checkInDecision(input({ membership: { ...pass, visitsRemaining: 0 } }))).toMatchObject({ result: "denied", reason: "no_visits", visitDebited: false });
  });
  it("checks the branch", () => {
    expect(checkInDecision(input({ branchId: "b3" }))).toMatchObject({ result: "denied", reason: "branch" });
  });
  it("gives a reason for each membership state that can’t enter", () => {
    const why = (m: Partial<typeof base> | undefined) => whyNotValid(m ? { ...base, ...m } : undefined, "2026-11-17")?.reason;
    expect(why(undefined)).toBe("no_membership");
    expect(why({ status: "pending" as never })).toBe("pending");
    expect(why({ status: "scheduled" as never })).toBe("scheduled");
    expect(why({ status: "frozen" as never })).toBe("frozen");
    expect(why({ status: "canceled" as never })).toBe("canceled");
    expect(why({ status: "expired" as never })).toBe("expired");
    expect(why({ endsOn: "2026-11-10" })).toBe("expired"); // active in name, but past its end date
    expect(why({})).toBeUndefined();
  });
  it("lets a member in during a grace period and says so", () => {
    const grace = { ...base, endsOn: "2026-11-15", graceUntil: "2026-11-20" };
    expect(checkInDecision(input({ membership: grace }))).toMatchObject({ result: "allowed", inGrace: true });
    expect(checkInDecision(input({ membership: { ...grace, graceUntil: "2026-11-16" } })).reason).toBe("expired");
  });
});

describe("repeat scans (M05)", () => {
  const earlier = (minutesAgo: number, branchId = "b1", result: "allowed" | "denied" = "allowed") => ({ at: new Date(Date.parse("2026-11-17T01:30:00.000Z") - minutesAgo * 60_000).toISOString(), result, branchId });
  it("is a repeat inside the window: recorded, lets the member through, uses no second visit", () => {
    const pass = { ...base, visitsRemaining: 4, terms: { kind: "visit" as const, branchIds: ["b1"] } };
    expect(checkInDecision(input({ membership: pass, recent: [earlier(SCAN_WINDOW_MINUTES - 1)] }))).toEqual({ result: "repeat_scan", visitDebited: false });
  });
  it("is a new visit once the window has passed, at another branch, or after a denied scan", () => {
    expect(checkInDecision(input({ recent: [earlier(SCAN_WINDOW_MINUTES + 1)] })).result).toBe("allowed");
    expect(checkInDecision(input({ recent: [earlier(2, "b2")] })).result).toBe("allowed");
    expect(checkInDecision(input({ recent: [earlier(2, "b1", "denied")] })).result).toBe("allowed");
  });
  it("a repeat of a repeat doesn’t extend the window", () => {
    expect(checkInDecision(input({ recent: [{ at: "2026-11-17T01:29:00.000Z", result: "repeat_scan", branchId: "b1" }] })).result).toBe("allowed");
  });
});
