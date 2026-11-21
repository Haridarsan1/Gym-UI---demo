import { DEMO_ACCOUNTS, LOTUS_BRANCH, LOTUS_BRANCHES, LOTUS_NAME, LOTUS_TENANT_ID } from "@/app/demoAccounts";
import { invoiceTotals, placeOfSupplyFor } from "@/domain/billing";
import { addDays, istDateTime, todayIST } from "@/domain/dates";
import { financialYear, formatNumber, seriesKey } from "@/domain/numbering";
import { POLICY_DEFAULTS } from "@/domain/policyDefaults";
import type { Branch, CheckIn, Consent, GymPolicies, Invoice, Member, Membership, MembershipPlan, NumberSeries, Payment, StaffRole, Tenant, User } from "@/domain/types";
import { LOTUS_LOGO_URL } from "@/demo/lotusLogo";
import { hash } from "@/demo/seedPlans";

/**
 * Lotus Strength Club (S03): a second gym with its own name, two branches in Pune, its own plans, people and money, small enough to read at a glance. It exists so that tenant isolation can be shown:
 * nothing in it is Pulse Fitness’s, and nothing in Pulse Fitness is its. Everything is made from hashes of ids, so it is the same every time, and relative to today.
 */
const FIRST = ["Nisha", "Rohan", "Meghna", "Aditya", "Kavita", "Sameer", "Pooja", "Vivek", "Ishita", "Rahul", "Tanvi", "Kunal", "Shruti", "Omkar", "Rutuja", "Yash", "Mrunal", "Harsh", "Neelam", "Prasad"];
const LAST = ["Bhat", "Kulkarni", "Joshi", "Patil", "Deshmukh", "Gokhale", "Jadhav", "Phadke", "More", "Naik", "Shinde", "Apte"];

export interface LotusSeed {
  tenants: Tenant[]; branches: Branch[]; users: User[]; staffRoles: StaffRole[]; members: Member[]; membershipPlans: MembershipPlan[]; memberships: Membership[]; consents: Consent[];
  invoices: Invoice[]; payments: Payment[]; numberSeries: NumberSeries[]; gymPolicies: GymPolicies[]; checkIns: CheckIn[];
}

export function generateLotus(now: Date): LotusSeed {
  const today = todayIST(now);
  const at = (d: string) => `${d}T04:30:00.000Z`;
  const T = LOTUS_TENANT_ID;
  const accounts = DEMO_ACCOUNTS.filter((a) => a.tenantId === T);
  const hours = [1, 2, 3, 4, 5, 6].map((weekday) => ({ weekday, open: "06:00", close: "21:00" }));

  const tenants: Tenant[] = [{
    id: T, name: LOTUS_NAME, slug: "lotus-strength-club", gstin: "27AAHCL5678K1Z2", legalName: "Lotus Strength Club LLP", address: "Lane 6, Koregaon Park, Pune 411001, Maharashtra", logoUrl: LOTUS_LOGO_URL, currency: "INR", timeZone: "Asia/Kolkata",
    subscription: { state: "trial", saasPlanId: "sp_growth", trialEndsAt: at(addDays(today, 5)), renewsOn: addDays(today, 5) }, createdAt: at(addDays(today, -9)),
  }];
  const branches: Branch[] = [
    { id: LOTUS_BRANCH.koregaon, tenantId: T, invoicePrefix: "LSKP", name: "Koregaon Park", city: "Pune", address: "Lane 6, Koregaon Park", stateCode: "27", hours, rooms: [{ id: "rm_lotus_kp_a", name: "Main floor", capacity: 30 }, { id: "rm_lotus_kp_b", name: "Mat studio", capacity: 14 }], active: true },
    { id: LOTUS_BRANCH.baner, tenantId: T, invoicePrefix: "LSBN", name: "Baner", city: "Pune", address: "Baner Road, near Balewadi Phata", stateCode: "27", hours, rooms: [{ id: "rm_lotus_baner_a", name: "Main floor", capacity: 24 }], active: true },
  ];
  const users: User[] = accounts.map((a) => ({ id: a.userId, tenantId: T, name: a.name, email: a.email, phone: a.phone, role: a.role, status: "active", mfaEnabled: a.role === "owner", memberId: a.memberId, createdAt: at(addDays(today, -100)) }));
  const staffRoles: StaffRole[] = accounts.filter((a) => a.role !== "member" && a.limits).map((a) => ({ id: `sr_${a.userId}`, tenantId: T, userId: a.userId, role: a.role as StaffRole["role"], branchIds: a.branchIds, limits: a.limits! }));

  const plan = (id: string, name: string, kind: MembershipPlan["kind"], pricePaise: number, extra: Partial<MembershipPlan>): MembershipPlan => ({ id, tenantId: T, name, kind, pricePaise, taxRateBp: 1800, branchIds: LOTUS_BRANCHES, effectiveFrom: "2026-01-01", active: true, ...extra });
  const membershipPlans: MembershipPlan[] = [
    plan("pl_lotus_month", "Monthly", "time", 200_000, { durationDays: 30 }),
    plan("pl_lotus_quarter", "Quarterly", "time", 540_000, { durationDays: 90 }),
    plan("pl_lotus_annual", "Annual", "time", 1_800_000, { durationDays: 365 }),
    plan("pl_lotus_visits", "12-visit pass", "visit", 260_000, { visits: 12, durationDays: 60 }),
  ];
  const terms = (p: MembershipPlan): Membership["terms"] => ({ name: p.name, kind: p.kind, pricePaise: p.pricePaise, taxRateBp: p.taxRateBp, durationDays: p.durationDays, visits: p.visits, branchIds: p.branchIds });

  const members: Member[] = [];
  const memberships: Membership[] = [];
  const consents: Consent[] = [];
  const invoices: Invoice[] = [];
  const payments: Payment[] = [];
  const checkIns: CheckIn[] = [];
  const weights: Array<[string, number]> = [["pl_lotus_month", 45], ["pl_lotus_quarter", 25], ["pl_lotus_annual", 15], ["pl_lotus_visits", 15]];
  for (let i = 1; i <= 36; i++) {
    const id = `mem_lotus_${String(i).padStart(3, "0")}`;
    const acct = accounts.find((a) => a.memberId === id);
    const branchId = acct?.branchIds[0] ?? (hash(id) % 2 === 0 ? LOTUS_BRANCH.koregaon : LOTUS_BRANCH.baner);
    const name = acct?.name ?? `${FIRST[hash(`${id}f`) % FIRST.length]} ${LAST[hash(`${id}l`) % LAST.length]}`;
    const roll = hash(`${id}p`) % 100;
    let acc = 0;
    const planId = weights.find(([, w]) => (acc += w) > roll)![0];
    const p = membershipPlans.find((x) => x.id === planId)!;
    const duration = p.durationDays ?? 30;
    const state = i === 1 ? "active" : i % 9 === 0 ? "expired" : i % 11 === 0 ? "frozen" : i % 13 === 0 ? "pending" : "active";
    const elapsed = 1 + (hash(`${id}e`) % Math.max(1, Math.min(duration - 3, 40)));
    const startsOn = state === "expired" ? addDays(today, -(duration + 1 + (hash(`${id}x`) % 20))) : state === "pending" ? today : addDays(today, -elapsed);
    const endsOn = addDays(startsOn, duration);
    members.push({ id, tenantId: T, userId: acct?.userId, name, phone: acct?.phone ?? String(9_300_001_000 + i), email: acct?.email ?? (i % 3 === 0 ? undefined : `${name.toLowerCase().replace(/\s+/g, ".")}@example.in`), homeBranchId: branchId, joinedOn: startsOn, qrToken: `qr-${id}-${100000 + hash(id) % 899999}`, leadSource: ["Walk-in", "Instagram", "Referral", "Google"][hash(`${id}s`) % 4] });
    memberships.push({
      id: `ms_${id}`, tenantId: T, memberId: id, planId, terms: terms(p), status: state, startsOn, endsOn, visitsRemaining: p.kind === "visit" ? (state === "expired" ? 1 : 12 - (hash(`${id}v`) % 9)) : null,
      freezes: state === "frozen" ? [{ from: addDays(today, -3), to: addDays(today, 8), reason: "Travel" }] : [], autoRenew: false, createdAt: at(startsOn),
    });
    for (const [scope, chance] of [["data_processing", 100], ["photos", 40], ["assessments", 55], ["marketing", 45]] as const) if (chance === 100 || hash(`${id}${scope}`) % 100 < chance) consents.push({ id: `cn_${id}_${scope}`, tenantId: T, memberId: id, scope, grantedAt: at(startsOn), noticeVersion: "2026-01", recordedBy: "u_lotus_desk" });

    // The sale behind the membership: an invoice with GST on the day it started, paid the same day (cash at the desk, or UPI).
    if (state !== "pending") {
      const lines = [{ description: `${p.name} membership`, quantity: 1, unitPaise: p.pricePaise, taxRateBp: p.taxRateBp }];
      const totals = invoiceTotals(lines);
      const method = hash(`${id}m`) % 3 === 0 ? "cash" : "upi";
      invoices.push({ id: `inv_${id}`, tenantId: T, number: "", memberId: id, membershipId: `ms_${id}`, branchId, placeOfSupply: placeOfSupplyFor("27"), issuedOn: startsOn, dueOn: addDays(startsOn, 3), lines, ...totals, status: "paid", createdAt: istDateTime(startsOn, "10:00") });
      payments.push({ id: `pay_${id}`, tenantId: T, invoiceId: `inv_${id}`, memberId: id, branchId, method, amountPaise: totals.totalPaise, status: "succeeded", receivedAt: istDateTime(startsOn, "10:15"), receivedBy: method === "cash" ? "u_lotus_desk" : undefined, receiptNumber: `RCP-LOTUS-${String(i).padStart(4, "0")}`, reference: method === "upi" ? `UPI${900_000_000_000 + hash(id) % 99_999_999_999}` : undefined, gatewayEventId: method === "upi" ? `gw_evt_${id}` : undefined, idempotencyKey: `seed-lotus-${id}`, reconciliation: { status: "matched" } });
    }
    // Visits over the last three weeks.
    if (state === "active") for (let back = 1; back <= 21; back++) {
      const date = addDays(today, -back);
      if (date < startsOn || hash(`${id}${date}`) % 100 >= 38) continue;
      checkIns.push({ id: `ci_${id}_${date}`, tenantId: T, memberId: id, branchId, membershipId: `ms_${id}`, at: istDateTime(date, `${String(6 + (hash(`${id}${date}h`) % 3 === 0 ? 12 : hash(`${id}${date}h`) % 3)).padStart(2, "0")}:15`), method: "qr", result: "allowed", visitDebited: false, recordedBy: "u_lotus_desk" });
    }
  }

  // GST numbers: consecutive within each branch prefix and financial year, in the order issued.
  const series = new Map<string, NumberSeries>();
  const prefix = new Map(branches.map((b) => [b.id, b.invoicePrefix]));
  const numbered = [...invoices].sort((a, b) => a.issuedOn.localeCompare(b.issuedOn) || a.id.localeCompare(b.id)).map((inv) => {
    const px = prefix.get(inv.branchId)!;
    const fy = financialYear(inv.issuedOn);
    const key = seriesKey(T, px, fy);
    const row = series.get(key) ?? { id: key, tenantId: T, prefix: px, financialYear: fy, last: 0 };
    row.last += 1;
    series.set(key, row);
    return { ...inv, number: formatNumber(px, fy, row.last) };
  });

  const gymPolicies: GymPolicies[] = [{ id: `pol_${T}`, tenantId: T, ...POLICY_DEFAULTS }];
  return { tenants, branches, users, staffRoles, members, membershipPlans, memberships, consents, invoices: numbered, payments, numberSeries: [...series.values()], gymPolicies, checkIns };
}
