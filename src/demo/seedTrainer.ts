import { TENANT_ID } from "@/app/demoAccounts";
import { addDays, istDateTime } from "@/domain/dates";
import { slotKeyFor, weekdayOf } from "@/domain/slots";
import type { Booking, CreditLedgerEntry, Member, Membership, TrainerAssignment, TrainerAvailability } from "@/domain/types";
import { hash, profileFor, rosterClients } from "@/demo/seedPlans";

export { profileFor };

/**
 * The trainers’ rosters, the part the whole gym sees (M2): who is a client of whom, the training credits some of them hold, and each trainer’s sessions today with the credit held.
 * The plans, logs, reviews and goals that make a client believable to their trainer are `seedTraining.ts`, which only the member and trainer apps load. Everything is relative to today.
 *
 *   strong 25%, steady 25%, slipping 30%, awaiting 20% (a trainer, but no plan yet): see `profileFor`.
 */
export interface RosterInput {
  today: string;
  members: Member[];
  memberships: Membership[];
  trainerAssignments: TrainerAssignment[];
  availability: TrainerAvailability[];
  deskFor: (branchId: string) => string;
}

export interface RosterSeed { bookings: Booking[]; creditLedger: CreditLedgerEntry[] }

export function buildRoster(input: RosterInput): RosterSeed {
  const { today, availability, deskFor } = input;
  const at = (date: string, time: string) => istDateTime(date, time);
  const out: RosterSeed = { bookings: [], creditLedger: [] };
  const onPlan: Array<{ member: Member; trainerId: string }> = [];

  for (const { assignment: a, member } of rosterClients(input)) {
    onPlan.push({ member, trainerId: a.trainerId });

    // About one client in six holds a pack of training credits that runs out within two weeks.
    if (hash(`${member.id}pack`) % 6 === 0) {
      const id = `cr_roster_pack_${member.id}`;
      out.creditLedger.push({
        id, tenantId: TENANT_ID, memberId: member.id, kind: "purchase", credits: 3 + (hash(member.id) % 4), expiresOn: addDays(today, 3 + (hash(member.id) % 10)), createdBy: deskFor(member.homeBranchId),
        createdAt: at(addDays(today, -40), "10:00"), idempotencyKey: `seed-${id}`,
      });
    }
  }

  // Sessions today: Meera has four, every other trainer two. The first has been done; the rest are still to come.
  const weekday = weekdayOf(today);
  const trainerIds = [...new Set(onPlan.map((o) => o.trainerId))].sort();
  trainerIds.forEach((trainerId, ti) => {
    const branchId = availability.find((x) => x.trainerId === trainerId && x.weekday === weekday)?.branchId;
    if (!branchId) return;
    const mine = onPlan.filter((o) => o.trainerId === trainerId);
    const times = trainerId === "u_trainer_meera" ? ["07:00", "17:00", "18:00", "19:00"] : ["08:00", "18:00"];
    times.forEach((time, k) => {
      const client = mine[(k + ti) % mine.length];
      if (!client || out.bookings.some((b) => b.memberId === client.member.id && b.startsAt.startsWith(today.slice(0, 7)) && b.id.startsWith("bk_roster") && b.status !== "canceled" && b.startsAt.slice(0, 10) === today && b.trainerId === trainerId)) return;
      const attended = k === 0;
      const id = `${client.member.id}_${today}_${time.slice(0, 2)}`;
      const purchase = `cr_roster_${id}`;
      const reservation = `cr_roster_res_${id}`;
      const entry = (eid: string, kind: CreditLedgerEntry["kind"], credits: number, extra: Partial<CreditLedgerEntry> = {}): CreditLedgerEntry => ({
        id: eid, tenantId: TENANT_ID, memberId: client.member.id, kind, credits, createdBy: kind === "purchase" ? deskFor(branchId) : trainerId, createdAt: at(addDays(today, -3), "09:00"), idempotencyKey: `seed-${eid}`, ...extra,
      });
      out.bookings.push({
        id: `bk_roster_${id}`, tenantId: TENANT_ID, memberId: client.member.id, branchId, kind: "pt_session", trainerId, startsAt: at(today, time), endsAt: at(today, `${String(Number(time.slice(0, 2)) + 1).padStart(2, "0")}:00`),
        status: attended ? "attended" : "booked", creditEntryId: reservation, slotKey: slotKeyFor(trainerId, today, time), createdBy: client.member.id, createdAt: at(addDays(today, -3), "09:00"), idempotencyKey: `seed-booking-${id}`,
      });
      out.creditLedger.push(entry(purchase, "purchase", 6, { expiresOn: addDays(today, 120) }), entry(reservation, "reservation", 1, { bookingId: `bk_roster_${id}` }));
      if (attended) out.creditLedger.push(entry(`cr_roster_con_${id}`, "consumption", 1, { bookingId: `bk_roster_${id}`, refEntryId: reservation, createdAt: at(today, "08:00") }));
    });
  });
  return out;
}

