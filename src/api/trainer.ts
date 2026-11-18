import { db } from "@/demo/db";
import { assertCan, open } from "@/api/context";
import { now } from "@/api/clock";
import { ApiError } from "@/api/errors";
import { istDateOf, todayIST } from "@/domain/dates";
import { sessionPhases, type SessionPhase } from "@/domain/trainerToday";
import { loadBook } from "@/api/book";
import type { Principal } from "@/domain/permissions";
import type { Session } from "@/app/session";

/**
 * Everything the trainer app reads goes through this file. Each function opens the call, checks that the caller is a
 * trainer, and returns only the clients assigned to them today (their open `TrainerAssignment`). The decisions about what
 * counts as overdue, missed or expiring are in `domain/trainerToday.ts`.
 */

export interface TrainerContext {
  principal: Principal;
  trainerId: string;
  tenantId: string;
  today: string;
  nowIso: string;
}

export async function openTrainer(session: Session | null): Promise<TrainerContext> {
  const { principal } = await open(session);
  if (principal.role !== "trainer" || !principal.tenantId) throw new ApiError("forbidden", "This screen is for trainers. Log in with a trainer account.");
  assertCan(principal, "member.list");
  const clock = now();
  return { principal, trainerId: principal.userId, tenantId: principal.tenantId, today: todayIST(clock), nowIso: clock.toISOString() };
}

export interface ClientRef {
  memberId: string;
  name: string;
}
export interface SessionItem extends ClientRef {
  id: string;
  startsAt: string;
  endsAt: string;
  branchName: string;
  status: "booked" | "attended" | "no_show";
  phase: SessionPhase;
}
export interface OverdueReview extends ClientRef {
  dueOn: string;
  daysOver: number;
  /** In words: “Follow-up date has passed”, “Reviewed every 14 days”, “No review yet”. */
  reason: string;
}
export interface MissedItem extends ClientRef {
  missed: number;
  scheduled: number;
  lastMissedOn?: string;
  lastDoneOn?: string;
}
export interface ExpiringItem extends ClientRef {
  credits: number;
  expiresOn: string;
  daysLeft: number;
}
export interface AwaitingItem extends ClientRef {
  /** Days since the trainer was assigned or the membership began, whichever is later. */
  daysWaiting: number;
  planName: string;
}

export interface TrainerTodayData {
  firstName: string;
  gymName: string;
  today: string;
  nowIso: string;
  /** Clients with an active or frozen membership. */
  clients: number;
  sessions: SessionItem[];
  overdueReviews: OverdueReview[];
  missed: MissedItem[];
  expiring: ExpiringItem[];
  awaitingPlan: AwaitingItem[];
}



/** T07: the trainer’s dashboard. */
export async function getTrainerToday(session: Session | null): Promise<TrainerTodayData> {
  const c = await openTrainer(session);
  const [user, tenant, bookings, branches, book] = await Promise.all([
    db.users.get(c.trainerId),
    db.tenants.get(c.tenantId),
    db.bookings.where("trainerId").equals(c.trainerId).toArray(),
    db.branches.where("tenantId").equals(c.tenantId).toArray(),
    loadBook(c),
  ]);
  const out: TrainerTodayData = {
    firstName: (user?.name ?? c.principal.userId).split(" ")[0]!, gymName: tenant?.name ?? "Your gym", today: c.today, nowIso: c.nowIso,
    clients: book.clients.length, sessions: [], overdueReviews: [], missed: [], expiring: [], awaitingPlan: [],
  };
  for (const k of book.clients) {
    const ref: ClientRef = { memberId: k.member.id, name: k.member.name };
    if (k.expiring) out.expiring.push({ ...ref, ...k.expiring });
    if (k.awaiting) out.awaitingPlan.push({ ...ref, ...k.awaiting });
    if (k.review?.overdue) out.overdueReviews.push({ ...ref, dueOn: k.review.dueOn, daysOver: k.review.daysOver, reason: k.review.reason });
    if (k.missed) out.missed.push({ ...ref, missed: k.missed.missed, scheduled: k.missed.scheduled, lastMissedOn: k.missed.lastMissedOn, lastDoneOn: k.missed.lastDoneOn });
  }
  const memberById = new Map(book.members.map((m) => [m.id, m]));
  const branchName = new Map(branches.map((b) => [b.id, b.name]));
  const todays = bookings.filter((b) => b.kind === "pt_session" && b.status !== "canceled" && istDateOf(b.startsAt) === c.today).sort((x, y) => x.startsAt.localeCompare(y.startsAt));
  const phases = sessionPhases(todays.map((b) => ({ startsAt: b.startsAt, endsAt: b.endsAt, status: b.status as "booked" | "attended" | "no_show" })), c.nowIso);
  out.sessions = todays.map((b, i) => ({
    id: b.id, memberId: b.memberId, name: memberById.get(b.memberId)?.name ?? "Client", startsAt: b.startsAt, endsAt: b.endsAt, branchName: branchName.get(b.branchId) ?? "",
    status: b.status as SessionItem["status"], phase: phases[i]!,
  }));

  out.overdueReviews.sort((x, y) => y.daysOver - x.daysOver || x.name.localeCompare(y.name));
  out.missed.sort((x, y) => y.missed - x.missed || x.name.localeCompare(y.name));
  out.expiring.sort((x, y) => x.daysLeft - y.daysLeft || x.name.localeCompare(y.name));
  out.awaitingPlan.sort((x, y) => y.daysWaiting - x.daysWaiting || x.name.localeCompare(y.name));
  return out;
}
