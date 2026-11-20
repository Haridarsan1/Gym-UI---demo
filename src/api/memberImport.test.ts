import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { DEMO_ACCOUNTS } from "@/app/demoAccounts";
import type { Session } from "@/app/session";
import { setNow } from "@/api/clock";
import { checkInMember } from "@/api/checkin";
import { isApiError } from "@/api/errors";
import { previewMemberImport, runMemberImport } from "@/api/memberImport";
import { getMemberProfile } from "@/api/memberProfile";
import { resetDemo } from "@/demo";
import { db } from "@/demo/db";
import { creditBalance } from "@/domain/credits";

const as = (userId: string): Session => {
  const a = DEMO_ACCOUNTS.find((x) => x.userId === userId)!;
  return { userId: a.userId, name: a.name, role: a.role, tenantId: a.tenantId, branchIds: a.branchIds, memberId: a.memberId, limits: a.limits };
};
const err = async (p: Promise<unknown>) => { try { await p; } catch (e) { return isApiError(e) ? { code: e.code, message: e.message } : { code: "other", message: String(e) }; } return { code: "resolved", message: "" }; };
const owner = as("u_owner");
let n = 0;
const key = () => `imp-key-${++n}-${Math.random().toString(36).slice(2)}`;
const H = "name,phone,email,date_of_birth,gender,branch,plan,start_date,visits_left,pt_credits,lead_source";
const FILE = [
  H,
  "Asha Menon,9820011122,asha@example.in,1992-04-09,female,Bandra,Monthly,2026-11-10,,4,Walk-in",
  "Vikram Shah,9820033344,,,male,Andheri,10-visit pass,2026-11-01,6,,Instagram",
  "Old Member,9820055566,,,,Powai,Monthly,2026-08-01,,,",
  "Future Joiner,9820077788,,,,Powai,Quarterly,2026-11-25,,,",
  "Dev Ramaswamy,9820022090,,2010-03-14,male,Andheri,,,,,",
  "Ravi Kale,9820011100,,,,Bandra,,,,,",
  "Sita Kale,9820011100,,,,Bandra,,,,,",
  "No Number,12345,,,,Bandra,,,,,",
  "Meena Ramaswamy,9820022090,,,,Andheri,,,,,",
].join("\r\n");
const run = (over: Partial<Parameters<typeof runMemberImport>[1]> = {}) => runMemberImport(owner, { key: key(), csv: FILE, leaveOut: [], fileName: "members.csv", consentConfirmed: true, ...over });

beforeEach(async () => { setNow(new Date("2026-11-17T06:30:00.000Z")); await resetDemo(); });
afterAll(() => setNow(null));

describe("the preview", () => {
  it("says what would happen to each row, writes nothing, and counts good, shared and problem rows", async () => {
    const before = await db.members.count();
    const p = await previewMemberImport(owner, { csv: FILE });
    expect(p.counts).toEqual({ ok: 5, shared: 2, error: 2 });
    expect(p.rows.find((r) => r.name === "Dev Ramaswamy")).toMatchObject({ status: "shared", sharedWith: [{ name: "Meena Ramaswamy", source: "existing" }, { name: "Aarav Ramaswamy", source: "existing" }] });
    expect(p.rows.find((r) => r.name === "Sita Kale")).toMatchObject({ status: "shared", sharedWith: [{ name: "Ravi Kale", source: "file", line: 7 }] });
    expect(p.rows.find((r) => r.name === "No Number")!.errors).toEqual(["phone: Enter a 10-digit mobile number."]);
    expect(p.rows.find((r) => r.name === "Meena Ramaswamy")!.errors[0]).toMatch(/already a member/);
    expect(p).toMatchObject({ limit: 250, branches: ["Andheri", "Bandra", "Powai"] });
    expect(await db.members.count()).toBe(before);
  });
  it("is the owner’s alone", async () => {
    for (const id of ["u_bm_bandra", "u_desk_andheri", "u_finance", "u_trainer_meera", "u_member_arjun", "u_admin"]) expect((await err(previewMemberImport(as(id), { csv: FILE }))).code, id).toBe("forbidden");
    expect((await err(runMemberImport(as("u_bm_bandra"), { key: key(), csv: FILE, leaveOut: [], consentConfirmed: true }))).code).toBe("forbidden");
  });
});

describe("running it", () => {
  it("makes each good and shared row’s member with the plan and balances the file gives, and leaves the rest", async () => {
    const r = await run();
    expect(r).toMatchObject({ created: 7, withProblems: 2, leftOut: 0, shared: 2, memberships: 4, credits: 1, repeated: false });
    const mine = (await db.members.toArray()).filter((m) => m.importBatchId === r.batchId);
    expect(mine.map((m) => m.name).sort()).toEqual(["Asha Menon", "Dev Ramaswamy", "Future Joiner", "Old Member", "Ravi Kale", "Sita Kale", "Vikram Shah"]);
    const asha = mine.find((m) => m.name === "Asha Menon")!;
    expect(asha).toMatchObject({ phone: "9820011122", homeBranchId: "br_bandra", joinedOn: "2026-11-10", leadSource: "Walk-in", dateOfBirth: "1992-04-09", gender: "female" });
    const ms = (await db.memberships.where("memberId").equals(asha.id).toArray())[0]!;
    expect(ms).toMatchObject({ status: "active", startsOn: "2026-11-10", endsOn: "2026-12-10", planId: "pl_monthly", terms: { name: "Monthly", pricePaise: 250_000 } });
    expect(ms.invoiceId).toBeUndefined();
    expect(creditBalance(await db.creditLedger.where("memberId").equals(asha.id).toArray()).available).toBe(4);
    const status = async (name: string) => (await db.memberships.where("memberId").equals(mine.find((m) => m.name === name)!.id).toArray())[0]!;
    expect(await status("Old Member")).toMatchObject({ status: "expired", endsOn: "2026-08-31" });
    expect(await status("Future Joiner")).toMatchObject({ status: "scheduled", startsOn: "2026-11-25" });
    expect(await status("Vikram Shah")).toMatchObject({ visitsRemaining: 6, status: "active" });
    // Consent to hold their details is recorded for each, by the owner.
    expect((await db.consents.toArray()).filter((c) => c.scope === "data_processing" && c.noticeVersion === "import")).toHaveLength(7);
  });

  it("shared numbers become separate members with the shared-number flag, linked both ways inside the file and to the existing member", async () => {
    const r = await run();
    const mine = (await db.members.toArray()).filter((m) => m.importBatchId === r.batchId);
    const id = (name: string) => mine.find((m) => m.name === name)!.id;
    expect(mine.find((m) => m.name === "Dev Ramaswamy")!.sharesContactWith).toEqual(["mem_040", "mem_041"]);
    expect(mine.find((m) => m.name === "Sita Kale")!.sharesContactWith).toEqual([id("Ravi Kale")]);
    expect(mine.find((m) => m.name === "Ravi Kale")!.sharesContactWith).toEqual([id("Sita Kale")]);
    // The desk sees it on the profile.
    expect((await getMemberProfile(as("u_desk_andheri"), id("Dev Ramaswamy"))).member.sharing.map((s) => s.name)).toEqual(expect.arrayContaining(["Meena Ramaswamy", "Aarav Ramaswamy"]));
  });

  it("a row the owner unticks is left out, and one that shared with it simply doesn’t carry the link", async () => {
    const r = await run({ leaveOut: [7, 4] });
    expect(r).toMatchObject({ created: 5, leftOut: 2 });
    const mine = (await db.members.toArray()).filter((m) => m.importBatchId === r.batchId);
    expect(mine.some((m) => m.name === "Ravi Kale" || m.name === "Old Member")).toBe(false);
    expect(mine.find((m) => m.name === "Sita Kale")!.sharesContactWith).toBeUndefined();
  });

  it("an imported member is a real member: the desk can check them in", async () => {
    const r = await run();
    const asha = (await db.members.toArray()).find((m) => m.importBatchId === r.batchId && m.name === "Asha Menon")!;
    expect(await checkInMember(as("u_bm_bandra"), { memberId: asha.id, branchId: "br_bandra", method: "desk", key: key() })).toMatchObject({ result: "allowed" });
  });

  it("writes one audit entry that says what the run did", async () => {
    await run();
    const e = (await db.auditEvents.where("action").equals("import.run").toArray());
    expect(e).toHaveLength(1);
    expect(e[0]).toMatchObject({ actorId: "u_owner", details: { file: "members.csv", rows: 9, created: 7, leftOut: 0, withProblems: 2, shared: 2, memberships: 4, credits: 1 } });
  });

  it("needs the owner’s confirmation about consent", async () => {
    expect((await err(runMemberImport(owner, { key: key(), csv: FILE, leaveOut: [], consentConfirmed: false as unknown as true }))).message).toBe("Confirm that these members agreed to the gym keeping their details.");
    expect(await db.importBatches.count()).toBe(0);
  });
});

describe("a retry creates no duplicates", () => {
  it("the same run sent twice makes nobody twice and says it was already done", async () => {
    const k = key();
    const a = await run({ key: k });
    const members = await db.members.count();
    const ledger = await db.creditLedger.count();
    const b = await run({ key: k });
    expect(b).toMatchObject({ repeated: true, created: a.created });
    expect(await db.members.count()).toBe(members);
    expect(await db.creditLedger.count()).toBe(ledger);
    expect(await db.auditEvents.where("action").equals("import.run").count()).toBe(1);
  });

  it("the same file under a new key is refused row by row, because those people are now members", async () => {
    await run();
    const members = await db.members.count();
    const p = await previewMemberImport(owner, { csv: FILE });
    expect(p.counts.ok + p.counts.shared).toBe(0);
    expect((await err(run())).message).toBe("No row is left to import. Tick the rows you want, or fix the ones with problems.");
    expect(await db.members.count()).toBe(members);
  });

  it("a run that fails part-way leaves nothing behind, and the same run then goes through once", async () => {
    const k = key();
    const blocker = `mem_imp_${[...k].reduce((h, ch) => (Math.imul(h, 31) + ch.charCodeAt(0)) >>> 0, 7).toString(36)}_5`;
    await db.members.add({ id: blocker, tenantId: "t_pulse", name: "Blocker", phone: "9000000001", homeBranchId: "br_andheri", joinedOn: "2026-11-01", qrToken: "qr-x" });
    const members = await db.members.count();
    expect((await err(run({ key: k }))).code).toBe("other");
    expect(await db.members.count()).toBe(members);
    expect(await db.importBatches.count()).toBe(0);
    expect(await db.creditLedger.filter((c) => c.reason === "Imported balance").count()).toBe(0);
    await db.members.delete(blocker);
    const r = await run({ key: k });
    expect(r).toMatchObject({ created: 7, repeated: false });
    expect(await db.members.count()).toBe(members - 1 + 7);
  });
});

describe("the subscription’s member limit", () => {
  it("rows past what the plan allows are refused, and the screen is told how many it allows", async () => {
    const active = new Set((await db.memberships.toArray()).filter((m) => m.status === "active" || m.status === "frozen").map((m) => m.memberId)).size;
    await db.saasPlans.update("sp_growth", { limits: { branches: 3, staff: 20, activeMembers: active + 2 } });
    const p = await previewMemberImport(owner, { csv: FILE });
    expect(p).toMatchObject({ limit: active + 2, active, capacityLeft: 2 });
    expect(p.rows.filter((r) => r.errors.some((e) => e.includes("limit on active members"))).length).toBeGreaterThan(0);
    const r = await run();
    expect(r.memberships).toBeLessThanOrEqual(2 + 2);
  });
});
