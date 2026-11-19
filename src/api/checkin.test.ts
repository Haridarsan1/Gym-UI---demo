import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { DEMO_ACCOUNTS } from "@/app/demoAccounts";
import type { Session } from "@/app/session";
import { setNow } from "@/api/clock";
import { isApiError } from "@/api/errors";
import { checkInMember, getTodayCheckIns, overrideCheckIn, searchMembers } from "@/api/checkin";
import { resetDemo } from "@/demo";
import { db } from "@/demo/db";

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
const desk = as("u_desk_andheri");
const bandra = as("u_bm_bandra");
let n = 0;
const key = () => `ck-${++n}-${Math.random().toString(36).slice(2)}`;
const go = (s: Session, memberId: string, branchId = "br_andheri") => checkInMember(s, { memberId, branchId, method: "desk", key: key() });

beforeEach(async () => {
  setNow(new Date("2026-11-17T06:30:00.000Z"));
  await resetDemo();
});
afterAll(() => setNow(null));

describe("searching", () => {
  it("finds members at the desk’s own branches by name, phone or code, and not others", async () => {
    expect((await searchMembers(desk, "arjun")).map((h) => h.name)).toEqual(["Arjun Kumar"]);
    expect((await searchMembers(desk, "98200 22002"))[0]).toMatchObject({ memberId: "mem_arjun", branchName: "Andheri" });
    expect((await searchMembers(desk, "a")).length).toBe(0);
    const rahul = await searchMembers(desk, "rahul");
    expect(rahul.every((h) => h.branchName === "Andheri")).toBe(true);
    expect((await searchMembers(bandra, "rahul")).map((h) => h.memberId)).toContain("mem_rahul");
    expect((await searchMembers(as("u_owner"), "arjun")).length).toBe(1);
  });

  it("is for the desk, branch managers and owners only", async () => {
    expect(await code(searchMembers(as("u_finance"), "arjun"))).toBe("forbidden");
    expect(await code(searchMembers(as("u_member_arjun"), "arjun"))).toBe("forbidden");
    expect(await code(searchMembers(as("u_trainer_meera"), "arjun"))).toBe("forbidden");
  });
});

describe("the result states", () => {
  it("allowed: an active member is let in and the record is written", async () => {
    const r = await go(desk, "mem_arjun");
    expect(r).toMatchObject({ result: "allowed", headline: "Checked in", firstName: "Arjun", branchName: "Andheri", canOverride: false, inGrace: false, repeated: false });
    expect(r.planName).toBeTruthy();
    const row = (await db.checkIns.get(r.checkInId))!;
    expect(row).toMatchObject({ memberId: "mem_arjun", branchId: "br_andheri", method: "desk", result: "allowed", recordedBy: "u_desk_andheri" });
  });

  it("allowed with dues: let in, with the amount owed, because dues don’t stop entry", async () => {
    const r = await go(desk, "mem_priya");
    expect(r.result).toBe("allowed_with_dues");
    expect(r.headline).toBe("Checked in, a payment is due");
    expect(r.dues!.amountPaise).toBeGreaterThan(0);
    expect(r.detail).toMatch(/owe ₹/);
  });

  it("grace: an ended membership inside its grace period gets in and says it has run out", async () => {
    const m = (await db.memberships.where("memberId").equals("mem_arjun").toArray()).find((x) => x.status === "active")!;
    await db.memberships.update(m.id, { endsOn: "2026-11-15", graceUntil: "2026-11-20" });
    const r = await go(desk, "mem_arjun");
    expect(r).toMatchObject({ result: "allowed", inGrace: true });
    expect(r.detail).toMatch(/grace period/);
  });

  it("denied: says why in staff words, is recorded, and offers an override to someone who may", async () => {
    const r = await go(bandra, "mem_rahul", "br_bandra");
    expect(r).toMatchObject({ result: "denied", reason: "frozen", headline: "Not checked in", canOverride: true });
    expect(r.detail).toMatch(/^Rahul’s membership is frozen until/);
    expect((await db.checkIns.get(r.checkInId))!.visitDebited).toBe(false);
    await db.staffRoles.where("userId").equals("u_bm_bandra").modify((s) => { s.limits = { ...s.limits!, canOverrideCheckIn: false }; });
    expect((await go(bandra, "mem_rahul", "br_bandra")).canOverride).toBe(false);
  });

  it("denied for each reason: expired, canceled, no membership, another branch, no visits left", async () => {
    const set = async (memberId: string, patch: { status?: "expired"; endsOn?: string; visitsRemaining?: number }) => {
      const m = (await db.memberships.where("memberId").equals(memberId).toArray()).find((x) => x.status === "active")!;
      await db.memberships.update(m.id, patch);
    };
    await set("mem_arjun", { status: "expired", endsOn: "2026-10-01" });
    expect(await go(desk, "mem_arjun")).toMatchObject({ result: "denied", reason: "expired" });
    await set("mem_sneha", { visitsRemaining: 0 });
    expect(await go(desk, "mem_sneha")).toMatchObject({ result: "denied", reason: "no_visits" });
    await db.memberships.where("memberId").equals("mem_priya").modify((m) => { m.status = "canceled"; });
    expect(await go(desk, "mem_priya")).toMatchObject({ result: "denied", reason: "canceled" });
    const lone = (await db.members.where("homeBranchId").equals("br_andheri").toArray()).find((m) => !["mem_arjun", "mem_priya", "mem_sneha"].includes(m.id))!;
    await db.memberships.where("memberId").equals(lone.id).delete();
    expect(await go(desk, lone.id)).toMatchObject({ result: "denied", reason: "no_membership" });
    // A plan that covers only Andheri, scanned at Bandra by the owner.
    await db.memberships.where("memberId").equals("mem_arjun").modify((m) => { m.status = "active"; m.endsOn = "2027-01-01"; m.terms.branchIds = ["br_andheri"]; });
    expect(await go(as("u_owner"), "mem_arjun", "br_bandra")).toMatchObject({ result: "denied", reason: "branch" });
  });

  it("repeat scan: inside ten minutes it is recorded and lets them in, and uses no extra visit", async () => {
    const a = await go(desk, "mem_sneha");
    expect(a.result).toBe("allowed");
    expect(a.visitsLeft).toBe(3);
    const b = await go(desk, "mem_sneha");
    expect(b).toMatchObject({ result: "repeat_scan", visitsLeft: 3 });
    expect(b.headline).toMatch(/^Already checked in at \d+:\d{2} (am|pm)$/);
    expect((await db.checkIns.get(b.checkInId))!.visitDebited).toBe(false);
    // Ten minutes later it counts as a new visit.
    setNow(new Date("2026-11-17T06:41:00.000Z"));
    expect(await go(desk, "mem_sneha")).toMatchObject({ result: "allowed", visitsLeft: 2 });
  });

  it("a visit pass uses a visit on entry, and a denial uses none", async () => {
    const before = (await db.memberships.where("memberId").equals("mem_sneha").toArray()).find((m) => m.status === "active")!.visitsRemaining;
    await go(desk, "mem_sneha");
    expect((await db.memberships.where("memberId").equals("mem_sneha").toArray()).find((m) => m.status === "active")!.visitsRemaining).toBe(before! - 1);
  });
});

describe("one attempt makes one check-in", () => {
  it("the same key returns the same result without a second record or a second visit", async () => {
    const k = key();
    const a = await checkInMember(desk, { memberId: "mem_sneha", branchId: "br_andheri", method: "desk", key: k });
    const b = await checkInMember(desk, { memberId: "mem_sneha", branchId: "br_andheri", method: "desk", key: k });
    expect(b).toMatchObject({ checkInId: a.checkInId, result: "allowed", repeated: true });
    expect((await db.checkIns.where("memberId").equals("mem_sneha").toArray()).filter((c) => c.at.startsWith("2026-11-17"))).toHaveLength(1);
    expect(b.visitsLeft).toBe(3);
  });

  it("scanning a pass finds the member by their code and records it as a scan", async () => {
    const m = (await db.members.get("mem_arjun"))!;
    const r = await checkInMember(desk, { token: m.qrToken, branchId: "br_andheri", method: "qr", key: key() });
    expect(r).toMatchObject({ memberId: "mem_arjun", result: "allowed" });
    expect((await db.checkIns.get(r.checkInId))!.method).toBe("qr");
    expect(await code(checkInMember(desk, { token: "qr-not-a-member-xx", branchId: "br_andheri", method: "qr", key: key() }))).toBe("not_found");
  });

  it("works in the desk’s own branches only", async () => {
    expect(await code(go(desk, "mem_arjun", "br_bandra"))).toBe("forbidden");
    expect(await code(go(as("u_finance"), "mem_arjun"))).toBe("forbidden");
  });
});

describe("override", () => {
  const denied = async () => go(bandra, "mem_rahul", "br_bandra");

  it("lets a turned-away member in with a reason, beside the denial, with no visit and an audit event", async () => {
    const d = await denied();
    const k = key();
    expect(await code(overrideCheckIn(bandra, { checkInId: d.checkInId, reason: "  ", key: k }))).toBe("invalid");
    const o = await overrideCheckIn(bandra, { checkInId: d.checkInId, reason: "Plan paid by cheque, desk confirmed by phone", key: k });
    expect(o).toMatchObject({ result: "override", headline: "Checked in by override", overriddenBy: "Rohit Sethi" });
    expect(o.detail).toMatch(/Plan paid by cheque/);
    const rows = await db.checkIns.where("memberId").equals("mem_rahul").toArray();
    expect(rows.filter((r) => r.at.startsWith("2026-11-17")).map((r) => r.result).sort()).toEqual(["denied", "override"]);
    expect((await db.checkIns.get(o.checkInId))).toMatchObject({ overriddenBy: "u_bm_bandra", overrideReason: "Plan paid by cheque, desk confirmed by phone", visitDebited: false });
    const ev = (await db.auditEvents.where("action").equals("checkin.override").toArray()).at(-1)!;
    expect(ev).toMatchObject({ actorId: "u_bm_bandra", memberId: "mem_rahul", reason: "Plan paid by cheque, desk confirmed by phone", entityId: o.checkInId });
    // The same key again changes nothing.
    expect((await overrideCheckIn(bandra, { checkInId: d.checkInId, reason: "x again", key: k })).repeated).toBe(true);
    expect((await db.auditEvents.where("action").equals("checkin.override").toArray())).toHaveLength(1);
  });

  it("needs the person’s own permission, and only a denial can be overridden", async () => {
    const d = await denied();
    await db.staffRoles.where("userId").equals("u_bm_bandra").modify((s) => { s.limits = { ...s.limits!, canOverrideCheckIn: false }; });
    expect(await code(overrideCheckIn(bandra, { checkInId: d.checkInId, reason: "Because", key: key() }))).toBe("forbidden");
    const ok = await go(desk, "mem_arjun");
    expect(await code(overrideCheckIn(desk, { checkInId: ok.checkInId, reason: "Because", key: key() }))).toBe("conflict");
    expect(await code(overrideCheckIn(desk, { checkInId: d.checkInId, reason: "Another branch", key: key() }))).toBe("forbidden");
  });

  it("an override is for one visit: the next scan is judged by the rules again", async () => {
    const d = await denied();
    await overrideCheckIn(bandra, { checkInId: d.checkInId, reason: "Allowed by the manager", key: key() });
    setNow(new Date("2026-11-17T06:45:00.000Z"));
    expect((await go(bandra, "mem_rahul", "br_bandra")).result).toBe("denied");
  });
});

describe("today’s list", () => {
  it("lists today’s check-ins at one branch, newest first, with counts and how each was recorded", async () => {
    await go(desk, "mem_arjun");
    setNow(new Date("2026-11-17T06:31:00.000Z"));
    await go(desk, "mem_sneha");
    setNow(new Date("2026-11-17T06:32:00.000Z"));
    await go(desk, "mem_sneha");
    const t = await getTodayCheckIns(desk, "br_andheri");
    expect(t).toMatchObject({ today: "2026-11-17", branchName: "Andheri" });
    expect(t.rows.slice(0, 3).map((r) => [r.name, r.result])).toEqual([["Sneha Patil", "repeat_scan"], ["Sneha Patil", "allowed"], ["Arjun Kumar", "allowed"]]);
    expect(t.entered).toBeGreaterThanOrEqual(2);
    expect(t.rows.every((r) => r.at.startsWith("2026-11-17"))).toBe(true);
    expect(await code(getTodayCheckIns(desk, "br_bandra"))).toBe("forbidden");
  });

  it("counts denials and overrides, with the reason", async () => {
    const d = await go(bandra, "mem_rahul", "br_bandra");
    await overrideCheckIn(bandra, { checkInId: d.checkInId, reason: "Manager’s call", key: key() });
    const t = await getTodayCheckIns(bandra, "br_bandra");
    expect(t).toMatchObject({ denied: 1, overrides: 1 });
    expect(t.rows.find((r) => r.result === "override")!.note).toBe("Manager’s call");
    expect(t.rows.find((r) => r.result === "denied")!.note).toBe("frozen");
  });
});
