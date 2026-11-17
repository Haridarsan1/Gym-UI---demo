import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DEMO_ACCOUNTS } from "@/app/demoAccounts";
import type { Session } from "@/app/session";
import { setNow } from "@/api/clock";
import { isApiError } from "@/api/errors";
import { getToday } from "@/api/member";
import { addProgressPhoto, deleteProgressPhoto, getPhotos, getProgress, getReviews, logMeasurement, markReviewsRead, submitCheckIn } from "@/api/progress";
import { db } from "@/demo/db";
import { resetDemo } from "@/demo";
import { completionTotals } from "@/domain/progress";

const as = (userId: string): Session => {
  const a = DEMO_ACCOUNTS.find((x) => x.userId === userId)!;
  return { userId: a.userId, name: a.name, role: a.role, tenantId: a.tenantId, branchIds: a.branchIds, memberId: a.memberId, limits: a.limits };
};
const code = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (e) {
    return isApiError(e) ? e.code : "other";
  }
  return "resolved";
};
const arjun = as("u_member_arjun");
const priya = as("u_member_priya");
const PIXEL = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

beforeAll(async () => {
  setNow(new Date("2026-11-17T06:30:00.000Z"));
  await resetDemo();
});
afterAll(() => setNow(null));

const setPhotoConsent = async (memberId: string, on: boolean) => {
  await db.consents.where("memberId").equals(memberId).and((c) => c.scope === "photos").delete();
  if (on) await db.consents.add({ id: `cn_${memberId}_photos`, tenantId: "t_pulse", memberId, scope: "photos", grantedAt: "2026-01-01T00:00:00.000Z", noticeVersion: "2026-01", recordedBy: "u_desk_andheri" });
};

describe("the Progress data", () => {
  it("lines every weekly series up with the list of weeks, from the first data to this week", async () => {
    const p = await getProgress(arjun);
    expect(p.today).toBe("2026-11-17");
    expect(p.weeks.at(-1)).toBe("2026-11-16");
    expect(p.weeks.length).toBeGreaterThan(10);
    for (const series of [p.volume.all, p.attendance, p.completion]) expect(series).toHaveLength(p.weeks.length);
    for (const s of Object.values(p.volume.byExercise)) expect(s).toHaveLength(p.weeks.length);
    expect(p.completion.map((w) => w.weekStart)).toEqual(p.weeks);
  });

  it("shows who entered each reading: the trainer by name, the member as You", async () => {
    const p = await getProgress(arjun);
    const weights = p.measurements.filter((m) => m.kind === "weight");
    expect(weights.length).toBeGreaterThanOrEqual(12);
    expect(new Set(weights.map((w) => w.by))).toEqual(new Set(["You", "Meera Joshi"]));
    expect(p.measurements.some((m) => m.kind === "body_fat" && m.method === "Skinfold calipers")).toBe(true);
    expect(p.measurements.every((m) => m.kind !== "progress_photo")).toBe(true);
  });

  it("gives strength as the best set per workout, and includes the trainer’s benchmark tests", async () => {
    const p = await getProgress(arjun);
    const bench = p.strength.find((s) => s.exerciseId === "ex_db_bench")!;
    expect(bench.name).toBe("Dumbbell bench press");
    expect(bench.points.length).toBeGreaterThan(8);
    expect(bench.points.map((x) => x.date)).toEqual([...bench.points.map((x) => x.date)].sort());
    const barbell = p.strength.find((s) => s.exerciseId === "ex_bench_press")!;
    expect(barbell.points.some((x) => x.date === "2026-08-24" && x.value === 50)).toBe(true); // the trainer’s test, 85 days ago
    expect(barbell.points.some((x) => x.date === "2026-10-19" && x.value === 62.5)).toBe(true);
  });

  it("completion follows P03: the weekly numbers add up to the totals the workout rules give", async () => {
    const p = await getProgress(arjun);
    const total = completionTotals(p.completion);
    expect(total.scheduled).toBe(total.completed + total.partial + total.skipped + total.missed);
    expect(total.scheduled).toBeGreaterThan(30);
    expect(total.completionRate).toBeCloseTo(total.completed / total.scheduled, 10);
    const thisWeek = p.completion.at(-1)!;
    expect(thisWeek.scheduled).toBe(0); // only workouts whose dates have passed count, and today’s is not done yet
  });

  it("leaves weeks with no workout as gaps in volume, never zero", async () => {
    const p = await getProgress(arjun);
    expect(p.volume.all.every((v) => v === null || v > 0)).toBe(true);
    expect(p.volume.all.at(-1)).toBeNull(); // nothing finished this week yet
  });

  it("lists personal records newest first, each with the weight it beat", async () => {
    const p = await getProgress(arjun);
    expect(p.records.length).toBeGreaterThan(3);
    expect(p.records.map((r) => r.date)).toEqual([...p.records.map((r) => r.date)].sort().reverse());
    expect(p.records.every((r) => r.loadKg > r.previousKg && r.name !== "Exercise")).toBe(true);
  });

  it("shows goals with a bar towards the target, the target date, and the status", async () => {
    const p = await getProgress(arjun);
    const weight = p.goals.find((g) => g.title === "Reach 78 kg")!;
    expect(weight).toMatchObject({ status: "active", baseline: 82.4, target: 78, unit: "kg", targetDate: "2027-01-05", daysLeft: 49, reached: false });
    expect(weight.fraction).toBeGreaterThan(0.3);
    expect(weight.fraction).toBeLessThan(1);
    const bench = p.goals.find((g) => g.status === "achieved")!;
    expect(bench).toMatchObject({ fraction: 1, achievedOn: "2026-11-05" });
    expect(p.goals.map((g) => g.status)).toEqual(["active", "achieved"]);
  });

  it("is empty, not zero, for a member with little data", async () => {
    const p = await getProgress(as("u_member_sneha"));
    expect(p.records).toEqual([]);
    expect(p.goals).toEqual([]);
    expect(p.strength).toEqual([]);
    expect(p.volume.all.every((v) => v === null)).toBe(true);
  });

  it("is for members only", async () => {
    expect(await code(getProgress(as("u_trainer_meera")))).toBe("forbidden");
    expect(await code(getProgress(null))).toBe("unauthenticated");
  });
});

describe("logging a weight or measurement (P01)", () => {
  it("saves it as entered by the member, with the unit", async () => {
    const r = await logMeasurement(arjun, { kind: "weight", value: 81.4 });
    expect(r).toMatchObject({ repeated: false, reachedGoals: [] });
    const row = (await db.measurements.get(r.id))!;
    expect(row).toMatchObject({ kind: "weight", value: 81.4, unit: "kg", measuredOn: "2026-11-17", source: "member", recordedBy: "u_member_arjun" });
    const p = await getProgress(arjun);
    expect(p.measurements.find((m) => m.id === r.id)).toMatchObject({ by: "You", value: 81.4 });
  });

  it("saves the same reading twice as one", async () => {
    const again = await logMeasurement(arjun, { kind: "weight", value: 81.4 });
    expect(again.repeated).toBe(true);
    expect((await db.measurements.where("memberId").equals("mem_arjun").toArray()).filter((m) => m.kind === "weight" && m.measuredOn === "2026-11-17")).toHaveLength(1);
  });

  it("treats a different value for the same day as a correction that keeps the first row", async () => {
    const fix = await logMeasurement(arjun, { kind: "weight", value: 81.1 });
    const rows = (await db.measurements.where("memberId").equals("mem_arjun").toArray()).filter((m) => m.kind === "weight" && m.measuredOn === "2026-11-17");
    expect(rows).toHaveLength(2);
    expect(rows.find((m) => m.id === fix.id)!.corrects).toBeDefined();
    const today = (await getProgress(arjun)).measurements.filter((m) => m.kind === "weight" && m.measuredOn === "2026-11-17");
    expect(today.map((m) => m.value)).toEqual([81.1]);
  });

  it("records body fat with its method, and an earlier date", async () => {
    const r = await logMeasurement(arjun, { kind: "body_fat", value: 21.8, measuredOn: "2026-11-10", method: " Smart scale " });
    expect(await db.measurements.get(r.id)).toMatchObject({ unit: "%", method: "Smart scale", measuredOn: "2026-11-10" });
  });

  it("says what is wrong and how to fix it", async () => {
    await expect(logMeasurement(arjun, { kind: "weight", value: 8 })).rejects.toThrow("Enter a weight between 20 and 300 kg.");
    await expect(logMeasurement(arjun, { kind: "weight", value: 80, measuredOn: "2026-11-20" })).rejects.toThrow(/can’t be saved for the future/);
    await expect(logMeasurement(arjun, { kind: "weight", value: 80, measuredOn: "2024-01-01" })).rejects.toThrow(/within the last year/);
    expect(await code(logMeasurement(arjun, { kind: "shoe_size" as never, value: 9 }))).toBe("invalid");
  });

  it("is for members only", async () => {
    expect(await code(logMeasurement(as("u_trainer_meera"), { kind: "weight", value: 80 }))).toBe("forbidden");
  });

  it("marks a goal achieved when a reading reaches the target, and keeps a note of how", async () => {
    const r = await logMeasurement(arjun, { kind: "weight", value: 77.9 });
    expect(r.reachedGoals).toEqual([{ id: "goal_mem_arjun_1", title: "Reach 78 kg" }]);
    const goal = (await db.goals.get("goal_mem_arjun_1"))!;
    expect(goal.status).toBe("achieved");
    expect(goal.history.at(-1)).toMatchObject({ by: "u_member_arjun", note: "Reached with a logged weight of 77.9 kg." });
    const view = (await getProgress(arjun)).goals.find((g) => g.id === "goal_mem_arjun_1")!;
    expect(view).toMatchObject({ status: "achieved", fraction: 1, achievedOn: "2026-11-17" });
    // Logging it again reaches nothing new.
    expect((await logMeasurement(arjun, { kind: "weight", value: 77.9 })).reachedGoals).toEqual([]);
  });
});

describe("progress photos need consent (S04)", () => {
  it("says there are no photos, and why, without consent; and refuses to save one", async () => {
    await setPhotoConsent("mem_priya", false);
    expect(await getPhotos(priya)).toEqual({ consent: false, photos: [] });
    await expect(addProgressPhoto(priya, { dataUrl: PIXEL })).rejects.toThrow(/need your consent/);
    expect((await getProgress(priya)).photoConsent).toBe(false);
  });

  it("saves and lists photos with consent, newest first, and the member can remove one", async () => {
    await setPhotoConsent("mem_priya", true);
    expect((await getProgress(priya)).photoConsent).toBe(true);
    const a = await addProgressPhoto(priya, { dataUrl: PIXEL, takenOn: "2026-11-01" });
    const b = await addProgressPhoto(priya, { dataUrl: PIXEL });
    const { consent, photos } = await getPhotos(priya);
    expect(consent).toBe(true);
    expect(photos.map((x) => x.id)).toEqual([b.id, a.id]);
    expect(await db.measurements.get(a.id)).toMatchObject({ kind: "progress_photo", source: "member", recordedBy: "u_member_priya" });
    await deleteProgressPhoto(priya, a.id);
    expect((await getPhotos(priya)).photos.map((x) => x.id)).toEqual([b.id]);
  });

  it("does not write an audit event for a member looking at their own photos", async () => {
    const before = await db.auditEvents.count();
    await getPhotos(priya);
    expect(await db.auditEvents.count()).toBe(before);
  });

  it("refuses what is not a small image, and a photo dated in the future", async () => {
    expect(await code(addProgressPhoto(priya, { dataUrl: "data:text/html;base64,PGI+" }))).toBe("invalid");
    expect(await code(addProgressPhoto(priya, { dataUrl: "javascript:alert(1)" }))).toBe("invalid");
    expect(await code(addProgressPhoto(priya, { dataUrl: PIXEL, takenOn: "2026-12-01" }))).toBe("invalid");
  });

  it("will not let one member remove another’s photo", async () => {
    const mine = (await getPhotos(priya)).photos[0]!;
    expect(await code(deleteProgressPhoto(arjun, mine.id))).toBe("not_found");
  });

  it("does not show photos again once consent is withdrawn", async () => {
    await setPhotoConsent("mem_priya", false);
    expect((await getPhotos(priya)).photos).toEqual([]);
  });
});

describe("reviews and check-ins (P04, T06)", () => {
  it("lists shared reviews newest first, flags unread ones, and never shows private notes", async () => {
    const { reviews } = await getReviews(arjun);
    expect(reviews.map((r) => r.unread)).toEqual([true, false]);
    expect(reviews[0]).toMatchObject({ trainerName: "Meera Joshi" });
    expect(reviews[0]!.body).toMatch(/^New plan is live from/);
    expect(JSON.stringify(reviews)).not.toMatch(/shoulder a little tight/);
    expect(reviews.map((r) => r.createdAt)).toEqual([...reviews.map((r) => r.createdAt)].sort().reverse());
  });

  it("marks them read, which clears the card on Today", async () => {
    expect((await getToday(arjun)).newReview).toBeDefined();
    expect(await markReviewsRead(arjun)).toBe(1);
    expect(await markReviewsRead(arjun)).toBe(0);
    expect((await getToday(arjun)).newReview).toBeUndefined();
    expect((await getReviews(arjun)).reviews.every((r) => !r.unread)).toBe(true);
  });

  it("saves a check-in with effort, recovery and obstacles, once for each key", async () => {
    const a = await submitCheckIn(arjun, { key: "chk-key-0001", effort: 8, recovery: 3, obstacles: "  Knee felt tight  " });
    expect(a).toMatchObject({ effort: 8, recovery: 3, obstacles: "Knee felt tight" });
    const again = await submitCheckIn(arjun, { key: "chk-key-0001", effort: 2 });
    expect(again.id).toBe(a.id);
    expect(again.effort).toBe(8);
    const { checkIns } = await getReviews(arjun);
    expect(checkIns.filter((c) => c.id === a.id)).toHaveLength(1);
    expect(checkIns[0]!.id).toBe(a.id);
    expect(await db.trainerReviews.get(a.id)).toMatchObject({ kind: "member_checkin", authorId: "u_member_arjun" });
  });

  it("needs at least one answer, and a number on the scale", async () => {
    await expect(submitCheckIn(arjun, { key: "chk-key-0002" })).rejects.toThrow(/how hard it felt/);
    expect(await code(submitCheckIn(arjun, { key: "chk-key-0003", effort: 11 }))).toBe("invalid");
    expect(await code(submitCheckIn(arjun, { key: "chk-key-0004", recovery: 0 }))).toBe("invalid");
    expect(await code(submitCheckIn(as("u_trainer_meera"), { key: "chk-key-0005", effort: 5 }))).toBe("forbidden");
  });

  it("shows a member only their own check-ins and reviews", async () => {
    const mine = await getReviews(priya);
    expect(mine.reviews).toHaveLength(1);
    expect(mine.checkIns).toEqual([]);
  });
});
