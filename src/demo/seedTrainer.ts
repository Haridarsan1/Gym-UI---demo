import { TENANT_ID } from "@/app/demoAccounts";
import { addDays, istDateTime } from "@/domain/dates";
import { slotKeyFor, weekdayOf } from "@/domain/slots";
import type { Booking, CreditLedgerEntry, Member, Membership, TrainerAssignment, TrainerAvailability } from "@/domain/types";
import { PERSONAS } from "@/demo/personas";
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
  /** Slots already taken by other bookings (a slot key each), so a coached session never lands on one. */
  taken?: string[];
}

/** How many days of coached sessions the demo has, and the share of the hours each trainer could be booked that were coached (Kavya, with the fewest clients, is the one noticeably lower). */
export const HISTORY_DAYS = 30;
export const COACHED_SHARE: Record<string, number> = { u_trainer_sanjay: 0.95, u_trainer_vikrant: 0.95, u_trainer_aditya: 0.8, u_trainer_meera: 0.78, u_trainer_farah: 0.72, u_trainer_kavya: 0.5 };

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

  // The last thirty days: sessions already coached, so the owner’s trainer utilisation has real hours to count. Each trainer fills a share of the hours they could be booked (below), busiest
  // early in the morning and in the evening, with their own clients at the branch they are at that day, never one client twice in a day and the client with the fewest recent sessions first.
  // Each client holds one pack that covers their sessions and a few more, and every session used one credit (a reservation and a consumption), so the ledger agrees with the bookings.
  const taken = new Set(input.taken ?? []);
  const hourWeight: Record<number, number> = { 6: 1.25, 7: 1.3, 8: 1.1, 9: 0.8, 10: 0.6, 17: 1.0, 18: 1.3, 19: 1.25, 20: 0.9 };
  const personas = new Set(PERSONAS.map((p) => p.memberId));
  const pool = input.trainerAssignments.filter((a) => !a.effectiveTo && !personas.has(a.memberId)).flatMap((a) => {
    const member = input.members.find((m) => m.id === a.memberId);
    const membership = input.memberships.find((m) => m.memberId === a.memberId && m.status === "active");
    return member && membership ? [{ trainerId: a.trainerId, member, startsOn: membership.startsOn }] : [];
  });
  trainerIds.forEach((trainerId) => {
    const share = COACHED_SHARE[trainerId] ?? 0.6;
    const clients = pool.filter((c) => c.trainerId === trainerId);
    const sessions: Array<{ memberId: string; branchId: string; date: string; time: string; status: "attended" | "no_show" }> = [];
    const recent = new Map<string, string[]>();
    for (let back = HISTORY_DAYS; back >= 1; back--) {
      const date = addDays(today, -back);
      const windows = availability.filter((x) => x.trainerId === trainerId && x.weekday === weekdayOf(date));
      const busy = new Set<string>();
      for (const w of windows) {
        for (let h = Number(w.start.slice(0, 2)); h < Number(w.end.slice(0, 2)); h++) {
          const time = `${String(h).padStart(2, "0")}:00`;
          if (hash(`${trainerId}${date}${h}`) % 1000 >= Math.min(0.95, share * (hourWeight[h] ?? 1)) * 1000) continue;
          const slot = slotKeyFor(trainerId, date, time);
          if (taken.has(slot)) continue;
          const weekAgo = addDays(date, -7);
          const next = clients
            .filter((c) => c.member.homeBranchId === w.branchId && c.startsOn <= date && !busy.has(c.member.id))
            .sort((a, b) => (recent.get(a.member.id)?.filter((d) => d > weekAgo).length ?? 0) - (recent.get(b.member.id)?.filter((d) => d > weekAgo).length ?? 0) || hash(`${a.member.id}${date}${h}`) - hash(`${b.member.id}${date}${h}`))[0];
          if (!next) continue;
          busy.add(next.member.id);
          taken.add(slot);
          recent.set(next.member.id, [...(recent.get(next.member.id) ?? []), date]);
          sessions.push({ memberId: next.member.id, branchId: w.branchId, date, time, status: hash(`${next.member.id}${date}ns`) % 100 < 4 ? "no_show" : "attended" });
        }
      }
    }
    const count = new Map<string, number>();
    for (const s of sessions) count.set(s.memberId, (count.get(s.memberId) ?? 0) + 1);
    for (const [memberId, n] of count) {
      const member = clients.find((c) => c.member.id === memberId)!.member;
      out.creditLedger.push({ id: `cr_roster_hist_${memberId}`, tenantId: TENANT_ID, memberId, kind: "purchase", credits: n + 3 + (hash(memberId) % 3), expiresOn: addDays(today, 120), createdBy: deskFor(member.homeBranchId), createdAt: at(addDays(today, -HISTORY_DAYS - 6), "10:00"), idempotencyKey: `seed-cr_roster_hist_${memberId}` });
    }
    for (const s of sessions) {
      const id = `${s.memberId}_${s.date}_${s.time.slice(0, 2)}`;
      const reservation = `cr_roster_res_${id}`;
      const entry = (eid: string, kind: CreditLedgerEntry["kind"], extra: Partial<CreditLedgerEntry> = {}): CreditLedgerEntry => ({ id: eid, tenantId: TENANT_ID, memberId: s.memberId, kind, credits: 1, createdBy: trainerId, createdAt: at(addDays(s.date, -2), "09:00"), idempotencyKey: `seed-${eid}`, ...extra });
      out.bookings.push({
        id: `bk_roster_${id}`, tenantId: TENANT_ID, memberId: s.memberId, branchId: s.branchId, kind: "pt_session", trainerId, startsAt: at(s.date, s.time), endsAt: at(s.date, `${String(Number(s.time.slice(0, 2)) + 1).padStart(2, "0")}:00`), status: s.status,
        creditEntryId: reservation, slotKey: slotKeyFor(trainerId, s.date, s.time), createdBy: s.memberId, createdAt: at(addDays(s.date, -2), "09:00"), idempotencyKey: `seed-booking-${id}`,
      });
      out.creditLedger.push(entry(reservation, "reservation", { bookingId: `bk_roster_${id}` }), entry(`cr_roster_con_${id}`, "consumption", { bookingId: `bk_roster_${id}`, refEntryId: reservation, createdAt: at(s.date, "09:00") }));
    }
  });
  return out;
}

