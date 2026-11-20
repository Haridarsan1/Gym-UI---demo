import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { DEMO_ACCOUNTS } from "@/app/demoAccounts";
import type { Session } from "@/app/session";
import { setNow } from "@/api/clock";
import { isApiError } from "@/api/errors";
import { getMe } from "@/api/me";
import { getReceipt } from "@/api/membership";
import { getSettings, saveSettings } from "@/api/settings";
import { getSubscription } from "@/api/subscription";
import { resetDemo } from "@/demo";
import { db } from "@/demo/db";
import { PULSE_LOGO_URL } from "@/demo/pulseLogo";
import { gstinState, validateProfile } from "@/domain/settings";
import { usageLevel } from "@/domain/subscription";

const as = (userId: string): Session => {
  const a = DEMO_ACCOUNTS.find((x) => x.userId === userId)!;
  return { userId: a.userId, name: a.name, role: a.role, tenantId: a.tenantId, branchIds: a.branchIds, memberId: a.memberId, limits: a.limits };
};
const err = async (p: Promise<unknown>) => { try { await p; } catch (e) { return isApiError(e) ? { code: e.code, message: e.message } : { code: "other", message: String(e) }; } return { code: "resolved", message: "" }; };
const owner = as("u_owner");
let n = 0;
const key = () => `set-key-${++n}-${Math.random().toString(36).slice(2)}`;
const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFElEQVR4nGP8z8Dwn4GBgYGJAQoAHxMCAkQ3nO4AAAAASUVORK5CYII=";
const base = async () => { const s = await getSettings(owner); return { name: s.name, legalName: s.legalName, gstin: s.gstin, address: s.address }; };

beforeEach(async () => { setNow(new Date("2026-11-17T06:30:00.000Z")); await resetDemo(); });
afterAll(() => setNow(null));

describe("checking the profile", () => {
  it("says what is wrong in words", () => {
    const d = { name: "Pulse", legalName: "", gstin: "", address: "" };
    expect(validateProfile(d)).toEqual({});
    expect(validateProfile({ ...d, name: "P" }).name).toMatch(/Enter the gym’s name/);
    expect(validateProfile({ ...d, gstin: "27AABCP1234F1" }).gstin).toBe("A GSTIN is 15 characters, like 27AABCP1234F1Z5. Check it, or leave it empty.");
    expect(validateProfile({ ...d, gstin: "99AABCP1234F1Z5" }).gstin).toBe("The first two digits (99) aren’t a state code. Check the GSTIN.");
    expect(validateProfile(d, "data:text/html;base64,AAAA").logo).toBe("Use a PNG, JPG, WebP or SVG image.");
    expect(validateProfile(d, `data:image/png;base64,${"A".repeat(400_001)}`).logo).toBe("That image is too large. Use one under about 300 KB.");
    expect(gstinState("27AABCP1234F1Z5")).toBe("Maharashtra");
  });
  it("a limit is full at the limit and near from 80%", () => { expect([usageLevel(79, 100), usageLevel(80, 100), usageLevel(100, 100), usageLevel(5, null)]).toEqual(["ok", "near", "full", "none"]); });
});

describe("settings", () => {
  it("is the owner’s alone", async () => {
    for (const id of ["u_bm_bandra", "u_desk_andheri", "u_finance", "u_trainer_meera", "u_member_arjun", "u_admin"]) {
      expect((await err(getSettings(as(id)))).code, id).toBe("forbidden");
      expect((await err(saveSettings(as(id), { key: key(), ...(await base()), logo: PNG }))).code, id).toBe("forbidden");
    }
    expect((await db.tenants.toArray())[0]!.logoUrl).toBe(PULSE_LOGO_URL);
  });

  it("a saved logo and name are what the header, the sidebar and every receipt read, for staff and members alike; the audit entry says logo replaced, not the image", async () => {
    const r = await saveSettings(owner, { key: key(), ...(await base()), name: "Pulse Fitness Mumbai", logo: PNG });
    expect(r.changes).toEqual(["Name: Pulse Fitness to Pulse Fitness Mumbai", "Logo: replaced"]);
    for (const id of ["u_owner", "u_desk_andheri", "u_member_arjun", "u_trainer_meera"]) expect((await getMe(as(id))).tenant, id).toMatchObject({ name: "Pulse Fitness Mumbai", logoUrl: PNG });
    const inv = (await db.invoices.where("memberId").equals("mem_arjun").first())!;
    expect((await getReceipt(as("u_member_arjun"), inv.id)).supplier).toMatchObject({ name: "Pulse Fitness Mumbai", logoUrl: PNG });
    const e = (await db.auditEvents.where("action").equals("settings.change").toArray())[0]!;
    expect(e).toMatchObject({ actorId: "u_owner", details: { changes: r.changes } });
    expect(JSON.stringify(e)).not.toContain("base64");
    expect((await saveSettings(owner, { key: key(), ...(await base()), logo: null })).changes).toEqual(["Logo: removed"]);
    expect((await getMe(owner)).tenant!.logoUrl).toBeUndefined();
  });

  it("refuses bad details and a wrong kind of file, and writes nothing; the same save twice, or no change, adds no entry", async () => {
    expect((await err(saveSettings(owner, { key: key(), ...(await base()), gstin: "nope" }))).message).toMatch(/A GSTIN is 15 characters/);
    expect((await err(saveSettings(owner, { key: key(), ...(await base()), logo: "data:application/pdf;base64,AAAA" }))).message).toBe("Use a PNG, JPG, WebP or SVG image.");
    expect(await db.auditEvents.where("action").equals("settings.change").count()).toBe(0);
    const k = key();
    await saveSettings(owner, { key: k, ...(await base()), address: "New road, Mumbai" });
    expect((await saveSettings(owner, { key: k, ...(await base()), address: "New road, Mumbai" })).repeated).toBe(true);
    expect((await saveSettings(owner, { key: key(), ...(await base()) })).changes).toEqual([]);
    expect(await db.auditEvents.where("action").equals("settings.change").count()).toBe(1);
  });
});

describe("the subscription", () => {
  it("is the owner’s alone, and shows the plan, the state and what is used against each limit", async () => {
    for (const id of ["u_bm_bandra", "u_desk_andheri", "u_finance", "u_member_arjun", "u_admin"]) expect((await err(getSubscription(as(id)))).code, id).toBe("forbidden");
    const v = await getSubscription(owner);
    expect(v).toMatchObject({ gym: "Pulse Fitness", state: "trial", plan: { name: "Growth" }, trialEndsAt: "2026-11-29", daysLeft: 12 });
    expect(v.usage.map((u) => [u.key, u.used, u.limit, u.level])).toEqual([["branches", 3, 3, "full"], ["staff", 12, 20, "ok"], ["activeMembers", v.usage[2]!.used, 250, "ok"]]);
    expect(v.usage[2]!.used).toBeGreaterThan(90);
    expect(v.plans.map((p) => p.name)).toEqual(["Starter", "Growth", "Pro", "Enterprise"].filter((x) => v.plans.some((p) => p.name === x)));
    expect(v.rule.now).toMatch(/Everything in your plan works/);
  });
  it("counts staff who are switched off out of the limit", async () => {
    await db.users.update("u_trainer_aditya", { status: "disabled" });
    expect((await getSubscription(owner)).usage.find((u) => u.key === "staff")!.used).toBe(11);
  });
});
