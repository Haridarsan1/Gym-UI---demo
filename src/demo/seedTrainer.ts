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

  // The last four weeks: sessions already coached, for the clients who have none today, so the owner’s trainer utilisation has real hours to count. Each such client holds one pack of eight
  // credits and every session uses one (a reservation and a consumption), so the ledger agrees with the bookings.
  const busyToday = new Set(out.bookings.filter((b) => b.startsAt.startsWith(today)).map((b) => b.memberId));
  trainerIds.forEach((trainerId) => {
    const clients = onPlan.filter((o) => o.trainerId === trainerId && !busyToday.has(o.member.id) && hash(`${o.member.id}history`) % 3 !== 0).slice(0, 3);
    const used = new Set<string>();
    const packed = new Set<string>();
    for (let back = 28; back >= 1; back--) {
      const date = addDays(today, -back);
      const branchId = availability.find((x) => x.trainerId === trainerId && x.weekday === weekdayOf(date))?.branchId;
      if (!branchId) continue;
      clients.forEach((client, ci) => {
        if (hash(`${trainerId}${client.member.id}${date}`) % 100 >= 24) return;
        const time = ["07:00", "08:00", "18:00", "19:00"][(hash(`${client.member.id}${date}t`) + ci) % 4]!;
        const slot = slotKeyFor(trainerId, date, time);
        if (used.has(slot)) return;
        used.add(slot);
        const id = `${client.member.id}_${date}_${time.slice(0, 2)}`;
        const pack = `cr_roster_hist_${client.member.id}`;
        const entry = (eid: string, kind: CreditLedgerEntry["kind"], credits: number, extra: Partial<CreditLedgerEntry> = {}): CreditLedgerEntry => ({ id: eid, tenantId: TENANT_ID, memberId: client.member.id, kind, credits, createdBy: kind === "purchase" ? deskFor(branchId) : trainerId, createdAt: at(addDays(date, -2), "09:00"), idempotencyKey: `seed-${eid}`, ...extra });
        if (!packed.has(client.member.id)) { packed.add(client.member.id); out.creditLedger.push(entry(pack, "purchase", 8, { expiresOn: addDays(today, 120), createdAt: at(addDays(today, -40), "10:00") })); }
        out.bookings.push({ id: `bk_roster_${id}`, tenantId: TENANT_ID, memberId: client.member.id, branchId, kind: "pt_session", trainerId, startsAt: at(date, time), endsAt: at(date, `${String(Number(time.slice(0, 2)) + 1).padStart(2, "0")}:00`), status: "attended", creditEntryId: `cr_roster_res_${id}`, slotKey: slot, createdBy: client.member.id, createdAt: at(addDays(date, -2), "09:00"), idempotencyKey: `seed-booking-${id}` });
        out.creditLedger.push(entry(`cr_roster_res_${id}`, "reservation", 1, { bookingId: `bk_roster_${id}` }), entry(`cr_roster_con_${id}`, "consumption", 1, { bookingId: `bk_roster_${id}`, refEntryId: `cr_roster_res_${id}`, createdAt: at(date, "09:00") }));
      });
    }
  });
  return out;
}

