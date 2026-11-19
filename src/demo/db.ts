import Dexie, { type EntityTable } from "dexie";
import type {
  Assessment, AuditEvent, BadgeAward, Booking, EmailLogEntry, Branch, CheckIn, Consent, CreditLedgerEntry, Exercise, Goal, GymClass, Invoice, Measurement, Member, Membership,
  MembershipPlan, MemberSettings, NumberSeries, ProgramTemplate, GatewayEvent, DataRequest, Payment, Refund, SaasPlan, StaffRole, Tenant, TrainerAssignment, TrainerAvailability, TrainerLeave, TrainerReview, TrainerShift, User, WorkoutLog, WorkoutPlanVersion, GymPolicies,
} from "@/domain/types";

export interface MetaRow {
  key: string;
  value: unknown;
}
export interface IdempotencyRow {
  key: string;
  result: unknown;
  at: string;
}

/**
 * The demo database. It lives in the browser (IndexedDB) and holds one table per S07 record. Only `src/api/` and
 * `src/demo/` may import this file. Screens never do.
 */
export class EmberDB extends Dexie {
  tenants!: EntityTable<Tenant, "id">;
  saasPlans!: EntityTable<SaasPlan, "id">;
  branches!: EntityTable<Branch, "id">;
  users!: EntityTable<User, "id">;
  staffRoles!: EntityTable<StaffRole, "id">;
  members!: EntityTable<Member, "id">;
  trainerAssignments!: EntityTable<TrainerAssignment, "id">;
  membershipPlans!: EntityTable<MembershipPlan, "id">;
  memberships!: EntityTable<Membership, "id">;
  invoices!: EntityTable<Invoice, "id">;
  payments!: EntityTable<Payment, "id">;
  refunds!: EntityTable<Refund, "id">;
  creditLedger!: EntityTable<CreditLedgerEntry, "id">;
  classes!: EntityTable<GymClass, "id">;
  bookings!: EntityTable<Booking, "id">;
  checkIns!: EntityTable<CheckIn, "id">;
  exercises!: EntityTable<Exercise, "id">;
  workoutPlanVersions!: EntityTable<WorkoutPlanVersion, "id">;
  workoutLogs!: EntityTable<WorkoutLog, "id">;
  goals!: EntityTable<Goal, "id">;
  measurements!: EntityTable<Measurement, "id">;
  consents!: EntityTable<Consent, "id">;
  auditEvents!: EntityTable<AuditEvent, "id">;
  trainerReviews!: EntityTable<TrainerReview, "id">;
  memberSettings!: EntityTable<MemberSettings, "id">;
  badgeAwards!: EntityTable<BadgeAward, "id">;
  trainerAvailability!: EntityTable<TrainerAvailability, "id">;
  trainerShifts!: EntityTable<TrainerShift, "id">;
  numberSeries!: EntityTable<NumberSeries, "id">;
  trainerLeave!: EntityTable<TrainerLeave, "id">;
  gymPolicies!: EntityTable<GymPolicies, "id">;
  assessments!: EntityTable<Assessment, "id">;
  programTemplates!: EntityTable<ProgramTemplate, "id">;
  emailLog!: EntityTable<EmailLogEntry, "id">;
  gatewayEvents!: EntityTable<GatewayEvent, "id">;
  dataRequests!: EntityTable<DataRequest, "id">;
  meta!: EntityTable<MetaRow, "key">;
  idempotency!: EntityTable<IdempotencyRow, "key">;

  constructor(name = "ember-demo") {
    super(name);
    // A leading & makes an index unique. Records without that field are not indexed.
    this.version(1).stores({
      tenants: "id",
      saasPlans: "id",
      branches: "id, tenantId",
      users: "id, tenantId, email, phone, role",
      staffRoles: "id, tenantId, userId",
      members: "id, tenantId, homeBranchId, phone",
      trainerAssignments: "id, tenantId, memberId, trainerId",
      membershipPlans: "id, tenantId",
      memberships: "id, tenantId, memberId, status",
      invoices: "id, tenantId, memberId, branchId, status, dueOn",
      payments: "id, tenantId, invoiceId, memberId, gatewayEventId, &idempotencyKey",
      refunds: "id, tenantId, paymentId, &idempotencyKey",
      creditLedger: "id, tenantId, memberId, &idempotencyKey",
      classes: "id, tenantId, branchId, startsAt",
      bookings: "id, tenantId, memberId, trainerId, startsAt, slotKey, &idempotencyKey",
      checkIns: "id, tenantId, memberId, branchId, at",
      exercises: "id, tenantId, category",
      workoutPlanVersions: "id, tenantId, memberId, programId",
      workoutLogs: "id, tenantId, memberId, planVersionId, &idempotencyKey",
      goals: "id, tenantId, memberId",
      measurements: "id, tenantId, memberId, kind",
      consents: "id, tenantId, memberId, scope",
      auditEvents: "id, tenantId, at, action, entityId",
      meta: "key",
      idempotency: "key",
    });
    // Version 2 (M1): records for the member app. Existing tables are unchanged.
    this.version(2).stores({
      trainerReviews: "id, tenantId, memberId, kind, createdAt",
      memberSettings: "id, tenantId, &memberId",
      badgeAwards: "id, tenantId, memberId, badge",
      trainerAvailability: "id, tenantId, trainerId, weekday",
      gymPolicies: "id, tenantId",
    });
    // Version 3 (M1, Bookings): the email delivery log (O04), and a unique slot key, so the database itself refuses a second
    // active booking of the same trainer and time (A03). A canceled booking drops its slot key, which frees the slot.
    this.version(3).stores({
      bookings: "id, tenantId, memberId, trainerId, startsAt, &slotKey, &idempotencyKey",
      emailLog: "id, tenantId, memberId, template, sentAt",
    });
    // Version 4 (M1, Membership and Me): gateway events (M04, one row per event id) and data requests (S04).
    this.version(4).stores({
      memberships: "id, tenantId, memberId, status, invoiceId",
      gatewayEvents: "id, tenantId, memberId, invoiceId",
      dataRequests: "id, tenantId, memberId, kind, status",
    });
    // Version 5 (M2, trainer app): assessments (T02) and program templates (W02).
    this.version(5).stores({
      assessments: "id, tenantId, memberId, recordedOn",
      programTemplates: "id, tenantId, ownerId",
    });
    // Version 6 (M2, Schedule): a trainer’s one-off shifts and leave (O01).
    this.version(6).stores({
      trainerShifts: "id, tenantId, trainerId, date",
      trainerLeave: "id, tenantId, trainerId, from",
    });
    // Version 7 (M3): the counters behind GST invoice and credit-note numbers.
    this.version(7).stores({
      numberSeries: "id, tenantId",
    });
  }
}

export const db = new EmberDB();
