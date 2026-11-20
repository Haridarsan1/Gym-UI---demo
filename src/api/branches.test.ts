import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { DEMO_ACCOUNTS } from "@/app/demoAccounts";
import type { Session } from "@/app/session";
import { setNow } from "@/api/clock";
import { getBranches, saveBranch, type SaveBranchInput } from "@/api/branches";
import { isApiError } from "@/api/errors";
import { resetDemo } from "@/demo";
import { db } from "@/demo/db";

const as = (userId: string): Session => {
  const a = DEMO_ACCOUNTS.find((x) => x.userId === userId)!;
  return { userId: a.userId, name: a.name, role: a.role, tenantId: a.tenantId, branchIds: a.branchIds, memberId: a.memberId, limits: a.limits };
};
const err = async (p: Promise<unknown>) => { try { await p; } catch (e) { return isApiError(e) ? { code: e.code, message: e.message, details: e.details } : { code: "other", message: String(e), details: undefined }; } return { code: "resolved", message: "", details: undefined }; };
const owner = as("u_owner");
const bm = as("u_bm_bandra");
let n = 0;
const key = () => `branch-key-${++n}-${Math.random().toString(36).slice(2)}`;
/** The branch as it is, ready to be saved with changes, the way the screen sends it. */
const draft = async (branchId: string, over: Partial<SaveBranchInput> = {}): Promise<SaveBranchInput> => {
  const b = (await getBranches(owner)).branches.find((x) => x.id === branchId)!;
  return { key: key(), branchId, address: b.address ?? "", hours: b.hours, rooms: b.rooms.map((r) => ({ id: r.id, name: r.name, capacity: r.capacity })), ...over };
};

beforeEach(async () => { setNow(new Date("2026-11-17T06:30:00.000Z")); await resetDemo(); });
afterAll(() => setNow(null));

describe("the branch list", () => {
  it("shows the owner every branch with its week in words, rooms, and the sessions booked into each room", async () => {
    const v = await getBranches(owner);
    expect(v.branches.map((b) => b.name)).toEqual(["Andheri", "Bandra", "Powai"]);
    const a = v.branches[0]!;
    expect(a).toMatchObject({ stateName: "Maharashtra", invoicePrefix: "PFAND", week: ["Mon to Fri 5:30 am to 10:30 pm", "Sat 6 am to 8 pm", "Sun 7 am to 1 pm"] });
    expect(a.rooms.map((r) => [r.name, r.capacity])).toEqual([["Studio A", 20], ["Studio B", 15]]);
    expect(a.rooms.reduce((x, r) => x + r.upcoming, 0)).toBeGreaterThan(0);
    expect(a.staff).toBeGreaterThan(3);
    expect(a.members).toBeGreaterThan(30);
  });

  it("a branch manager sees and edits only their own branch; desk, finance, trainers and members are refused", async () => {
    expect((await getBranches(bm)).branches.map((b) => b.name)).toEqual(["Bandra"]);
    expect((await err(saveBranch(bm, await draft("br_andheri", { address: "Somewhere else" })))).message).toBe("That branch isn’t one you manage.");
    for (const id of ["u_desk_andheri", "u_finance", "u_trainer_meera", "u_member_arjun", "u_admin"]) expect((await err(getBranches(as(id)))).code, id).toBe("forbidden");
  });
});

describe("changing a branch", () => {
  it("saves hours, address and rooms, and writes one audit entry that says what it was and what it became", async () => {
    const b = (await getBranches(owner)).branches.find((x) => x.id === "br_bandra")!;
    const hours = b.hours.map((h) => (h.weekday === 0 ? { ...h, open: "08:00", close: "12:00" } : h));
    const r = await saveBranch(bm, await draft("br_bandra", { address: "Hill Road, Bandra West, Mumbai 400050", hours, rooms: [...b.rooms.map((x) => ({ id: x.id, name: x.name, capacity: x.capacity })), { name: "Cycle room", capacity: 12 }] }));
    expect(r.changes).toEqual(["Address: Hill Road, Bandra West to Hill Road, Bandra West, Mumbai 400050", "Opening hours: Mon to Fri 5:30 am to 10:30 pm; Sat 6 am to 8 pm; Sun 7 am to 1 pm to Mon to Fri 5:30 am to 10:30 pm; Sat 6 am to 8 pm; Sun 8 am to 12 pm", "Room added: Cycle room, holds 12"]);
    const saved = (await db.branches.get("br_bandra"))!;
    expect(saved.rooms.map((x) => x.name)).toEqual(["Studio A", "Cycle room"]);
    expect(saved.rooms[1]!.id).toMatch(/^rm_bandra_/);
    expect(saved.hours.find((h) => h.weekday === 0)).toEqual({ weekday: 0, open: "08:00", close: "12:00" });
    const e = (await db.auditEvents.where("action").equals("branch.change").toArray());
    expect(e).toHaveLength(1);
    expect(e[0]).toMatchObject({ actorId: "u_bm_bandra", entityId: "br_bandra", details: { name: "Bandra", changes: r.changes } });
    // The GST state and the invoice prefix are not this screen’s to change.
    expect(saved).toMatchObject({ stateCode: "27", invoicePrefix: "PFBAN" });
  });

  it("the same form twice, or a save that changes nothing, writes nothing more", async () => {
    const d = await draft("br_bandra", { address: "Hill Road, Bandra" });
    await saveBranch(owner, d);
    expect((await saveBranch(owner, d)).repeated).toBe(true);
    expect((await saveBranch(owner, await draft("br_bandra"))).changes).toEqual([]);
    expect(await db.auditEvents.where("action").equals("branch.change").count()).toBe(1);
  });

  it("says what is wrong and writes nothing", async () => {
    const b = (await getBranches(owner)).branches[0]!;
    const bad = await err(saveBranch(owner, await draft("br_andheri", { hours: b.hours.map((h) => (h.weekday === 1 ? { ...h, open: "23:00" } : h)) })));
    expect(bad).toMatchObject({ code: "invalid", message: "It has to open before it closes." });
    expect((await err(saveBranch(owner, await draft("br_andheri", { hours: [] })))).message).toBe("A branch has to be open on at least one day.");
    expect((await err(saveBranch(owner, await draft("br_andheri", { rooms: [{ name: "A", capacity: 5 }, { name: "a", capacity: 5 }] })))).message).toBe("Another room has this name.");
    expect(await db.auditEvents.where("action").equals("branch.change").count()).toBe(0);
  });

  it("a room with sessions still to come can’t be removed, and the message says how many; an empty one can", async () => {
    const v = await getBranches(owner);
    const a = v.branches.find((x) => x.id === "br_andheri")!;
    const busy = a.rooms.find((r) => r.upcoming > 0)!;
    const without = (id: string) => a.rooms.filter((r) => r.id !== id).map((r) => ({ id: r.id, name: r.name, capacity: r.capacity }));
    const r = await err(saveBranch(owner, await draft("br_andheri", { rooms: without(busy.id) })));
    expect(r.code).toBe("conflict");
    expect(r.message).toBe(`${busy.name} has ${busy.upcoming} ${busy.upcoming === 1 ? "session" : "sessions"} booked. Move ${busy.upcoming === 1 ? "it" : "them"} to another room first.`);
    expect((await db.branches.get("br_andheri"))!.rooms).toHaveLength(2);
    const { branch } = await saveBranch(owner, await draft("br_andheri", { rooms: [...a.rooms.map((x) => ({ id: x.id, name: x.name, capacity: x.capacity })), { name: "Spare room", capacity: 6 }] }));
    const spare = branch.rooms.find((x) => x.name === "Spare room")!;
    const removed = await saveBranch(owner, await draft("br_andheri", { rooms: branch.rooms.filter((x) => x.id !== spare.id).map((x) => ({ id: x.id, name: x.name, capacity: x.capacity })) }));
    expect(removed.changes).toEqual(["Room removed: Spare room"]);
  });

  it("shorter hours never cancel a booked session, and say how many now fall outside them", async () => {
    const before = (await db.bookings.toArray()).filter((b) => b.branchId === "br_andheri" && b.status === "booked" && b.startsAt >= "2026-11-17T06:30:00.000Z").length;
    expect(before).toBeGreaterThan(0);
    const b = (await getBranches(owner)).branches.find((x) => x.id === "br_andheri")!;
    // Open only from 10 am to 4 pm on weekdays: every early morning and evening session is outside.
    const r = await saveBranch(owner, await draft("br_andheri", { hours: b.hours.filter((h) => h.weekday >= 1 && h.weekday <= 5).map((h) => ({ ...h, open: "10:00", close: "16:00" })) }));
    expect(r.outsideHours).toBeGreaterThan(0);
    expect((await db.bookings.toArray()).filter((x) => x.branchId === "br_andheri" && x.status === "booked" && x.startsAt >= "2026-11-17T06:30:00.000Z")).toHaveLength(before);
    expect((await db.auditEvents.where("action").equals("branch.change").toArray())[0]!.details).toMatchObject({ sessionsOutsideNewHours: r.outsideHours });
  });
});
