import { z } from "zod";
import { ROLES } from "@/domain/roles";
import { basisPoints, email, id, isoDate, isoDateTime, mobile } from "./common";

export const SubscriptionState = z.enum(["trial", "paid", "past_due", "suspended", "canceled"]);

/** Platform plan the gym pays Ember for (S02). Not the plans a gym sells to members. */
export const SaasPlan = z.object({
  id,
  name: z.string(),
  monthlyPaise: z.number().int().nonnegative().nullable(),
  limits: z.object({ branches: z.number().int().nullable(), staff: z.number().int().nullable(), activeMembers: z.number().int().nullable() }),
  features: z.array(z.string()),
});
export type SaasPlan = z.infer<typeof SaasPlan>;

/** A gym organisation. Every other tenant record carries its id (S03). */
export const Tenant = z.object({
  id,
  name: z.string().min(1),
  slug: z.string().min(1),
  gstin: z.string().optional(),
  /** Registered name and address, printed on tax receipts. */
  legalName: z.string().optional(),
  /** The gym’s logo, shown in the header and on loading screens. Without one the gym’s initials are shown. */
  logoUrl: z.string().optional(),
  address: z.string().optional(),
  /** The gym’s own wording for emails it sends, by template (O04). Absent: Ember’s wording. */
  emailTemplates: z.record(z.string(), z.object({ subject: z.string(), body: z.string() })).optional(),
  /** Personal training sold in packs (M01, M06). Absent: Ember’s defaults (see `domain/renewal.ts`). */
  ptPricing: z.object({ sessionPricePaise: z.number().int().positive(), taxRateBp: z.number().int().min(0).max(10000), packs: z.array(z.number().int().positive()).min(1).max(6), expiryDays: z.number().int().min(30).max(730) }).optional(),
  currency: z.literal("INR"),
  timeZone: z.string(),
  subscription: z.object({
    state: SubscriptionState,
    saasPlanId: id,
    trialEndsAt: isoDateTime.optional(),
    renewsOn: isoDate.optional(),
  }),
  createdAt: isoDateTime,
});
export type Tenant = z.infer<typeof Tenant>;

const dayHours = z.object({ weekday: z.number().int().min(0).max(6), open: z.string(), close: z.string() });

export const Branch = z.object({
  id,
  tenantId: id,
  name: z.string().min(1),
  city: z.string(),
  address: z.string().optional(),
  /** GST state code of the branch (for example "27" for Maharashtra). Services performed here are taxed in this state. */
  stateCode: z.string().regex(/^\d{2}$/),
  /** The start of this branch’s GST document numbers, 3 to 5 capital letters or digits, for example PFAND (see domain/numbering.ts). */
  invoicePrefix: z.string().regex(/^[A-Z0-9]{3,5}$/),
  /** Days with no entry are closed. Times are local "HH:mm". */
  hours: z.array(dayHours),
  rooms: z.array(z.object({ id, name: z.string(), capacity: z.number().int().positive() })),
  active: z.boolean(),
});
export type Branch = z.infer<typeof Branch>;

export const RoleEnum = z.enum(ROLES);
export const UserStatus = z.enum(["invited", "active", "disabled"]);

/** Anyone who can log in. `tenantId` is null only for platform administrators. */
export const User = z.object({
  id,
  tenantId: id.nullable(),
  name: z.string().min(1),
  email: email.optional(),
  phone: mobile.optional(),
  role: RoleEnum,
  status: UserStatus,
  mfaEnabled: z.boolean(),
  /** Set for members: the member record this login belongs to. */
  memberId: id.optional(),
  createdAt: isoDateTime,
});
export type User = z.infer<typeof User>;

/** Staff roles a gym can assign. Members and platform admins are not staff roles. */
export const StaffRoleName = z.enum(["owner", "branch_manager", "front_desk", "finance", "trainer"]);

/** What a staff user may do, and where (R02, S03). Branch managers and desk staff only act in `branchIds`. */
export const StaffRole = z
  .object({
    id,
    tenantId: id,
    userId: id,
    role: StaffRoleName,
    branchIds: z.array(id),
    limits: z.object({
      /** Largest refund this person can approve alone. Null means no limit. */
      refundLimitPaise: z.number().int().nonnegative().nullable(),
      canOverrideCheckIn: z.boolean(),
      /** For a branch manager: may invite, edit and deactivate front desk and trainer accounts at their branches. Given by the owner. */
      canManageFrontline: z.boolean().optional(),
      /** Check-in overrides allowed per day. Null means no limit. */
      maxOverridesPerDay: z.number().int().min(0).nullable().optional(),
      maxDiscountBp: basisPoints,
      /** “Can view client health and progress photos”. Off by default. See permissions.ts. */
      canViewClientHealth: z.boolean().default(false),
    }),
  })
  .refine((r) => !r.limits.canViewClientHealth || r.role === "owner" || r.role === "branch_manager", {
    message: "Only an owner or a branch manager can be given access to client health data.",
    path: ["limits", "canViewClientHealth"],
  });
export type StaffRole = z.infer<typeof StaffRole>;

export const Member = z.object({
  id,
  tenantId: id,
  userId: id.optional(),
  name: z.string().min(1),
  phone: mobile,
  email: email.optional(),
  dateOfBirth: isoDate.optional(),
  gender: z.enum(["female", "male", "other", "undisclosed"]).optional(),
  homeBranchId: id,
  joinedOn: isoDate,
  /** Value encoded in the member's QR pass (M05). */
  qrToken: z.string().min(8),
  emergencyContact: z.object({ name: z.string(), phone: mobile }).optional(),
  leadSource: z.string().optional(),
  /** Other members on the same phone number or email, for example a parent and child. Set when the desk says “Different person sharing this number”. */
  sharesContactWith: z.array(id).optional(),
  archivedAt: isoDateTime.optional(),
});
export type Member = z.infer<typeof Member>;

/**
 * Who trains a member, from when to when (T01). Reassigning closes the old row (`effectiveTo`) and opens a new one.
 * Records the old trainer wrote keep their original author (A02).
 */
export const TrainerAssignment = z.object({
  id,
  tenantId: id,
  memberId: id,
  trainerId: id,
  effectiveFrom: isoDate,
  effectiveTo: isoDate.optional(),
  assignedBy: id,
  reason: z.string().optional(),
});
export type TrainerAssignment = z.infer<typeof TrainerAssignment>;

export const ConsentScope = z.enum(["photos", "assessments", "marketing", "data_processing"]);

/** Consent and its scope (S04). A withdrawn consent keeps its row; `withdrawnAt` is set. */
export const Consent = z.object({
  id,
  tenantId: id,
  memberId: id,
  scope: ConsentScope,
  grantedAt: isoDateTime,
  withdrawnAt: isoDateTime.optional(),
  noticeVersion: z.string(),
  recordedBy: id,
});
export type Consent = z.infer<typeof Consent>;

export const AuditAction = z.enum([
  "membership.create",
  "membership.freeze",
  "membership.unfreeze",
  "membership.renew",
  "membership.upgrade",
  "membership.cancel",
  "membership.autorenew",
  "consent.change",
  "data.request",
  "refund.create",
  "credits.adjust",
  "permission.change",
  "checkin.override",
  "support.access.start",
  "support.access.end",
  "assessment.view",
  "photo.view",
  "record.edit",
  "workout.correct",
  "booking.attendance",
  "booking.move",
  "schedule.change",
  "review.shared",
  "goal.confirm",
  "membership.cancel.undo",
  "membership.grace",
  "refund.request",
  "refund.approve",
  "refund.reject",
  "creditnote.issue",
  "payment.record",
  "dayclose.close",
  "dayclose.reopen",
  "policy.change",
  "plan.change",
  "staff.change",
  "branch.change",
  "settings.change",
  "communication.retry",
  "communication.send",
  "communication.template",
  "export.create",
  "import.run",
]);

/** Who did what, when, why, and to which record (S05). Append-only. */
export const AuditEvent = z.object({
  id,
  tenantId: id.nullable(),
  actorId: id,
  actorRole: RoleEnum,
  at: isoDateTime,
  action: AuditAction,
  /** Required for refunds, overrides, credit adjustments and support access. */
  reason: z.string().optional(),
  entityType: z.string(),
  entityId: id,
  memberId: id.optional(),
  details: z.record(z.string(), z.unknown()).optional(),
});
export type AuditEvent = z.infer<typeof AuditEvent>;
