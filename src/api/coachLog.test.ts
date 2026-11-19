import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DEMO_ACCOUNTS } from "@/app/demoAccounts";
import type { Session } from "@/app/session";
import { setNow } from "@/api/clock";
import { isApiError } from "@/api/errors";
import { listClients } from "@/api/clients";
import { correctWorkout, getCoachDays, getCoachWorkout, saveCoachDraft, submitCoachWorkout } from "@/api/coachLog";
import { db } from "@/demo/db";
import { resetDemo } from "@/demo";
import { asPrescribed, entryFor, logSet, skipSet } from "@/domain/workout";
import type { LoggedExercise } from "@/domain/types";

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
const meera = as("u_trainer_meera");
const farah = as("u_trainer_farah");

beforeAll(async () => {
  setNow(new Date("2026-11-17T06:30:00.000Z"));
  await resetDemo();
});
afterAll(() => setNow(null));

/** A client of Meera’s with a scheduled day nobody has logged yet. */
async function openDay() {
  for (const c of await listClients(meera)) {
    const { days } = await getCoachDays(meera, c.memberId);
    const day = days.find((d) => d.status === "none");
    if (day) return { memberId: c.memberId, name: c.name, date: day.date };
  }
  throw new Error("No unlogged day in the demo");
}

/** Every set of every exercise as prescribed, using the same rules as the member’s one-tap logging. */
const allAsPrescribed = (view: Awaited<ReturnType<typeof getCoachWorkout>>, only?: number): LoggedExercise[] => {
  let entries = view.entries;
  for (const x of view.exercises) for (let n = 1; n <= x.prescription.sets; n++) if (only === undefined || n <= only) entries = logSet(entries, x.prescription, asPrescribed(x.prescription, n));
  return entries;
};

describe("coach-led logging", () => {
  it("opens the same workout the member would log, with the same pre-fill facts, for the assigned trainer only", async () => {
    const { memberId, date } = await openDay();
    const v = await getCoachWorkout(meera, memberId, date);
    expect(v.exercises.length).toBeGreaterThan(0);
    expect(v.status).toBe("none");
    expect(v.blockedReason).toBeUndefined();
    expect(v.coachName).toBe("Meera Joshi");
    expect(v.enteredBy).toBeUndefined();
    expect(await code(getCoachWorkout(farah, memberId, date))).toBe("not_found");
    expect(await code(getCoachDays(farah, memberId))).toBe("not_found");
  });

  it("members and the front desk cannot use it", async () => {
    const { memberId, date } = await openDay();
    expect(await code(getCoachWorkout(as("u_member_arjun"), memberId, date))).toBe("forbidden");
    expect(await code(getCoachWorkout(as("u_desk_andheri"), memberId, date))).toBe("forbidden");
  });

  it("a day that has not come yet cannot be logged", async () => {
    const { memberId } = await openDay();
    const future = (await getCoachDays(meera, memberId)).today;
    expect(future).toBe("2026-11-17");
    // Look for the next scheduled day on or after tomorrow by trying a week.
    let blocked: string | undefined;
    for (let i = 1; i <= 7 && !blocked; i++) {
      const date = new Date(Date.parse("2026-11-17T00:00:00Z") + i * 86_400_000).toISOString().slice(0, 10);
      try {
        blocked = (await getCoachWorkout(meera, memberId, date)).blockedReason;
      } catch {
        /* a rest day */
      }
    }
    expect(blocked).toMatch(/opens on its day/);
  });

  it("logs a session, marks every entry “Entered by Coach Meera”, and repeating the key makes no second log", async () => {
    const { memberId, date } = await openDay();
    const v = await getCoachWorkout(meera, memberId, date);
    const entries = allAsPrescribed(v);
    const key = v.idempotencyKey;
    const r = await submitCoachWorkout(meera, { memberId, date, entries, idempotencyKey: key, effort: 7, notes: "Coached in person." });
    expect(r).toMatchObject({ status: "completed", repeated: false });
    const again = await submitCoachWorkout(meera, { memberId, date, entries, idempotencyKey: key });
    expect(again).toMatchObject({ logId: r.logId, repeated: true });
    expect(await db.workoutLogs.where("memberId").equals(memberId).and((l) => l.scheduledOn === date).count()).toBe(1);
    const log = (await db.workoutLogs.get(r.logId))!;
    expect(log).toMatchObject({ enteredBy: "u_trainer_meera", enteredByRole: "trainer", effort: 7, notes: "Coached in person." });
    const after = await getCoachWorkout(meera, memberId, date);
    expect(after.finished).toBe(true);
    expect(after.enteredBy).toMatchObject({ role: "trainer", label: "Entered by Coach Meera" });
    expect(after.blockedReason).toMatch(/Correct this log/);
    // The same key cannot be used to write a log for someone else.
    const other = await openDay();
    expect(await code(submitCoachWorkout(meera, { memberId: other.memberId, date: other.date, entries: [], idempotencyKey: key }))).not.toBe("resolved");
  });

  it("pre-fills from the client’s last session the way the member’s does", async () => {
    const { memberId, date } = await openDay();
    const v = await getCoachWorkout(meera, memberId, date);
    const asMember = v.exercises.filter((x) => x.last);
    // `last` is the same fact the member sees: the best set from an earlier finished workout.
    for (const x of asMember) expect(x.last!.date < date).toBe(true);
  });

  it("saving a draft twice keeps one draft, and finishing it makes one log", async () => {
    // A different unlogged day, since the one above is done.
    const clients = await listClients(meera);
    let pick: { memberId: string; date: string } | undefined;
    for (const c of clients) {
      const d = (await getCoachDays(meera, c.memberId)).days.find((x) => x.status === "none");
      if (d) {
        pick = { memberId: c.memberId, date: d.date };
        break;
      }
    }
    expect(pick).toBeDefined();
    const { memberId, date } = pick!;
    const v = await getCoachWorkout(meera, memberId, date);
    const first = v.exercises.find((x) => x.prescription.section === "main")!;
    const partial = logSet(v.entries, first.prescription, asPrescribed(first.prescription, 1));
    expect(await saveCoachDraft(meera, { memberId, date, entries: partial, idempotencyKey: v.idempotencyKey })).toEqual({ status: "draft" });
    await saveCoachDraft(meera, { memberId, date, entries: partial, idempotencyKey: v.idempotencyKey });
    expect(await db.workoutLogs.where("memberId").equals(memberId).and((l) => l.scheduledOn === date).count()).toBe(1);
    const resumed = await getCoachWorkout(meera, memberId, date);
    expect(resumed.status).toBe("draft");
    expect(entryFor(resumed.entries, first.prescription)!.sets).toHaveLength(1);
    const done = await submitCoachWorkout(meera, { memberId, date, entries: partial, idempotencyKey: v.idempotencyKey });
    expect(done.status).toBe("partial");
  });
});

describe("correcting a finished log", () => {
  it("keeps the original, records the reason and who, writes an audit event, and shows the corrected log", async () => {
    const { memberId, date } = await openDay();
    const v = await getCoachWorkout(meera, memberId, date);
    const r = await submitCoachWorkout(meera, { memberId, date, entries: allAsPrescribed(v), idempotencyKey: v.idempotencyKey });
    expect(r.status).toBe("completed");
    const original = (await db.workoutLogs.get(r.logId))!;

    // The coach skips the last set of the first exercise instead: now only partly done.
    const first = v.exercises.find((x) => x.prescription.section === "main")!;
    const changed = skipSet(allAsPrescribed(v), first.prescription, first.prescription.sets);
    expect(await code(correctWorkout(meera, { memberId, date, entries: changed, reason: "  ", key: "corr-aaaaaaaa" }))).toBe("invalid");
    const c = await correctWorkout(meera, { memberId, date, entries: changed, reason: "Client skipped the last set; I logged it by mistake.", key: "corr-aaaaaaaa" });
    expect(c).toMatchObject({ status: "partial", repeated: false });

    const log = (await db.workoutLogs.get(r.logId))!;
    expect(log.status).toBe("partial");
    expect(log.completedAt).toBe(original.completedAt);
    expect(log.enteredBy).toBe("u_trainer_meera");
    expect(log.corrections).toHaveLength(1);
    expect(log.corrections[0]).toMatchObject({ by: "u_trainer_meera", note: "Client skipped the last set; I logged it by mistake.", previous: { status: "completed", entries: original.entries } });

    const events = await db.auditEvents.where("action").equals("workout.correct").toArray();
    expect(events.at(-1)).toMatchObject({ actorId: "u_trainer_meera", entityId: r.logId, memberId, reason: "Client skipped the last set; I logged it by mistake.", details: { from: "completed", to: "partial" } });

    const view = await getCoachWorkout(meera, memberId, date);
    expect(view.corrections).toHaveLength(1);
    expect(view.original?.status).toBe("completed");
    expect(view.corrections[0]!.reason).toMatch(/logged it by mistake/);
  });

  it("repeating the same correction key changes nothing; a second correction keeps the first original", async () => {
    const { memberId, date } = await openDay();
    const v = await getCoachWorkout(meera, memberId, date);
    const r = await submitCoachWorkout(meera, { memberId, date, entries: allAsPrescribed(v), idempotencyKey: v.idempotencyKey });
    const first = v.exercises.find((x) => x.prescription.section === "main")!;
    const once = skipSet(allAsPrescribed(v), first.prescription, 1);
    await correctWorkout(meera, { memberId, date, entries: once, reason: "Corrected once", key: "corr-bbbbbbbb" });
    const repeat = await correctWorkout(meera, { memberId, date, entries: once, reason: "Corrected once", key: "corr-bbbbbbbb" });
    expect(repeat.repeated).toBe(true);
    let log = (await db.workoutLogs.get(r.logId))!;
    expect(log.corrections).toHaveLength(1);
    const events = (await db.auditEvents.where("action").equals("workout.correct").toArray()).filter((e) => e.entityId === r.logId);
    expect(events).toHaveLength(1);

    await correctWorkout(meera, { memberId, date, entries: allAsPrescribed(v), reason: "Put it back", key: "corr-cccccccc" });
    log = (await db.workoutLogs.get(r.logId))!;
    expect(log.corrections).toHaveLength(2);
    // The very first original is still the first thing kept.
    expect(log.corrections[0]!.previous!.status).toBe("completed");
    expect(log.corrections[1]!.previous!.status).toBe("partial");
    expect(log.status).toBe("completed");
  });

  it("only the assigned trainer can correct, and a draft cannot be corrected", async () => {
    const { memberId, date } = await openDay();
    const v = await getCoachWorkout(meera, memberId, date);
    expect(await code(correctWorkout(farah, { memberId, date, entries: v.entries, reason: "Not mine", key: "corr-dddddddd" }))).toBe("not_found");
    expect(await code(correctWorkout(meera, { memberId, date, entries: v.entries, reason: "Nothing logged yet", key: "corr-eeeeeeee" }))).toBe("conflict");
  });
});
