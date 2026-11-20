import { HEALTH_GRANTABLE_ROLES, type Principal, type StaffLimits } from "@/domain/permissions";
import { ROLE_LABEL } from "@/domain/roles";
import { formatRupees } from "@/lib/when";

/**
 * Who may invite, change and switch off staff, and what each kind of person is allowed to be given (R02, S03), pure. The owner may do everything. A branch manager may do nothing, unless the owner
 * has given them “can invite and manage front desk and trainers”: then only for front desk and trainer accounts whose branches are all the manager’s own, and never a refund limit, discount limit
 * or check-in override beyond their own. The API checks these rules; the screen reads the same answers to say what is allowed before anything is tried.
 */
export type StaffRoleName = "owner" | "branch_manager" | "front_desk" | "finance" | "trainer";
export const STAFF_ROLES: readonly StaffRoleName[] = ["owner", "branch_manager", "front_desk", "finance", "trainer"];
export const FRONTLINE: readonly StaffRoleName[] = ["front_desk", "trainer"];

export const ROLE_ABOUT: Record<StaffRoleName, string> = {
  owner: "Everything in the gym: money, people, plans, policies and reports.",
  branch_manager: "Runs the branches they are given: members, money, schedules, reports and the branch’s hours and rooms.",
  front_desk: "Check-in, new members, payments, bookings and dues at their branches. Never refunds, assessments or progress photos.",
  finance: "Invoices, refunds, reconciliation and cash day close. Never check-in, assessments or progress photos.",
  trainer: "Their own clients: plans, logs, reviews, assessments and their own schedule.",
};

export interface StaffTarget { userId?: string; role: StaffRoleName; branchIds: string[] }
export type Actor = Pick<Principal, "userId" | "role" | "branchIds" | "limits">;

export interface Authority {
  /** “all”: the owner. “frontline”: a branch manager the owner has allowed. “none”: reads only. */
  scope: "all" | "frontline" | "none";
  /** The roles this person may give to someone. */
  roles: readonly StaffRoleName[];
  /** The most this person may give: a refund limit (null: no limit), a discount, and whether they may allow overrides. */
  ceiling: { refundLimitPaise: number | null; maxDiscountBp: number; canOverrideCheckIn: boolean };
  /** Why they can’t manage staff, in words, when scope is none. */
  why?: string;
}

export function authorityOf(a: Actor): Authority {
  if (a.role === "owner") return { scope: "all", roles: STAFF_ROLES, ceiling: { refundLimitPaise: null, maxDiscountBp: 10_000, canOverrideCheckIn: true } };
  if (a.role === "branch_manager" && a.limits?.canManageFrontline === true) {
    return { scope: "frontline", roles: FRONTLINE, ceiling: { refundLimitPaise: a.limits.refundLimitPaise, maxDiscountBp: a.limits.maxDiscountBp, canOverrideCheckIn: a.limits.canOverrideCheckIn } };
  }
  return { scope: "none", roles: [], ceiling: { refundLimitPaise: 0, maxDiscountBp: 0, canOverrideCheckIn: false }, why: a.role === "branch_manager" ? "Only the owner can invite or change staff. Ask them to allow you to manage front desk and trainers." : "Only the owner can invite or change staff." };
}

/** Whether this person may change this person (their role, branches, limits, or switch them off), and why not when they may not. */
export function canManageStaff(actor: Actor, target: StaffTarget): { ok: true } | { ok: false; reason: string } {
  const auth = authorityOf(actor);
  if (auth.scope === "none") return { ok: false, reason: auth.why! };
  if (auth.scope === "all") return { ok: true };
  if (!auth.roles.includes(target.role)) return { ok: false, reason: `Only the owner can change a ${ROLE_LABEL[target.role].toLowerCase()}.` };
  const outside = target.branchIds.filter((b) => !actor.branchIds.includes(b));
  if (outside.length > 0) return { ok: false, reason: "They also work at a branch you don’t manage. Ask the owner to change them." };
  return { ok: true };
}

export interface StaffDraft {
  name: string;
  email: string;
  phone: string;
  role: StaffRoleName | "";
  branchIds: string[];
  limits: StaffLimits;
}
export type StaffErrors = Partial<Record<"name" | "email" | "phone" | "role" | "branchIds" | "refundLimitPaise" | "maxDiscountBp" | "canOverrideCheckIn" | "maxOverridesPerDay" | "canViewClientHealth" | "canManageFrontline", string>>;

/** What a new person of this role starts with: the usual limits for the role, before the owner adjusts them. */
export function defaultLimits(role: StaffRoleName): StaffLimits {
  switch (role) {
    case "owner": return { refundLimitPaise: null, canOverrideCheckIn: true, maxDiscountBp: 2000, canViewClientHealth: false };
    case "branch_manager": return { refundLimitPaise: 5_000_000, canOverrideCheckIn: true, maxDiscountBp: 1000, canViewClientHealth: false, canManageFrontline: false };
    case "front_desk": return { refundLimitPaise: 0, canOverrideCheckIn: true, maxDiscountBp: 500, maxOverridesPerDay: 3, canViewClientHealth: false };
    case "finance": return { refundLimitPaise: 2_500_000, canOverrideCheckIn: false, maxDiscountBp: 500, canViewClientHealth: false };
    case "trainer": return { refundLimitPaise: 0, canOverrideCheckIn: false, maxDiscountBp: 0, canViewClientHealth: false };
  }
}

/** Which limits make sense for a role, so the screen only asks what applies. A front desk can’t approve a refund and a trainer can’t give a discount. */
export function limitsThatApply(role: StaffRoleName): { refund: boolean; discount: boolean; override: boolean; health: boolean; frontline: boolean } {
  return { refund: role === "owner" || role === "branch_manager" || role === "finance", discount: role !== "trainer", override: role === "owner" || role === "branch_manager" || role === "front_desk", health: HEALTH_GRANTABLE_ROLES.includes(role), frontline: role === "branch_manager" };
}

const EMAIL = /^\S+@\S+\.\S+$/;
const MOBILE = /^[6-9]\d{9}$/;
export const digitsOf = (s: string) => s.replace(/\D/g, "").replace(/^(91|0)(?=\d{10}$)/, "");

/**
 * What is wrong with a person’s details and limits, in words, given who is making the change. `emailsTaken` are the addresses of other people in the gym; `allBranchIds` every branch.
 */
export function validateStaff(d: StaffDraft, actor: Actor, ctx: { emailsTaken: string[]; allBranchIds: string[] }): StaffErrors {
  const e: StaffErrors = {};
  const auth = authorityOf(actor);
  const name = d.name.trim().replace(/\s+/g, " ");
  if (name.length < 2) e.name = "Enter the person’s name.";
  else if (name.length > 80) e.name = "Use 80 characters or fewer.";
  const email = d.email.trim().toLowerCase();
  if (!EMAIL.test(email)) e.email = "Enter an email like name@example.in. The invitation goes there.";
  else if (ctx.emailsTaken.some((x) => x.toLowerCase() === email)) e.email = "Someone at this gym already has this email. Use another, or open their account.";
  if (d.phone.trim() && !MOBILE.test(digitsOf(d.phone))) e.phone = "Enter a 10-digit mobile number, or leave it empty.";

  if (!d.role) e.role = "Choose a role.";
  else if (!auth.roles.includes(d.role)) e.role = auth.scope === "none" ? auth.why! : `You can invite ${auth.roles.map((r) => ROLE_LABEL[r].toLowerCase()).join(" and ")} accounts. Ask the owner for anything else.`;

  if (d.role !== "owner") {
    if (d.branchIds.length === 0) e.branchIds = "Choose at least one branch.";
    else if (d.branchIds.some((b) => !ctx.allBranchIds.includes(b))) e.branchIds = "Choose branches from the list.";
    else if (auth.scope === "frontline" && d.branchIds.some((b) => !actor.branchIds.includes(b))) e.branchIds = "You can add people only at your own branches.";
  }

  if (d.role) {
    const applies = limitsThatApply(d.role);
    const l = d.limits;
    if (applies.refund) {
      if (l.refundLimitPaise === null) { if (auth.ceiling.refundLimitPaise !== null) e.refundLimitPaise = `You can give up to ${formatRupees(auth.ceiling.refundLimitPaise)}, your own limit. “No limit” is for the owner to give.`; }
      else if (!Number.isInteger(l.refundLimitPaise) || l.refundLimitPaise < 0) e.refundLimitPaise = "Enter the most they can refund in rupees, for example 25,000.";
      else if (auth.ceiling.refundLimitPaise !== null && l.refundLimitPaise > auth.ceiling.refundLimitPaise) e.refundLimitPaise = `You can give up to ${formatRupees(auth.ceiling.refundLimitPaise)}, your own limit.`;
    }
    if (applies.discount) {
      if (!Number.isInteger(l.maxDiscountBp) || l.maxDiscountBp < 0 || l.maxDiscountBp > 10_000) e.maxDiscountBp = "Enter a percentage from 0 to 100.";
      else if (l.maxDiscountBp > auth.ceiling.maxDiscountBp) e.maxDiscountBp = `You can give up to ${Number((auth.ceiling.maxDiscountBp / 100).toFixed(2))}%, your own limit.`;
    }
    if (applies.override && l.canOverrideCheckIn && !auth.ceiling.canOverrideCheckIn) e.canOverrideCheckIn = "You can’t let someone override a check-in when you can’t yourself.";
    if (applies.override && l.canOverrideCheckIn && l.maxOverridesPerDay !== null && l.maxOverridesPerDay !== undefined && (!Number.isInteger(l.maxOverridesPerDay) || l.maxOverridesPerDay < 0 || l.maxOverridesPerDay > 100)) e.maxOverridesPerDay = "Enter 0 to 100 a day, or leave it empty for no limit.";
    if (l.canViewClientHealth && !applies.health) e.canViewClientHealth = "Only an owner or a branch manager can be given access to client health and progress photos.";
    if (l.canViewClientHealth && auth.scope !== "all") e.canViewClientHealth = "Only the owner can give access to client health and progress photos.";
    if (l.canManageFrontline && !applies.frontline) e.canManageFrontline = "Only a branch manager can be allowed to manage front desk and trainers.";
    if (l.canManageFrontline && auth.scope !== "all") e.canManageFrontline = "Only the owner can allow a branch manager to manage staff.";
  }
  return e;
}

/** The limits a person of this role actually carries: only what applies, the rest at its safe value, so a hidden box can never keep a stale permission. */
export function cleanLimits(role: StaffRoleName, l: StaffLimits): StaffLimits {
  const a = limitsThatApply(role);
  const out: StaffLimits = {
    refundLimitPaise: a.refund ? l.refundLimitPaise : 0,
    canOverrideCheckIn: a.override ? l.canOverrideCheckIn : false,
    maxDiscountBp: a.discount ? l.maxDiscountBp : 0,
    canViewClientHealth: a.health ? l.canViewClientHealth : false,
  };
  if (a.override && l.canOverrideCheckIn && l.maxOverridesPerDay !== undefined) out.maxOverridesPerDay = l.maxOverridesPerDay;
  if (a.frontline) out.canManageFrontline = l.canManageFrontline === true;
  return out;
}

/** A person’s access in one or two sentences: the role and where, then what the limits let them do. Shown beside the form and in the list. */
export function accessSummary(role: StaffRoleName, branchNames: string[], l: StaffLimits): string[] {
  const where = role === "owner" ? "every branch" : branchNames.join(", ") || "no branch yet";
  const a = limitsThatApply(role);
  const out = [`${ROLE_LABEL[role]} at ${where}.`];
  if (a.refund) out.push(l.refundLimitPaise === null ? "Can approve refunds of any size." : l.refundLimitPaise === 0 ? "Can’t approve refunds." : `Can approve refunds up to ${formatRupees(l.refundLimitPaise)}.`);
  if (a.discount) out.push(l.maxDiscountBp === 0 ? "Can’t give discounts." : `Can give discounts up to ${Number((l.maxDiscountBp / 100).toFixed(2))}%.`);
  if (a.override) out.push(!l.canOverrideCheckIn ? "Can’t let a member in by override." : l.maxOverridesPerDay === null || l.maxOverridesPerDay === undefined ? "Can let a member in by override, with a reason." : `Can let a member in by override, with a reason, ${l.maxOverridesPerDay} a day.`);
  if (a.health) out.push(l.canViewClientHealth ? "Can open client health records and progress photos; every view is logged." : "Can’t open client health records or progress photos.");
  if (a.frontline) out.push(l.canManageFrontline ? "Can invite and manage front desk and trainers at their branches." : "Can’t invite or change staff.");
  return out;
}

export interface LimitChange { field: string; from: string; to: string }

/** The difference between two sets of access, in words, for the audit log and the confirmation. */
export function accessChanges(before: { role: StaffRoleName; branchNames: string[]; limits: StaffLimits }, after: { role: StaffRoleName; branchNames: string[]; limits: StaffLimits }): LimitChange[] {
  const out: LimitChange[] = [];
  if (before.role !== after.role) out.push({ field: "Role", from: ROLE_LABEL[before.role], to: ROLE_LABEL[after.role] });
  if ([...before.branchNames].sort().join(", ") !== [...after.branchNames].sort().join(", ")) out.push({ field: "Branches", from: before.branchNames.join(", ") || "none", to: after.branchNames.join(", ") || "none" });
  const refund = (p: number | null) => (p === null ? "No limit" : formatRupees(p));
  if (before.limits.refundLimitPaise !== after.limits.refundLimitPaise) out.push({ field: "Refund limit", from: refund(before.limits.refundLimitPaise), to: refund(after.limits.refundLimitPaise) });
  if (before.limits.maxDiscountBp !== after.limits.maxDiscountBp) out.push({ field: "Discount limit", from: `${Number((before.limits.maxDiscountBp / 100).toFixed(2))}%`, to: `${Number((after.limits.maxDiscountBp / 100).toFixed(2))}%` });
  const yn = (b: boolean | undefined) => (b ? "Yes" : "No");
  if (before.limits.canOverrideCheckIn !== after.limits.canOverrideCheckIn) out.push({ field: "Can override a check-in", from: yn(before.limits.canOverrideCheckIn), to: yn(after.limits.canOverrideCheckIn) });
  const cap = (n: number | null | undefined) => (n === null || n === undefined ? "No limit" : `${n} a day`);
  if ((before.limits.maxOverridesPerDay ?? null) !== (after.limits.maxOverridesPerDay ?? null)) out.push({ field: "Overrides a day", from: cap(before.limits.maxOverridesPerDay), to: cap(after.limits.maxOverridesPerDay) });
  if (before.limits.canViewClientHealth !== after.limits.canViewClientHealth) out.push({ field: "Can view client health and progress photos", from: yn(before.limits.canViewClientHealth), to: yn(after.limits.canViewClientHealth) });
  if ((before.limits.canManageFrontline ?? false) !== (after.limits.canManageFrontline ?? false)) out.push({ field: "Can invite and manage front desk and trainers", from: yn(before.limits.canManageFrontline), to: yn(after.limits.canManageFrontline) });
  return out;
}
