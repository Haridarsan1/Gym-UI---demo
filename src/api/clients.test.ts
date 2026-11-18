import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { DEMO_ACCOUNTS } from "@/app/demoAccounts";
import type { Session } from "@/app/session";
import { setNow } from "@/api/clock";
import { transferTrainer } from "@/api/assignments";
import { addPrivateNote, getClient, listClients } from "@/api/clients";
import { isApiError } from "@/api/errors";
import { db } from "@/demo/db";
import { resetDemo } from "@/demo";

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

beforeAll(() => setNow(new Date("2026-11-17T06:30:00.000Z")));
afterAll(() => setNow(null));
beforeEach(async () => {
  await resetDemo();
});

describe("Clients list", () => {
  it("lists only the caller’s own active and frozen clients, in name order, with adherence", async () => {
    const rows = await listClients(as("u_trainer_meera"));
    expect(rows.length).toBeGreaterThanOrEqual(10);
    expect(rows.map((r) => r.name)).toEqual([...rows.map((r) => r.name)].sort((a, b) => a.localeCompare(b)));
    expect(rows.every((r) => r.status === "active" || r.status === "frozen")).toBe(true);
    const arjun = rows.find((r) => r.name === "Arjun Kumar")!;
    expect(arjun).toMatchObject({ programName: "Strength and size block", branchName: "Andheri", planName: "Monthly Plus" });
    expect(arjun.completionRate).toBeGreaterThan(0.5);
    const kavya = await listClients(as("u_trainer_kavya"));
    const ids = new Set(rows.map((r) => r.memberId));
    for (const k of kavya) expect(ids.has(k.memberId)).toBe(false);
  });

  it("searches by name or phone and filters by what needs attention", async () => {
    expect((await listClients(as("u_trainer_meera"), { search: "arjun" })).map((r) => r.name)).toEqual(["Arjun Kumar"]);
    expect((await listClients(as("u_trainer_meera"), { search: "98200 22002" })).map((r) => r.name)).toEqual(["Arjun Kumar"]);
    const plans = await listClients(as("u_trainer_meera"), { flag: "plan" });
    expect(plans.length).toBeGreaterThan(0);
    expect(plans.every((r) => r.flags.includes("plan") && r.programName === undefined)).toBe(true);
    expect(plans.some((r) => r.name === "Sneha Patil")).toBe(true);
    for (const r of await listClients(as("u_trainer_meera"), { flag: "missed" })) expect(r.flags).toContain("missed");
  });

  it("is for trainers only", async () => {
    expect(await code(listClients(as("u_member_arjun")))).toBe("forbidden");
    expect(await code(listClients(as("u_desk_andheri")))).toBe("forbidden");
    expect(await code(listClients(null))).toBe("unauthenticated");
  });
});

describe("Client profile", () => {
  it("shows Arjun: plan versions, adherence, logs with their author, goals, notes and credits", async () => {
    const p = await getClient(as("u_trainer_meera"), "mem_arjun");
    expect(p).toMatchObject({ name: "Arjun Kumar", firstName: "Arjun", branchName: "Andheri", membership: { planName: "Monthly Plus", status: "active" }, credits: { available: 5, reserved: 1, consumed: 2 } });
    expect(p.program).toMatchObject({ name: "Strength and size block", versionNumber: 2, authorName: "Meera Joshi" });
    expect(p.program!.versions.map((v) => v.versionNumber)).toEqual([2, 1]);
    expect(p.program!.versions[0]!.current).toBe(true);
    expect(p.logs.length).toBeGreaterThan(5);
    expect(p.logs.some((l) => l.enteredByRole === "member" && l.enteredByName === "The member")).toBe(true);
    expect(p.logs.every((l) => l.date <= "2026-11-17")).toBe(true);
    expect(p.goals.map((g) => g.title)).toEqual(["Reach 78 kg", "Bench press 50 kg for three sets of ten"]);
    expect(p.goals[0]).toMatchObject({ status: "active", current: 79.1 });
    expect(p.notes.map((n) => n.kind)).toContain("private_note");
    expect(p.notes.find((n) => n.kind === "private_note")!.authorIsMe).toBe(true);
    expect(p.weeks.length).toBe(6);
    expect(p.review).toMatchObject({ overdue: false, cadenceDays: 28 });
    expect(p.assessmentConsent).toMatch(/agreed|withdrawn|none/);
  });

  it("says why a client is on today’s lists", async () => {
    const rows = await listClients(as("u_trainer_meera"), { flag: "review" });
    const overdue = await getClient(as("u_trainer_meera"), rows[0]!.memberId);
    expect(overdue.flags).toContain("review");
    expect(overdue.review!.overdue).toBe(true);
    const waiting = await getClient(as("u_trainer_meera"), "mem_sneha");
    expect(waiting.awaiting).toMatchObject({ planName: "10-visit pass" });
    expect(waiting.program).toBeUndefined();
  });

  it("refuses a client who is not the caller’s, and does not say whether they exist", async () => {
    expect(await code(getClient(as("u_trainer_kavya"), "mem_arjun"))).toBe("not_found");
    expect(await code(getClient(as("u_trainer_meera"), "mem_nobody"))).toBe("not_found");
    expect(await code(getClient(as("u_member_arjun"), "mem_arjun"))).toBe("forbidden");
  });
});

describe("Private notes", () => {
  it("are kept by their author and added to the client’s notes", async () => {
    const note = await addPrivateNote(as("u_trainer_meera"), { memberId: "mem_arjun", body: "  Shoulder fine today.  " });
    expect(note).toMatchObject({ kind: "private_note", authorIsMe: true, body: "Shoulder fine today.", authorName: "Meera Joshi" });
    const p = await getClient(as("u_trainer_meera"), "mem_arjun");
    expect(p.notes[0]!.id).toBe(note.id);
  });
  it("refuse empty notes and clients that are not yours", async () => {
    expect(await code(addPrivateNote(as("u_trainer_meera"), { memberId: "mem_arjun", body: "   " }))).toBe("invalid");
    expect(await code(addPrivateNote(as("u_trainer_kavya"), { memberId: "mem_arjun", body: "Hi" }))).toBe("not_found");
  });
});

describe("Trainer transfer (A02)", () => {
  it("moves the client: the new trainer sees plans, logs and shared reviews with their authors, never the old trainer’s private notes, and the old trainer loses access", async () => {
    const before = await getClient(as("u_trainer_meera"), "mem_arjun");
    const privateBefore = before.notes.filter((n) => n.kind === "private_note");
    expect(privateBefore.length).toBeGreaterThan(0);
    const logsBefore = await db.workoutLogs.where("memberId").equals("mem_arjun").count();
    const versionsBefore = await db.workoutPlanVersions.where("memberId").equals("mem_arjun").toArray();

    await transferTrainer(as("u_desk_andheri"), { memberId: "mem_arjun", toTrainerId: "u_trainer_aditya", reason: "Coach Meera is on leave" });

    expect(await code(getClient(as("u_trainer_meera"), "mem_arjun"))).toBe("not_found");
    expect((await listClients(as("u_trainer_meera"))).some((r) => r.memberId === "mem_arjun")).toBe(false);
    const after = await getClient(as("u_trainer_aditya"), "mem_arjun");
    expect(after.trainer.previous.some((t) => t.trainerName === "Meera Joshi" && t.to === "2026-11-16")).toBe(true);
    expect(after.trainer.assignedOn).toBe("2026-11-17");
    // The history is all there, and still says who wrote it.
    expect(after.program!.authorName).toBe("Meera Joshi");
    expect(after.program!.versions.map((v) => v.authorName)).toEqual(["Meera Joshi", "Meera Joshi"]);
    expect(after.notes.filter((n) => n.kind === "shared_review").every((n) => n.authorName === "Meera Joshi" && !n.authorIsMe)).toBe(true);
    expect(after.notes.some((n) => n.kind === "private_note")).toBe(false);
    // Nothing was rewritten.
    expect(await db.workoutLogs.where("memberId").equals("mem_arjun").count()).toBe(logsBefore);
    expect(await db.workoutPlanVersions.where("memberId").equals("mem_arjun").toArray()).toEqual(versionsBefore);
    // The old trainer’s private notes are still there, and still hers.
    expect((await db.trainerReviews.where("memberId").equals("mem_arjun").toArray()).filter((r) => r.kind === "private_note" && r.authorId === "u_trainer_meera")).toHaveLength(privateBefore.length);
    // The audit log has the change and the reason.
    const audit = (await db.auditEvents.toArray()).find((a) => a.entityType === "trainer_assignment" && a.memberId === "mem_arjun");
    expect(audit).toMatchObject({ action: "record.edit", reason: "Coach Meera is on leave", actorId: "u_desk_andheri" });
  });

  it("only the people who assign trainers can do it, and only to a trainer of the gym", async () => {
    expect(await code(transferTrainer(as("u_trainer_meera"), { memberId: "mem_arjun", toTrainerId: "u_trainer_aditya" }))).toBe("forbidden");
    expect(await code(transferTrainer(as("u_member_arjun"), { memberId: "mem_arjun", toTrainerId: "u_trainer_aditya" }))).toBe("forbidden");
    expect(await code(transferTrainer(as("u_owner"), { memberId: "mem_arjun", toTrainerId: "u_desk_andheri" }))).toBe("invalid");
    expect(await code(transferTrainer(as("u_owner"), { memberId: "mem_arjun", toTrainerId: "u_trainer_meera" }))).toBe("conflict");
    expect(await code(transferTrainer(as("u_owner"), { memberId: "mem_arjun", toTrainerId: "u_trainer_aditya", effectiveOn: "2026-11-01" }))).toBe("invalid");
  });
});
