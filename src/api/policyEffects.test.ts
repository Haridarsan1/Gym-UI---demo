import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { DEMO_ACCOUNTS } from "@/app/demoAccounts";
import type { Session } from "@/app/session";
import { setNow } from "@/api/clock";
import { checkInMember } from "@/api/checkin";
import { getDues, sendReminder } from "@/api/dues";
import { isApiError } from "@/api/errors";
import { resetDemo } from "@/demo";
import { db } from "@/demo/db";

const desk: Session = (() => { const a = DEMO_ACCOUNTS.find((x) => x.userId === "u_desk_andheri")!; return { userId: a.userId, name: a.name, role: a.role, tenantId: a.tenantId, branchIds: a.branchIds, limits: a.limits }; })();
const T0 = new Date("2026-11-17T06:30:00.000Z");
let n = 0;
const key = () => `pe-${++n}-${Math.random().toString(36).slice(2)}`;
const setPolicy = async (patch: Record<string, number>) => { const row = (await db.gymPolicies.toArray())[0]!; await db.gymPolicies.update(row.id, patch); };
const scan = () => checkInMember(desk, { memberId: "mem_sneha", branchId: "br_andheri", method: "desk", key: key() });

beforeEach(async () => { setNow(T0); await resetDemo(); });
afterAll(() => setNow(null));

describe("policies that were constants: the repeat-scan window and the reminder gap", () => {
  it("starts at the values the gym had: ten minutes and three days", async () => {
    const p = (await db.gymPolicies.toArray())[0]!;
    expect(p).toMatchObject({ repeatScanWindowMinutes: 10, reminderGapDays: 3, graceDays: 0 });
  });

  it("a second scan inside the window is a repeat, and the window is the gym’s to set", async () => {
    expect((await scan()).result).toMatch(/^allowed/);
    setNow(new Date(T0.getTime() + 11 * 60_000));
    expect((await scan()).result).toMatch(/^allowed/); // past ten minutes: a fresh entry
    await setPolicy({ repeatScanWindowMinutes: 30 });
    setNow(new Date(T0.getTime() + 25 * 60_000));
    expect((await scan()).result).toBe("repeat_scan"); // 14 minutes after the second entry, inside thirty
    setNow(new Date(T0.getTime() + 45 * 60_000));
    expect((await scan()).result).toMatch(/^allowed/); // 34 minutes on: outside it
  });

  it("a reminder can go again after the gym’s gap, not before", async () => {
    const row = (await getDues(desk)).rows.find((r) => r.lastReminderAt === undefined)!;
    await sendReminder(desk, { invoiceId: row.invoiceId });
    setNow(new Date(T0.getTime() + 25 * 3_600_000));
    expect(await sendReminder(desk, { invoiceId: row.invoiceId }).catch((e) => (isApiError(e) ? e.message : "other"))).toMatch(/^A reminder went on/); // one day on, gap is three
    await setPolicy({ reminderGapDays: 1 });
    await expect(sendReminder(desk, { invoiceId: row.invoiceId })).resolves.toMatchObject({ skipped: expect.any(Boolean) });
  });
});
