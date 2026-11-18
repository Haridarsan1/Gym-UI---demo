import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { DEMO_ACCOUNTS } from "@/app/demoAccounts";
import type { Session } from "@/app/session";
import { setNow } from "@/api/clock";
import { isApiError } from "@/api/errors";
import { getPass, simulateDoorScan } from "@/api/pass";
import { resetDemo } from "@/demo";
import { db } from "@/demo/db";

const as = (userId: string): Session => {
  const a = DEMO_ACCOUNTS.find((x) => x.userId === userId)!;
  return { userId: a.userId, name: a.name, role: a.role, tenantId: a.tenantId, branchIds: a.branchIds, memberId: a.memberId, limits: a.limits };
};
const arjun = as("u_member_arjun");
const priya = as("u_member_priya");
const rahul = as("u_member_rahul");
const sneha = as("u_member_sneha");
const NOON = "2026-11-17T06:30:00.000Z";

beforeEach(async () => {
  setNow(new Date(NOON));
  await resetDemo();
});
afterAll(() => setNow(null));

describe("the pass", () => {
  it("is ready for an active member, with the QR value, the branch and the last visits, newest first", async () => {
    const p = await getPass(arjun);
    expect(p).toMatchObject({ name: "Arjun Kumar", branchName: "Andheri", ready: true, headline: "Ready to scan", visitsLeft: null });
    expect(p.token).toMatch(/^qr-mem_arjun-\d{6}$/);
    expect(p.recent.length).toBe(8);
    expect(p.recent.map((x) => x.at)).toEqual([...p.recent.map((x) => x.at)].sort().reverse());
    expect(p.recent[0]).toMatchObject({ branchName: "Andheri", outcome: "Checked in" });
    expect(p.lastEntry).toBeDefined();
  });

  it("says why it won’t open the door, in words that say what to do", async () => {
    const r = await getPass(rahul);
    expect(r).toMatchObject({ ready: false, headline: "This pass won’t open the door right now", detail: "Your membership is frozen until 29 Nov 2026. Your pass works again then." });
    await db.memberships.where("memberId").equals("mem_arjun").modify({ status: "expired", endsOn: "2026-11-10" });
    expect((await getPass(arjun)).detail).toBe("Your membership ended on 10 Nov 2026. Renew it and your pass works again.");
  });

  it("is still ready with a payment due, and says dues don’t stop entry", async () => {
    const p = await getPass(priya);
    expect(p.ready).toBe(true);
    expect(p.detail).toMatch(/membership ends in 3 days/);
    await db.memberships.where("memberId").equals("mem_priya").modify({ endsOn: "2026-12-31" });
    expect((await getPass(priya)).detail).toBe("Show this code at the front desk or the door. You have a payment due, which doesn’t stop you coming in.");
  });

  it("shows a visit pass’s visits left and one that has none as unable to enter", async () => {
    expect((await getPass(sneha)).visitsLeft).toBe(4);
    await db.memberships.where("memberId").equals("mem_sneha").modify({ visitsRemaining: 0 });
    expect(await getPass(sneha)).toMatchObject({ ready: false, detail: "You have used all the visits on your pass. Renew it to come in again." });
  });

  it("belongs to the member: only a member can ask", async () => {
    await expect(getPass(as("u_desk_andheri"))).rejects.toSatisfy((e) => isApiError(e) && e.code === "forbidden");
  });
});

describe("scanning the pass at the door (demo)", () => {
  it("records a check-in and uses one visit on a visit pass", async () => {
    const r = await simulateDoorScan(sneha);
    expect(r).toMatchObject({ result: "allowed", message: "Checked in." });
    expect((await db.memberships.where("memberId").equals("mem_sneha").filter((m) => m.status === "active").first())!.visitsRemaining).toBe(3);
    const p = await getPass(sneha);
    expect(p.recent[0]).toMatchObject({ outcome: "Checked in, one visit used", visitUsed: true });
    expect(p.lastEntry!.at).toBe(NOON);
  });

  it("a repeat scan inside the window is recorded and uses no second visit; after the window it is a new visit", async () => {
    await simulateDoorScan(sneha);
    setNow(new Date("2026-11-17T06:35:00.000Z"));
    expect(await simulateDoorScan(sneha)).toMatchObject({ result: "repeat_scan", message: "You scanned a moment ago, so no extra visit was used." });
    expect(await db.checkIns.where("memberId").equals("mem_sneha").filter((c) => c.at >= NOON).count()).toBe(2);
    expect((await db.memberships.where("memberId").equals("mem_sneha").filter((m) => m.status === "active").first())!.visitsRemaining).toBe(3);
    setNow(new Date("2026-11-17T06:45:00.000Z")); // 15 minutes after the first scan
    expect((await simulateDoorScan(sneha)).result).toBe("allowed");
    expect((await db.memberships.where("memberId").equals("mem_sneha").filter((m) => m.status === "active").first())!.visitsRemaining).toBe(2);
  });

  it("scans five at once and uses one visit", async () => {
    await Promise.all(Array.from({ length: 5 }, () => simulateDoorScan(sneha)));
    expect((await db.memberships.where("memberId").equals("mem_sneha").filter((m) => m.status === "active").first())!.visitsRemaining).toBe(3);
  });

  it("is recorded as denied, with the reason, when the membership can’t enter", async () => {
    const r = await simulateDoorScan(rahul);
    expect(r.result).toBe("denied");
    expect(r.message).toMatch(/frozen until 29 Nov 2026/);
    const rows = await db.checkIns.where("memberId").equals("mem_rahul").filter((c) => c.at === NOON).toArray();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ result: "denied", visitDebited: false });
    expect((await getPass(rahul)).recent[0]!.outcome).toMatch(/frozen until/);
  });
});
