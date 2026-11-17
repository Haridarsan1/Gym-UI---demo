import { AuditEvent, Branch, Consent, Member, SaasPlan, StaffRole, Tenant, TrainerAssignment, User } from "./core";
import { CreditLedgerEntry, Invoice, Membership, MembershipPlan, Payment, Refund } from "./billing";
import { Booking, CheckIn, GymClass } from "./ops";
import { BadgeAward, EmailLogEntry, GymPolicies, MemberSettings, TrainerAvailability, TrainerReview } from "./supporting";
import { Exercise, Goal, Measurement, WorkoutLog, WorkoutPlanVersion } from "./training";

export * from "./common";
export * from "./core";
export * from "./billing";
export * from "./ops";
export * from "./training";
export * from "./supporting";

/** The core records listed in requirement S07, by name. A test checks this list against the requirement. */
export const S07_RECORDS = {
  tenant: Tenant,
  branch: Branch,
  user: User,
  staffRole: StaffRole,
  member: Member,
  trainerAssignment: TrainerAssignment,
  membershipPlan: MembershipPlan,
  membership: Membership,
  invoice: Invoice,
  payment: Payment,
  refund: Refund,
  creditLedgerEntry: CreditLedgerEntry,
  class: GymClass,
  booking: Booking,
  checkIn: CheckIn,
  exercise: Exercise,
  workoutPlanVersion: WorkoutPlanVersion,
  workoutLog: WorkoutLog,
  goal: Goal,
  measurement: Measurement,
  consent: Consent,
  auditEvent: AuditEvent,
} as const;

/** Supporting records that are not in S07 but the app needs. */
export const SUPPORTING_RECORDS = {
  saasPlan: SaasPlan,
  trainerReview: TrainerReview,
  memberSettings: MemberSettings,
  badgeAward: BadgeAward,
  trainerAvailability: TrainerAvailability,
  gymPolicies: GymPolicies,
  emailLogEntry: EmailLogEntry,
} as const;
