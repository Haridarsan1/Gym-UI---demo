import { effectiveStatus } from "@/domain/lifecycle";
import type { CheckIn, Membership } from "@/domain/types";

/**
 * Check-in eligibility and the scan window (M05). Used by the member’s pass to say whether it will open the door, by the demo
 * scan, and later by the front desk (M3), so the answer is the same everywhere.
 *
 * A scan is allowed when the membership is active and in date, covers the branch, and (for a visit pass) has a visit left.
 * Open dues don’t stop entry; they are flagged. A second scan at the same branch within `SCAN_WINDOW_MINUTES` of an allowed
 * one is a repeat: it is recorded, lets the member through, and uses no extra visit.
 */

export const SCAN_WINDOW_MINUTES = 10;

export type DenyReason = "no_membership" | "pending" | "scheduled" | "frozen" | "expired" | "canceled" | "branch" | "no_visits";

export interface Decision {
  result: CheckIn["result"];
  /** Set when the result is denied. */
  reason?: DenyReason;
  visitDebited: boolean;
  /** An allowed scan that is a grace-period entry, so the screen can say the membership has run out. */
  inGrace?: boolean;
}

type MembershipFacts = Pick<Membership, "status" | "startsOn" | "endsOn" | "visitsRemaining" | "graceUntil"> & Partial<Pick<Membership, "freezes" | "canceledEffectiveOn">> & { terms: Pick<Membership["terms"], "kind" | "branchIds"> };

export interface DecisionInput {
  membership: MembershipFacts | undefined;
  branchId: string;
  today: string;
  nowIso: string;
  /** The member’s earlier check-ins, any branch. */
  recent: Array<Pick<CheckIn, "at" | "result" | "branchId">>;
  hasOpenDues?: boolean;
  /** The gym’s repeat-scan window, in minutes (a policy). Defaults to `SCAN_WINDOW_MINUTES`. */
  scanWindowMinutes?: number;
}

const ENTERED: ReadonlySet<CheckIn["result"]> = new Set(["allowed", "allowed_with_dues", "override", "repeat_scan"]);
export const enteredOk = (result: CheckIn["result"]): boolean => ENTERED.has(result);

/** Why a membership can’t be used today, or undefined when it can. Ignores the branch, which depends on the door. */
export function whyNotValid(m: MembershipFacts | undefined, today: string): { reason: DenyReason; inGrace?: boolean } | undefined {
  if (!m) return { reason: "no_membership" };
  // What it is today: a freeze that has ended and a cancellation that has taken effect count (domain/lifecycle.ts).
  const status = effectiveStatus({ status: m.status, freezes: m.freezes ?? [], canceledEffectiveOn: m.canceledEffectiveOn, endsOn: m.endsOn }, today);
  if (status === "pending") return { reason: "pending" };
  if (status === "scheduled" || m.startsOn > today) return { reason: "scheduled" };
  if (status === "frozen") return { reason: "frozen" };
  if (status === "canceled") return { reason: "canceled" };
  const over = status === "expired" || (m.endsOn !== undefined && m.endsOn < today);
  if (over) return m.graceUntil && m.graceUntil >= today ? undefined : { reason: "expired" };
  return undefined;
}

export function checkInDecision(i: DecisionInput): Decision {
  const bad = whyNotValid(i.membership, i.today);
  if (bad) return { result: "denied", reason: bad.reason, visitDebited: false };
  const m = i.membership!;
  if (!m.terms.branchIds.includes(i.branchId)) return { result: "denied", reason: "branch", visitDebited: false };
  const visitPass = m.terms.kind === "visit";
  const now = Date.parse(i.nowIso);
  const repeat = i.recent.some((c) => c.branchId === i.branchId && enteredOk(c.result) && c.result !== "repeat_scan" && now - Date.parse(c.at) >= 0 && now - Date.parse(c.at) < (i.scanWindowMinutes ?? SCAN_WINDOW_MINUTES) * 60_000);
  if (repeat) return { result: "repeat_scan", visitDebited: false };
  if (visitPass && (m.visitsRemaining ?? 0) <= 0) return { result: "denied", reason: "no_visits", visitDebited: false };
  const over = m.status === "expired" || (m.endsOn !== undefined && m.endsOn < i.today);
  return { result: i.hasOpenDues ? "allowed_with_dues" : "allowed", visitDebited: visitPass, inGrace: over };
}

/** What the front desk reads when a member can’t be let in: plain, about the member, with what to do next. */
export function staffDenyText(reason: DenyReason, firstName: string, m: { startsOn?: string; endsOn?: string; freezeTo?: string } | undefined): string {
  const date = (d?: string) => (d ? new Date(`${d}T00:00:00Z`).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }) : "");
  switch (reason) {
    case "no_membership": return `${firstName} has no membership. Offer a plan from New member or the member’s profile.`;
    case "pending": return `${firstName}’s membership starts after the first payment. Collect the open invoice and they can come in.`;
    case "scheduled": return `${firstName}’s membership starts on ${date(m?.startsOn)}.`;
    case "frozen": return m?.freezeTo ? `${firstName}’s membership is frozen until ${date(m.freezeTo)}.` : `${firstName}’s membership is frozen.`;
    case "expired": return m?.endsOn ? `${firstName}’s membership ended on ${date(m.endsOn)}. Renew it to let them in.` : `${firstName}’s membership has ended. Renew it to let them in.`;
    case "canceled": return `${firstName}’s membership was canceled. A new membership is needed to come in.`;
    case "branch": return `${firstName}’s plan doesn’t cover this branch. Upgrade the plan, or use an override if the gym allows it.`;
    case "no_visits": return `${firstName} has used every visit on their pass. Renew or top up to let them in.`;
  }
}
