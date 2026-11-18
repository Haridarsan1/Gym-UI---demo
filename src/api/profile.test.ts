import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { DEMO_ACCOUNTS } from "@/app/demoAccounts";
import type { Session } from "@/app/session";
import { setNow } from "@/api/clock";
import { isApiError } from "@/api/errors";
import { getPhotos } from "@/api/progress";
import { getProfile, requestData, saveSettings, setConsent } from "@/api/profile";
import { resetDemo } from "@/demo";
import { db } from "@/demo/db";

const as = (userId: string): Session => {
  const a = DEMO_ACCOUNTS.find((x) => x.userId === userId)!;
  return { userId: a.userId, name: a.name, role: a.role, tenantId: a.tenantId, branchIds: a.branchIds, memberId: a.memberId, limits: a.limits };
};
const arjun = as("u_member_arjun");
const priya = as("u_member_priya");
const code = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (e) {
    return isApiError(e) ? e.code : "other";
  }
  return "resolved";
};

beforeEach(async () => {
  setNow(new Date("2026-11-17T06:30:00.000Z"));
  await resetDemo();
  // Arjun starts with all three optional consents, so each test begins from a known place.
  await db.consents.where("memberId").equals("mem_arjun").delete();
  for (const scope of ["photos", "assessments", "marketing", "data_processing"] as const) {
    await db.consents.add({ id: `cn_arjun_${scope}`, tenantId: "t_pulse", memberId: "mem_arjun", scope, grantedAt: "2026-08-01T05:00:00.000Z", noticeVersion: "2026-01", recordedBy: "u_desk_andheri" });
  }
});
afterAll(() => setNow(null));

describe("the profile", () => {
  it("gives the member’s own details and consent, with the date each was given", async () => {
    const p = await getProfile(arjun);
    expect(p).toMatchObject({ name: "Arjun Kumar", phone: "9820022002", email: "arjun.kumar@example.in", branchName: "Andheri", trainerName: "Meera Joshi" });
    expect(p.consents.map((k) => [k.scope, k.granted, k.required])).toEqual([["photos", true, false], ["assessments", true, false], ["marketing", true, false], ["data_processing", true, true]]);
    expect(p.consents[0]!.since).toBe("2026-08-01");
    expect(p.messages).toEqual({ bookingReminders: true, workoutUpdates: true, renewalReminders: true, inactivityPrompts: true });
  });
  it("is only for a member", async () => {
    expect(await code(getProfile(as("u_desk_andheri")))).toBe("forbidden");
  });
});

describe("consent (S04)", () => {
  it("withdrawing keeps the record, stamps the date, writes an audit event, and hides progress photos", async () => {
    expect((await getPhotos(arjun)).consent).toBe(true);
    const v = await setConsent(arjun, { scope: "photos", granted: false });
    expect(v).toMatchObject({ granted: false, withdrawn: true, since: "2026-11-17" });
    const rows = await db.consents.where("memberId").equals("mem_arjun").filter((k) => k.scope === "photos").toArray();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.withdrawnAt).toBe("2026-11-17T06:30:00.000Z");
    expect((await getPhotos(arjun)).consent).toBe(false);
    const audit = await db.auditEvents.filter((a) => a.action === "consent.change" && a.memberId === "mem_arjun").toArray();
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({ actorRole: "member", reason: "Member withdrew consent", details: { scope: "photos", granted: false } });
  });

  it("giving it again adds a new record against the current notice and keeps the old one", async () => {
    await setConsent(arjun, { scope: "marketing", granted: false });
    const v = await setConsent(arjun, { scope: "marketing", granted: true });
    expect(v).toMatchObject({ granted: true, withdrawn: false, since: "2026-11-17" });
    const rows = await db.consents.where("memberId").equals("mem_arjun").filter((k) => k.scope === "marketing").toArray();
    expect(rows).toHaveLength(2);
    expect(rows.filter((k) => !k.withdrawnAt)).toHaveLength(1);
    expect(rows.find((k) => !k.withdrawnAt)!.noticeVersion).toBe("2026-01");
  });

  it("repeating the same choice changes nothing and isn’t audited twice", async () => {
    await setConsent(arjun, { scope: "assessments", granted: true });
    await setConsent(arjun, { scope: "assessments", granted: false });
    await setConsent(arjun, { scope: "assessments", granted: false });
    expect(await db.auditEvents.filter((a) => a.action === "consent.change").count()).toBe(1);
  });

  it("can’t switch off the consent that keeps the account working, and changes only the caller’s own", async () => {
    expect(await code(setConsent(arjun, { scope: "data_processing" as never, granted: false }))).toBe("invalid");
    await setConsent(priya, { scope: "marketing", granted: false });
    expect((await getProfile(arjun)).consents.find((k) => k.scope === "marketing")!.granted).toBe(true);
  });
});

describe("message preferences (O04)", () => {
  it("saves each choice on its own and keeps the rest", async () => {
    const a = await saveSettings(arjun, { messages: { inactivityPrompts: false } });
    expect(a.messages).toEqual({ bookingReminders: true, workoutUpdates: true, renewalReminders: true, inactivityPrompts: false });
    const b = await saveSettings(arjun, { messages: { bookingReminders: false } });
    expect(b.messages).toEqual({ bookingReminders: false, workoutUpdates: true, renewalReminders: true, inactivityPrompts: false });
    expect((await getProfile(arjun)).messages.bookingReminders).toBe(false);
    expect((await saveSettings(arjun, { hapticsOn: false })).hapticsOn).toBe(false);
    expect((await getProfile(arjun)).messages.inactivityPrompts).toBe(false);
  });
});

describe("data export and deletion requests (S04)", () => {
  it("records a request, audits it, and writes a confirmation email", async () => {
    const r = await requestData(arjun, { kind: "export", idempotencyKey: "req-export-0001" });
    expect(r).toMatchObject({ repeated: false, request: { kind: "export", status: "requested" } });
    expect((await getProfile(arjun)).requests).toHaveLength(1);
    expect(await db.auditEvents.filter((a) => a.action === "data.request" && a.memberId === "mem_arjun").count()).toBe(1);
    const mail = await db.emailLog.filter((e) => e.template === "data_request" && e.memberId === "mem_arjun").toArray();
    expect(mail).toHaveLength(1);
    expect(mail[0]!.subject).toBe("We have your request for a copy of your data");
  });

  it("asking again while one is open, or with the same key, makes no second request", async () => {
    const a = await requestData(arjun, { kind: "deletion", idempotencyKey: "req-del-000001" });
    const b = await requestData(arjun, { kind: "deletion", idempotencyKey: "req-del-000002" });
    const c = await requestData(arjun, { kind: "deletion", idempotencyKey: "req-del-000001" });
    expect([b.repeated, c.repeated]).toEqual([true, true]);
    expect(b.request.id).toBe(a.request.id);
    expect(await db.dataRequests.where("memberId").equals("mem_arjun").count()).toBe(1);
    // A different kind is its own request.
    expect((await requestData(arjun, { kind: "export", idempotencyKey: "req-exp-000003" })).repeated).toBe(false);
  });

  it("five at once make one", async () => {
    await Promise.all(Array.from({ length: 5 }, (_, i) => requestData(arjun, { kind: "export", idempotencyKey: `req-race-00000${i}` })));
    expect(await db.dataRequests.where("memberId").equals("mem_arjun").count()).toBe(1);
  });

  it("is the member’s own, and only a member can ask", async () => {
    await requestData(priya, { kind: "export", idempotencyKey: "req-priya-0001" });
    expect((await getProfile(arjun)).requests).toHaveLength(0);
    expect(await code(requestData(as("u_owner"), { kind: "export", idempotencyKey: "req-owner-0001" }))).toBe("forbidden");
  });
});
