import { describe, expect, it } from "vitest";
import { expiringCredits, recentMissed, reviewDue, sessionPhases } from "@/domain/trainerToday";
import type { WorkoutPlanVersion } from "@/domain/types";

const TODAY = "2026-11-17";
const review = (kind: "shared_review" | "private_note" | "member_checkin", date: string, followUpOn?: string) => ({ kind, createdAt: `${date}T12:00:00.000Z`, followUpOn });

describe("reviewDue", () => {
  it("is due four weeks after the newest shared review", () => {
    const d = reviewDue([review("shared_review", "2026-10-01")], "2026-09-01", TODAY);
    expect(d).toMatchObject({ dueOn: "2026-10-29", daysOver: 19, overdue: true, why: "cadence" });
  });
  it("uses the follow-up date when the newest review set one", () => {
    expect(reviewDue([review("shared_review", "2026-11-10", "2026-11-24")], "2026-09-01", TODAY)).toMatchObject({ dueOn: "2026-11-24", overdue: false, daysOver: 0, why: "follow-up" });
    expect(reviewDue([review("shared_review", "2026-11-01", "2026-11-15")], "2026-09-01", TODAY)).toMatchObject({ overdue: true, daysOver: 2 });
  });
  it("a newer review without a follow-up replaces an older follow-up date", () => {
    const d = reviewDue([review("shared_review", "2026-10-01", "2026-10-15"), review("shared_review", "2026-11-16")], "2026-09-01", TODAY);
    expect(d).toMatchObject({ dueOn: "2026-12-14", overdue: false });
  });
  it("ignores private notes and the member’s own check-ins", () => {
    const d = reviewDue([review("private_note", "2026-11-15"), review("member_checkin", "2026-11-16")], "2026-09-01", TODAY);
    expect(d).toMatchObject({ dueOn: "2026-09-29", why: "first", overdue: true });
  });
  it("is not overdue on the due date itself", () => {
    expect(reviewDue([review("shared_review", "2026-10-20")], "2026-09-01", TODAY).overdue).toBe(false);
  });
});

const plan = (startsOn: string): WorkoutPlanVersion => ({
  id: "v1", tenantId: "t", memberId: "m", programId: "p", versionNumber: 1, name: "P", status: "published", startsOn, authorId: "u",
  days: [0, 2, 4].map((offset, i) => ({ dayOffset: offset, weekIndex: 0, dayIndex: i, title: "Day", canceled: false, prescriptions: [] })).concat(
    [7, 9, 11].map((offset, i) => ({ dayOffset: offset, weekIndex: 1, dayIndex: i, title: "Day", canceled: false, prescriptions: [] })),
  ),
});

describe("recentMissed", () => {
  // 2026-11-09 is a Monday. Workouts on 9, 11, 13 and 16, 18, 20.
  const v = [plan("2026-11-09")];
  it("counts scheduled days in the last seven days with nothing logged", () => {
    const r = recentMissed(v, [{ scheduledOn: "2026-11-11", status: "completed" }], [], TODAY);
    expect(r).toMatchObject({ missed: 2, scheduled: 3, lastMissedOn: "2026-11-16", lastDoneOn: "2026-11-11" });
  });
  it("does not count a skipped workout, which is the member’s choice", () => {
    const r = recentMissed(v, [{ scheduledOn: "2026-11-11", status: "completed" }, { scheduledOn: "2026-11-13", status: "skipped" }, { scheduledOn: "2026-11-16", status: "completed" }], [], TODAY);
    expect(r.missed).toBe(0);
  });
  it("does not count days inside a freeze", () => {
    const r = recentMissed(v, [], [{ from: "2026-11-10", to: "2026-11-30", reason: "Travel" }], TODAY);
    expect(r).toMatchObject({ missed: 0, scheduled: 0 });
  });
  it("does not count today or older than a week", () => {
    expect(recentMissed(v, [], [], "2026-11-10").missed).toBe(1); // only the 9th is inside 3 to 9 Nov
  });
});

describe("expiringCredits", () => {
  const purchase = (id: string, credits: number, expiresOn: string) => ({ id, kind: "purchase" as const, credits, expiresOn });
  it("flags unused credits from a pack that ends within two weeks", () => {
    expect(expiringCredits([purchase("a", 6, "2026-11-30")], 4, TODAY)).toEqual({ credits: 4, expiresOn: "2026-11-30", daysLeft: 13 });
  });
  it("never flags more than the member still has", () => {
    expect(expiringCredits([purchase("a", 6, "2026-11-20")], 2, TODAY)?.credits).toBe(2);
  });
  it("ignores packs far away, packs already gone, and members with nothing left", () => {
    expect(expiringCredits([purchase("a", 6, "2026-12-02")], 4, TODAY)).toBeUndefined();
    expect(expiringCredits([purchase("a", 6, "2026-11-16")], 4, TODAY)).toBeUndefined();
    expect(expiringCredits([purchase("a", 6, "2026-11-20")], 0, TODAY)).toBeUndefined();
  });
});

describe("sessionPhases", () => {
  const s = (start: string, end: string, status: "booked" | "attended" | "no_show" = "booked") => ({ startsAt: `2026-11-17T${start}:00.000Z`, endsAt: `2026-11-17T${end}:00.000Z`, status });
  it("marks the first session still to come as next, then later, and the one running as now", () => {
    const phases = sessionPhases([s("01:30", "02:30", "attended"), s("05:30", "06:30"), s("06:30", "07:30"), s("11:30", "12:30"), s("12:30", "13:30")], "2026-11-17T06:45:00.000Z");
    expect(phases).toEqual(["done", "unmarked", "now", "next", "later"]);
  });
});
