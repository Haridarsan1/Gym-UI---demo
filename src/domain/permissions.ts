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
  "reconciliation.manage": { owner: O, finance: B },
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
  "import.run": { owner: O },
  "staff.manage": { owner: O },
  "branch.manage": { owner: O, branch_manager: B },
  "policy.manage": { owner: O },
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
