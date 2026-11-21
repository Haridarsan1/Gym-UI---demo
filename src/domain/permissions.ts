import type { Role } from "@/domain/roles";

/**
 * One permission map for the whole app (S03). Routes, navigation, buttons and API calls all ask `can()`.
 * Anything not listed here is denied.
 *
 * Scope says which records the role may touch for an action:
 *   own           the person's own records (a member's own data, a trainer's own schedule)
 *   assigned      members the person currently trains
 *   branch        records in the branches the person is assigned to
 *   organisation  every record in the gym
 *   platform      Ember's own administration. Never includes a gym's records.
 */
export type Scope = "own" | "assigned" | "branch" | "organisation" | "platform";

const W: Scope = "own";
const A: Scope = "assigned";
const B: Scope = "branch";
const O: Scope = "organisation";
const P: Scope = "platform";

type Grants = Partial<Record<Role, Scope>>;

const GRANTS = {
  // People and consent
  "member.read": { owner: O, branch_manager: B, front_desk: B, finance: B, trainer: A, member: W },
  /** Browsing the member list. Members open only their own record, so they cannot list. */
  "member.list": { owner: O, branch_manager: B, front_desk: B, finance: B, trainer: A },
  "member.create": { owner: O, branch_manager: B, front_desk: B },
  "member.update": { owner: O, branch_manager: B, front_desk: B, member: W },
  "trainer.assign": { owner: O, branch_manager: B, front_desk: B },
  "consent.read": { owner: O, branch_manager: B, front_desk: B, trainer: A, member: W },
  "consent.write": { owner: O, branch_manager: B, front_desk: B, trainer: A, member: W },

  // Memberships, money and credits
  "membership.read": { owner: O, branch_manager: B, front_desk: B, finance: B, trainer: A, member: W },
  "membership.manage": { owner: O, branch_manager: B, front_desk: B },
  "plan.read": { owner: O, branch_manager: O, front_desk: O, finance: O, member: O },
  "pricing.manage": { owner: O },
  "invoice.read": { owner: O, branch_manager: B, front_desk: B, finance: B, member: W },
  "invoice.create": { owner: O, branch_manager: B, front_desk: B, finance: B },
  "dues.read": { owner: O, branch_manager: B, front_desk: B, finance: B },
  /** A member paying their own invoice, renewing, or buying sessions through the online gateway. */
  "payment.pay": { member: W },
  "membership.autorenew": { member: W },
  "payment.record": { owner: O, branch_manager: B, front_desk: B, finance: B },
  "refund.create": { owner: O, branch_manager: B, finance: B },
  /** Asking finance for a refund. The front desk can’t approve one. */
  "refund.request": { owner: O, branch_manager: B, front_desk: B, finance: B },
  "reconciliation.manage": { owner: O, finance: B },
  /** Counting the cash drawer and closing the day. Reopening a closed day is the owner’s alone. */
  "cash.close": { owner: O, branch_manager: B, front_desk: B, finance: B },
  "cash.reopen": { owner: O },
  "credits.read": { owner: O, branch_manager: B, front_desk: B, finance: B, trainer: A, member: W },
  "credits.adjust": { owner: O, branch_manager: B },

  // Entry and bookings
  "checkin.record": { owner: O, branch_manager: B, front_desk: B },
  "checkin.override": { owner: O, branch_manager: B, front_desk: B },
  "checkin.read": { owner: O, branch_manager: B, front_desk: B, member: W },
  "booking.read": { owner: O, branch_manager: B, front_desk: B, trainer: W, member: W },
  "booking.manage": { owner: O, branch_manager: B, front_desk: B, trainer: W, member: W },
  "schedule.manage": { owner: O, branch_manager: B, trainer: W },

  // Training. Front desk and finance never get assessments or progress photos (R03). Owners and branch managers don’t
  // either, unless an owner turns on “Can view client health and progress photos” for that person (see StaffLimits).
  "assessment.read": { trainer: A, member: W, owner: O, branch_manager: B },
  /** Seeing that an assessment exists and its date, without its contents. */
  "assessment.exists": { owner: O, branch_manager: B },
  /** Seeing goals and whether each is active, achieved, revised or closed, without notes or measurements. */
  "goal.status": { owner: O, branch_manager: B },
  "assessment.write": { trainer: A },
  "photo.read": { trainer: A, member: W, owner: O, branch_manager: B },
  "photo.write": { trainer: A, member: W },
  "goal.read": { trainer: A, member: W },
  "goal.write": { trainer: A },
  "measurement.read": { trainer: A, member: W },
  "measurement.write": { trainer: A, member: W },
  "workoutplan.read": { trainer: A, member: W },
  "workoutplan.write": { trainer: A },
  "workoutlog.read": { trainer: A, member: W },
  "workoutlog.write": { trainer: A, member: W },
  "progress.read": { trainer: A, member: W },
  "review.read": { trainer: A, member: W },
  "review.write": { trainer: A },
  "note.private": { trainer: A },
  "feedback.write": { member: W },
  "exercise.read": { owner: O, branch_manager: O, trainer: O, member: O },
  "exercise.write": { owner: O, trainer: O },
  "template.manage": { owner: O, trainer: W },

  // Running the gym
  "dashboard.view": { owner: O, branch_manager: B },
  "report.view": { owner: O, branch_manager: B, finance: B },
  "report.export": { owner: O, branch_manager: B, finance: B },
  "message.send": { owner: O, branch_manager: B, front_desk: B, finance: B },
  "communication.manage": { owner: O, branch_manager: B },
  /** The gym’s wording for the emails it writes. Gym-wide, so the owner’s alone. */
  "communication.template": { owner: O },
  "import.run": { owner: O },
  "staff.manage": { owner: O },
  /** Seeing who works at the gym. A branch manager sees the people at their own branches. */
  "staff.read": { owner: O, branch_manager: B },
  /** Inviting, editing and deactivating front desk and trainer accounts at one’s own branches. A branch manager only has it when the owner has granted it (`canManageFrontline`). */
  "staff.manage.frontline": { owner: O, branch_manager: B },
  "branch.manage": { owner: O, branch_manager: B },
  "policy.manage": { owner: O },
  /** Reading the gym’s policies. A branch manager can look, and can’t change them. */
  "policy.read": { owner: O, branch_manager: B },
  "settings.manage": { owner: O },
  "subscription.view": { owner: O },
  "audit.read": { owner: O, branch_manager: B },
  "data.export.request": { member: W },
  "data.export.fulfil": { owner: O },

  // Ember administration. Platform administrators get no access to a gym's own records.
  "tenant.read": { platform_admin: P },
  "tenant.manage": { platform_admin: P },
  "saasplan.manage": { platform_admin: P },
  "support.request": { platform_admin: P },
  "platform.audit.read": { platform_admin: P },
} satisfies Record<string, Grants>;

export type Action = keyof typeof GRANTS;
export const ACTIONS = Object.keys(GRANTS) as Action[];

/** The scope a role has for an action, or undefined when the role has no access. */
export function scopeFor(role: Role, action: Action): Scope | undefined {
  const grants: Grants = GRANTS[action];
  return grants[role];
}

/** Limits set per staff member (R02). Missing limits mean the permission is not given. */
export interface StaffLimits {
  refundLimitPaise: number | null;
  canOverrideCheckIn: boolean;
  /** “Can manage front desk and trainer accounts at their branches”: for a branch manager, given by the owner. Off by default. */
  canManageFrontline?: boolean;
  /** How many check-in overrides this person may make in a day. Missing or null means no limit. Only matters when `canOverrideCheckIn` is on. */
  maxOverridesPerDay?: number | null;
  maxDiscountBp: number;
  /**
   * “Can view client health and progress photos”. Off by default. Only an owner can turn it on, and only for an owner or
   * a branch manager. It never applies to front desk or finance. Every view is written to the audit log.
   */
  canViewClientHealth: boolean;
}

/** Staff roles that can be given access to client health data. Front desk and finance never can. */
export const HEALTH_GRANTABLE_ROLES: readonly Role[] = ["owner", "branch_manager"];

/** Actions that open a client’s health information. Trainers get them by assignment and members for themselves. */
export const HEALTH_ACTIONS: readonly Action[] = ["assessment.read", "photo.read"];

/** The signed-in person as the permission checks see them. */
export interface Principal {
  userId: string;
  role: Role;
  /** Null only for platform administrators. */
  tenantId: string | null;
  branchIds: string[];
  /** Set for members: their own member record. */
  memberId?: string;
  limits?: StaffLimits;
  /**
   * What the gym’s subscription allows (S02): “full”, “readonly” (looking and downloading only) or “export_only” (downloading only). Read from the gym’s record on every call, never
   * from the session. Absent means full (platform administrators, who have no gym).
   */
  access?: Access;
  /** A sentence for when this access refuses something, in words for the person. */
  accessNote?: string;
  /** Set when an Ember administrator is inside this gym under a support session (R01). They get the owner’s read-only view and nothing else, and every call is audited. */
  support?: { sessionId: string; adminId: string; expiresAt: string };
}

export type Access = "full" | "readonly" | "export_only";

/** Actions that only look. A gym that is read-only (suspended) still allows these, and downloading a report. */
const LOOKING = /\.(read|list|view|exists|status)$/;
const DOWNLOADS: readonly string[] = ["report.export"];
/** What a canceled gym can still do: download, and see its subscription to reactivate it. */
const EXPORT_ONLY_ALLOWED: readonly string[] = [...DOWNLOADS, "subscription.view"];
/** What an Ember administrator may do inside a gym under a support session: the owner’s views, and nothing that changes, downloads or opens health data. */
export const SUPPORT_ALLOWED: readonly string[] = [
  "dashboard.view", "report.view", "member.read", "member.list", "membership.read", "invoice.read", "dues.read", "plan.read", "staff.read", "policy.read", "audit.read", "checkin.read", "booking.read", "credits.read", "subscription.view",
];

/** Whether the gym’s subscription state lets this action through. */
export function accessAllows(access: Access | undefined, action: string): boolean {
  if (!access || access === "full") return true;
  if (access === "export_only") return EXPORT_ONLY_ALLOWED.includes(action);
  return LOOKING.test(action) || DOWNLOADS.includes(action);
}

/** The record being accessed. The caller fills in what it knows. Anything missing fails a scope that needs it. */
export interface Resource {
  tenantId?: string;
  branchId?: string;
  /** The member the record is about. */
  memberId?: string;
  /** The trainer currently assigned to that member (from their open TrainerAssignment). */
  assignedTrainerId?: string;
  /** The user who owns the record, such as the trainer on a booking or the owner of a template. */
  ownerUserId?: string;
  /** Whether the member has an active photo consent. Staff cannot open photos without it (S04). */
  photoConsent?: boolean;
}

function withinScope(p: Principal, scope: Scope, r: Resource): boolean {
  switch (scope) {
    case "platform":
      return false; // Platform actions have no gym record. They are only allowed without a resource.
    case "organisation":
      return true;
    case "branch":
      return r.branchId !== undefined && p.branchIds.includes(r.branchId);
    case "assigned":
      return r.assignedTrainerId !== undefined && r.assignedTrainerId === p.userId;
    case "own":
      return (p.memberId !== undefined && r.memberId === p.memberId) || (r.ownerUserId !== undefined && r.ownerUserId === p.userId);
  }
}

function limitsAllow(p: Principal, action: Action): boolean {
  if (action === "checkin.override") return p.limits?.canOverrideCheckIn === true;
  if (action === "staff.manage.frontline" && p.role === "branch_manager") return p.limits?.canManageFrontline === true;
  // Owners and branch managers need the switch. It is ignored for every other role.
  if (HEALTH_ACTIONS.includes(action) && HEALTH_GRANTABLE_ROLES.includes(p.role)) return p.limits?.canViewClientHealth === true;
  return true;
}

/**
 * Can this person do this? Without a resource it answers "may this role use this feature at all",
 * which is what navigation items and routes need. With a resource it checks tenant, branch,
 * assignment and ownership for that one record.
 */
export function can(p: Principal | null | undefined, action: Action, resource?: Resource): boolean {
  if (!p) return false;
  const scope = scopeFor(p.role, action);
  if (!scope) return false;
  if (!limitsAllow(p, action)) return false;
  if (p.support && !SUPPORT_ALLOWED.includes(action)) return false;
  if (!accessAllows(p.access, action)) return false;

  if (scope === "platform") return p.tenantId === null && resource === undefined;

  // Everything else belongs to one gym.
  if (p.tenantId === null) return false;
  if (!resource) return true;
  if (resource.tenantId === undefined || resource.tenantId !== p.tenantId) return false;
  if (!withinScope(p, scope, resource)) return false;

  // Staff need the member's photo consent to open progress photos (S04, A05).
  if (action === "photo.read" && p.role !== "member" && resource.photoConsent !== true) return false;
  return true;
}

/** Can this person approve a refund of this size? Combines the role check with their personal limit. */
export function canRefund(p: Principal | null | undefined, resource: Resource, amountPaise: number): boolean {
  if (!can(p, "refund.create", resource) || !p) return false;
  const limit = p.limits?.refundLimitPaise;
  if (limit === undefined) return false;
  return limit === null || amountPaise <= limit;
}
