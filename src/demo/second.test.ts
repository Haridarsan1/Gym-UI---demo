import { beforeEach, describe, expect, it } from "vitest";
import { open } from "@/api/context";
import { resetDemo } from "@/demo";
import { db } from "@/demo/db";
import { DEMO_ACCOUNTS } from "@/app/demoAccounts";
import { sessionFor } from "@/app/demoSignIn";

const as = (userId: string) => sessionFor(DEMO_ACCOUNTS.find((a) => a.userId === userId)!);
const lotusMembers = () => db.members.where("tenantId").equals("t_lotus").count();

beforeEach(async () => { await resetDemo({ training: false }); });

describe("the second gym and Ember’s invoices are built when someone first needs them", () => {
  it("a member’s or a desk’s visit to Pulse Fitness builds neither", async () => {
    await open(as("u_member_arjun"));
    await open(as("u_desk_andheri"));
    await open(as("u_trainer_meera"));
    expect(await db.tenants.get("t_lotus")).toBeUndefined();
    expect(await db.users.get("u_lotus_owner")).toBeUndefined();
    expect(await db.saasInvoices.count()).toBe(0);
  });

  it("signing in as one of Lotus’s people builds Lotus, once", async () => {
    await open(as("u_lotus_member"));
    const first = await lotusMembers();
    expect(first).toBeGreaterThan(0);
    expect(await db.users.get("u_lotus_owner")).toBeDefined();
    await open(as("u_lotus_owner"));
    expect(await lotusMembers()).toBe(first);
  });

  it("an Ember administrator opening the console builds Lotus and the invoices", async () => {
    await open(as("u_admin"));
    expect(await lotusMembers()).toBeGreaterThan(0);
    expect(await db.saasInvoices.where("tenantId").equals("t_pulse").count()).toBe(4);
    await open(as("u_admin"));
    expect(await db.saasInvoices.where("tenantId").equals("t_pulse").count()).toBe(4);
  });

  it("an owner opening Pulse Fitness gets its invoices, and not Lotus", async () => {
    await open(as("u_owner"));
    expect(await db.saasInvoices.where("tenantId").equals("t_pulse").count()).toBe(4);
    expect(await db.tenants.get("t_lotus")).toBeUndefined();
  });

  it("a reset puts both back to unbuilt", async () => {
    await open(as("u_admin"));
    await resetDemo({ training: false });
    expect(await db.tenants.get("t_lotus")).toBeUndefined();
    expect(await db.saasInvoices.count()).toBe(0);
    await open(as("u_admin"));
    expect(await lotusMembers()).toBeGreaterThan(0);
  });
});
