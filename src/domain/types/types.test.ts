import { describe, expect, it } from "vitest";
import {
  Booking,
  Goal,
  InvoiceStatus,
  Measurement,
  Member,
  MembershipStatus,
  Payment,
  Prescription,
  Refund,
  S07_RECORDS,
  StaffRole,
  WorkoutLog,
} from "@/domain/types";

const NOW = "2026-11-17T06:30:00.000Z";

describe("S07 records", () => {
  it("covers every record listed in requirement S07", () => {
    // Order and names follow the S07 sentence in docs/REQUIREMENTS.md.
    expect(Object.keys(S07_RECORDS)).toEqual([
      "tenant", "branch", "user", "staffRole", "member", "trainerAssignment", "membershipPlan", "membership",
      "invoice", "payment", "refund", "creditLedgerEntry", "class", "booking", "checkIn", "exercise",
      "workoutPlanVersion", "workoutLog", "goal", "measurement", "consent", "auditEvent",
    ]);
  });

  it("keeps invoice status separate from membership status (M02)", () => {
    const shared = InvoiceStatus.options.filter((s) => (MembershipStatus.options as readonly string[]).includes(s));
    expect(shared).toEqual([]);
    expect(MembershipStatus.options).toEqual(["pending", "scheduled", "active", "frozen", "expired", "canceled"]);
  });
});

describe("StaffRole health access", () => {
  const row = (role: string, canViewClientHealth?: boolean) => ({
    id: "sr1", tenantId: "t1", userId: "u1", role, branchIds: ["b1"],
    limits: { refundLimitPaise: 0, canOverrideCheckIn: false, maxDiscountBp: 0, ...(canViewClientHealth === undefined ? {} : { canViewClientHealth }) },
  });
  it("is off unless someone turns it on", () => {
    expect(StaffRole.parse(row("owner")).limits.canViewClientHealth).toBe(false);
  });
  it("can be on for owners and branch managers only", () => {
    expect(StaffRole.safeParse(row("owner", true)).success).toBe(true);
    expect(StaffRole.safeParse(row("branch_manager", true)).success).toBe(true);
    for (const role of ["front_desk", "finance", "trainer"]) {
      const res = StaffRole.safeParse(row(role, true));
      expect(res.success, role).toBe(false);
      expect(res.error?.issues[0]?.message).toBe("Only an owner or a branch manager can be given access to client health data.");
    }
  });
});

describe("validation rules", () => {
  const member = { id: "m1", tenantId: "t1", name: "Priya Sharma", phone: "9876543210", homeBranchId: "b1", joinedOn: "2026-01-05", qrToken: "qr-token-1" };

  it("accepts a valid member and rejects a bad mobile number", () => {
    expect(Member.safeParse(member).success).toBe(true);
    const bad = Member.safeParse({ ...member, phone: "12345" });
    expect(bad.success).toBe(false);
    expect(bad.error?.issues[0]?.message).toBe("Enter a 10-digit mobile number.");
  });

  it("requires an idempotency key on payments so a retried event cannot double-record", () => {
    const payment = {
      id: "p1", tenantId: "t1", invoiceId: "i1", memberId: "m1", branchId: "b1", method: "upi", amountPaise: 295000,
      status: "succeeded", receivedAt: NOW, reconciliation: { status: "unmatched" },
    };
    expect(Payment.safeParse(payment).success).toBe(false);
    expect(Payment.safeParse({ ...payment, idempotencyKey: "gw-evt-0001" }).success).toBe(true);
  });

  it("stores money as whole paise", () => {
    const refund = { id: "r1", tenantId: "t1", paymentId: "p1", invoiceId: "i1", amountPaise: 100, reason: "Duplicate charge", status: "completed", requestedBy: "u1", creditsReversed: 0, createdAt: NOW, idempotencyKey: "refund-0001" };
    expect(Refund.safeParse(refund).success).toBe(true);
    expect(Refund.safeParse({ ...refund, amountPaise: 99.5 }).success).toBe(false);
    expect(Refund.safeParse({ ...refund, amountPaise: 0 }).success).toBe(false);
    expect(Refund.safeParse({ ...refund, reason: "" }).success).toBe(false);
  });

  it("accepts rep ranges only when the maximum is not below the minimum", () => {
    const base = { exerciseId: "e1", order: 0, section: "main", sets: 3 };
    expect(Prescription.safeParse({ ...base, reps: 10 }).success).toBe(true);
    expect(Prescription.safeParse({ ...base, reps: { min: 8, max: 12 } }).success).toBe(true);
    expect(Prescription.safeParse({ ...base, reps: { min: 12, max: 8 } }).success).toBe(false);
  });

  it("records 10, 10 and 8 reps against three sets of ten, with who entered them (W03, T05)", () => {
    const log = {
      id: "l1", tenantId: "t1", memberId: "m1", planVersionId: "v1", weekIndex: 0, dayIndex: 0, scheduledOn: "2026-11-17",
      status: "partial", entries: [{ exerciseId: "e1", sets: [
        { setNumber: 1, reps: 10, skipped: false }, { setNumber: 2, reps: 10, skipped: false }, { setNumber: 3, reps: 8, skipped: false },
      ] }],
      enteredBy: "u9", enteredByRole: "member", corrections: [], idempotencyKey: "log-0001-abc",
    };
    const parsed = WorkoutLog.parse(log);
    expect(parsed.entries[0]?.sets.map((s) => s.reps)).toEqual([10, 10, 8]);
    expect(parsed.enteredByRole).toBe("member");
    expect(WorkoutLog.safeParse({ ...log, enteredBy: undefined }).success).toBe(false);
  });

  it("keeps goal status to the four states in P04", () => {
    const goal = { id: "g1", tenantId: "t1", memberId: "m1", title: "Bench 80 kg", metric: "bench_press", unit: "kg", target: 80, targetDate: "2027-02-01", reviewEveryDays: 28, status: "active", history: [], createdBy: "u1", createdAt: NOW };
    expect(Goal.safeParse(goal).success).toBe(true);
    expect(Goal.safeParse({ ...goal, status: "paused" }).success).toBe(false);
  });

  it("lets a measurement correction point at the entry it replaces (P01)", () => {
    const m = { id: "ms2", tenantId: "t1", memberId: "m1", kind: "weight", value: 71.2, unit: "kg", measuredOn: "2026-11-10", source: "trainer", recordedBy: "u2", corrects: "ms1", createdAt: NOW };
    expect(Measurement.parse(m).corrects).toBe("ms1");
  });

  it("gives a booking a slot key for conflict checks (A03)", () => {
    const b = { id: "b1", tenantId: "t1", memberId: "m1", branchId: "br1", kind: "pt_session", trainerId: "u2", startsAt: NOW, endsAt: "2026-11-17T07:30:00.000Z", status: "booked", slotKey: "u2|2026-11-17T06:30", createdBy: "u1", createdAt: NOW, idempotencyKey: "book-0001-x" };
    expect(Booking.parse(b).slotKey).toBe("u2|2026-11-17T06:30");
  });
});
