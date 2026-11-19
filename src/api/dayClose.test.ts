import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { DEMO_ACCOUNTS } from "@/app/demoAccounts";
import type { Session } from "@/app/session";
import { setNow } from "@/api/clock";
import { isApiError } from "@/api/errors";
import { closeDay, getDayClose, reopenDay } from "@/api/dayClose";
import { collectPayment } from "@/api/payments";
import { resetDemo } from "@/demo";
import { db } from "@/demo/db";
import { amountDuePaise } from "@/domain/billing";

const as = (userId: string): Session => {
  const a = DEMO_ACCOUNTS.find((x) => x.userId === userId)!;
  return { userId: a.userId, name: a.name, role: a.role, tenantId: a.tenantId, branchIds: a.branchIds, memberId: a.memberId, limits: a.limits };
};
const err = async (p: Promise<unknown>) => { try { await p; } catch (e) { return isApiError(e) ? { code: e.code, message: e.message } : { code: "other", message: String(e) }; } return { code: "resolved", message: "" }; };
const desk = as("u_desk_andheri");
const finance = as("u_finance");
const owner = as("u_owner");
const TODAY = "2026-11-17";
let n = 0;
const key = () => `dc-${++n}-${Math.random().toString(36).slice(2)}`;

/** Pays the whole balance of the `skip`th open invoice at Andheri (this gym takes full payments), and says how much that was. */
async function take(method: "cash" | "upi" = "cash", skip = 0): Promise<number> {
  const open = (await db.invoices.toArray()).filter((i) => i.branchId === "br_andheri" && (i.status === "open" || i.status === "partially_paid")).sort((a, b) => a.id.localeCompare(b.id));
  const invoice = open[skip]!;
  const due = amountDuePaise(invoice, await db.payments.where("invoiceId").equals(invoice.id).toArray());
  await collectPayment(desk, { invoiceId: invoice.id, method, amountPaise: due, key: key() });
  return due;
}

beforeEach(async () => { setNow(new Date("2026-11-17T06:30:00.000Z")); await resetDemo(); });
afterAll(() => setNow(null));

describe("the cash day close", () => {
  it("expects the cash taken today, not card or UPI, and lists each payment", async () => {
    const before = await getDayClose(desk, { branchId: "br_andheri" });
    const cash = await take("cash", 0);
    await take("upi", 1);
    const d = await getDayClose(desk, { branchId: "br_andheri" });
    expect(d.expectedPaise - before.expectedPaise).toBe(cash);
    expect(d.payments.length - before.payments.length).toBe(1);
    expect(d.close).toBeUndefined();
  });

  it("closes with a variance only when the note says why, records the difference and audits it", async () => {
    await take();
    const d = await getDayClose(desk, { branchId: "br_andheri" });
    const short = d.expectedPaise - 20_000;
    expect((await err(closeDay(desk, { branchId: "br_andheri", date: TODAY, countedPaise: short, note: "" }))).message).toBe("The count is different from what we expected. Add a note that says why.");
    const row = await closeDay(desk, { branchId: "br_andheri", date: TODAY, countedPaise: short, note: "Change given to a member" });
    expect(row).toMatchObject({ status: "closed", expectedPaise: d.expectedPaise, countedPaise: short, variancePaise: -20_000, closedBy: "u_desk_andheri" });
    const audit = (await db.auditEvents.toArray()).filter((e) => e.action === "dayclose.close");
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({ reason: "Change given to a member", entityId: row.id });
  });

  it("closing twice changes nothing", async () => {
    const d = await getDayClose(desk, { branchId: "br_andheri" });
    const a = await closeDay(desk, { branchId: "br_andheri", date: TODAY, countedPaise: d.expectedPaise, note: "" });
    const b = await closeDay(desk, { branchId: "br_andheri", date: TODAY, countedPaise: d.expectedPaise + 500, note: "Other" });
    expect(b).toEqual(a);
    expect((await db.auditEvents.toArray()).filter((e) => e.action === "dayclose.close")).toHaveLength(1);
  });

  it("locks the day’s cash: a cash payment is refused, a UPI payment is not, and another branch is unaffected", async () => {
    await take();
    const d = await getDayClose(desk, { branchId: "br_andheri" });
    await closeDay(desk, { branchId: "br_andheri", date: TODAY, countedPaise: d.expectedPaise, note: "" });
    expect((await err(take("cash", 1))).message).toMatch(/^Cash for 17 Nov 2026 is closed\./);
    await expect(take("upi", 1)).resolves.toBeGreaterThan(0);
    expect((await getDayClose(finance, { branchId: "br_bandra" })).close).toBeUndefined();
  });

  it("only the owner reopens a closed day, with a reason, and it takes cash again", async () => {
    await take();
    const d = await getDayClose(desk, { branchId: "br_andheri" });
    await closeDay(desk, { branchId: "br_andheri", date: TODAY, countedPaise: d.expectedPaise, note: "" });
    expect((await err(reopenDay(desk, { branchId: "br_andheri", date: TODAY, reason: "Missed a payment" }))).code).toBe("forbidden");
    expect((await err(reopenDay(finance, { branchId: "br_andheri", date: TODAY, reason: "Missed a payment" }))).code).toBe("forbidden");
    expect((await err(reopenDay(owner, { branchId: "br_andheri", date: TODAY, reason: "" }))).code).toBe("invalid");
    const row = await reopenDay(owner, { branchId: "br_andheri", date: TODAY, reason: "A cash payment was missed" });
    expect(row).toMatchObject({ status: "reopened", reopenedBy: "u_owner", reopenReason: "A cash payment was missed" });
    const audit = (await db.auditEvents.toArray()).filter((e) => e.action === "dayclose.reopen");
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({ actorId: "u_owner", reason: "A cash payment was missed" });
    const more = await take("cash", 1);
    const again = await getDayClose(desk, { branchId: "br_andheri" });
    expect(again.expectedPaise).toBe(d.expectedPaise + more);
    expect((await closeDay(desk, { branchId: "br_andheri", date: TODAY, countedPaise: again.expectedPaise, note: "" })).status).toBe("closed");
  });

  it("refuses a day that hasn’t happened, a branch the person doesn’t work in, and people with no cash duty", async () => {
    expect((await err(closeDay(desk, { branchId: "br_andheri", date: "2026-11-18", countedPaise: 0, note: "" }))).message).toBe("You can’t close a day that hasn’t happened yet.");
    expect((await err(getDayClose(desk, { branchId: "br_bandra" }))).code).toBe("forbidden");
    expect((await err(getDayClose(as("u_trainer_meera"), { branchId: "br_andheri" }))).code).toBe("forbidden");
  });
});
