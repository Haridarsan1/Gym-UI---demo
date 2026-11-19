import { describe, expect, it } from "vitest";
import { generateFullSeed } from "@/demo/fullSeed";
import { creditBalance } from "@/domain/credits";
import { istDateOf } from "@/domain/dates";
import { profileFor } from "@/demo/seedTrainer";
import { Booking, CreditLedgerEntry, TrainerReview, WorkoutLog, WorkoutPlanVersion } from "@/domain/types";

const NOW = new Date("2026-11-17T06:30:00.000Z");
const seed = generateFullSeed(NOW);
const TODAY = "2026-11-17";

describe("trainer rosters in the seed", () => {
  it("only adds records that pass their schemas", () => {
    for (const [schema, rows] of [[WorkoutPlanVersion, seed.workoutPlanVersions], [WorkoutLog, seed.workoutLogs], [TrainerReview, seed.trainerReviews], [Booking, seed.bookings], [CreditLedgerEntry, seed.creditLedger]] as const)
      for (const row of rows) expect((schema as { safeParse: (v: unknown) => { success: boolean } }).safeParse(row).success, JSON.stringify(row).slice(0, 120)).toBe(true);
  });

  it("gives every client with a plan a trainer, an active membership and logs entered by that trainer", () => {
    const rosterLogs = seed.workoutLogs.filter((l) => l.memberId.startsWith("mem_0") || /^mem_\d{3}$/.test(l.memberId));
    expect(rosterLogs.length).toBeGreaterThan(100);
    for (const l of rosterLogs) {
      const a = seed.trainerAssignments.find((t) => t.memberId === l.memberId && !t.effectiveTo)!;
      expect(a, l.memberId).toBeDefined();
      expect(l.enteredBy).toBe(a.trainerId);
      expect(l.enteredByRole).toBe("trainer");
    }
  });

  it("keeps awaiting clients without a plan, and everyone else with one", () => {
    const planned = new Set(seed.workoutPlanVersions.map((v) => v.memberId));
    for (const a of seed.trainerAssignments.filter((t) => !t.effectiveTo && /^mem_\d{3}$/.test(t.memberId))) {
      const active = seed.memberships.some((m) => m.memberId === a.memberId && m.status === "active");
      if (active && profileFor(a.memberId) === "awaiting") expect(planned.has(a.memberId), a.memberId).toBe(false);
      if (active && profileFor(a.memberId) !== "awaiting") expect(planned.has(a.memberId), a.memberId).toBe(true);
    }
  });

  it("books Meera four sessions today, none clashing, each holding exactly one credit", () => {
    const today = seed.bookings.filter((b) => b.trainerId === "u_trainer_meera" && istDateOf(b.startsAt) === TODAY);
    expect(today).toHaveLength(4);
    expect(new Set(today.map((b) => b.slotKey)).size).toBe(4);
    for (const b of today) {
      const entries = seed.creditLedger.filter((c) => c.memberId === b.memberId);
      expect(creditBalance(entries).reserved + creditBalance(entries).consumed, b.id).toBeGreaterThanOrEqual(1);
      expect(entries.some((c) => c.id === b.creditEntryId && c.kind === "reservation")).toBe(true);
    }
    expect(today.filter((b) => b.status === "attended")).toHaveLength(1);
  });

  it("never lets two bookings share a slot key", () => {
    const keys = seed.bookings.map((b) => b.slotKey).filter(Boolean);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("has a pack of credits expiring within two weeks for some clients", () => {
    const soon = seed.creditLedger.filter((c) => c.kind === "purchase" && c.expiresOn && c.expiresOn >= TODAY && c.expiresOn <= "2026-12-01" && c.id.startsWith("cr_roster_pack_"));
    expect(soon.length).toBeGreaterThan(2);
  });
});
