import { cn } from "@/lib/format";
import type { PlanState } from "@/domain/plans";
import type { Booking, Invoice, Membership, WorkoutLog } from "@/domain/types";

type Pill = { label: string; cls: string };

/** Membership status is a filled pill. Invoice status is an outlined pill (M02), so the two never look alike. */
const membership: Record<Membership["status"], Pill> = {
  active: { label: "Active", cls: "bg-status-active-bg text-status-active-fg" },
  pending: { label: "Pending", cls: "bg-status-pending-bg text-status-pending-fg" },
  scheduled: { label: "Scheduled", cls: "bg-lilac-100 text-lilac-700" },
  frozen: { label: "Frozen", cls: "bg-status-frozen-bg text-status-frozen-fg" },
  expired: { label: "Expired", cls: "bg-status-expired-bg text-status-expired-fg" },
  canceled: { label: "Canceled", cls: "bg-status-danger-bg text-status-danger-fg" },
};

const invoice: Record<Invoice["status"] | "overdue", Pill> = {
  draft: { label: "Draft", cls: "border-clay-subtle text-clay-muted" },
  open: { label: "Due", cls: "border-clay-subtle text-clay-ink" },
  partially_paid: { label: "Partly paid", cls: "border-[#D29A3A] text-status-pending-fg" },
  paid: { label: "Paid", cls: "border-[#2E9E5B] text-status-active-fg" },
  void: { label: "Void", cls: "border-clay-line text-clay-subtle line-through" },
  overdue: { label: "Overdue", cls: "border-[#D0473C] text-status-danger-fg" },
};

/** A skipped workout is never red. Missing a day is not an error. */
const workout: Record<Exclude<WorkoutLog["status"], "draft"> | "draft" | "scheduled", Pill> = {
  completed: { label: "Completed", cls: "bg-status-active-bg text-status-active-fg" },
  partial: { label: "Partly done", cls: "bg-status-pending-bg text-status-pending-fg" },
  skipped: { label: "Skipped", cls: "bg-status-expired-bg text-status-expired-fg" },
  draft: { label: "In progress", cls: "bg-lilac-100 text-lilac-700" },
  scheduled: { label: "Scheduled", cls: "bg-clay-lavender text-clay-muted" },
};

const booking: Record<Booking["status"], Pill> = {
  booked: { label: "Booked", cls: "bg-lilac-100 text-lilac-700" },
  canceled: { label: "Canceled", cls: "bg-status-expired-bg text-status-expired-fg" },
  attended: { label: "Attended", cls: "bg-status-active-bg text-status-active-fg" },
  no_show: { label: "No-show", cls: "bg-status-pending-bg text-status-pending-fg" },
};

const filled = "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold";
const outlined = "inline-flex items-center rounded-full border-[1.5px] px-2 py-[1px] text-xs font-semibold";

export function MembershipStatusPill({ status, className }: { status: Membership["status"]; className?: string }) {
  const p = membership[status];
  return <span className={cn(filled, p.cls, className)}>{p.label}</span>;
}

export function InvoiceStatusPill({ status, className }: { status: Invoice["status"] | "overdue"; className?: string }) {
  const p = invoice[status];
  return <span className={cn(outlined, p.cls, className)}>{p.label}</span>;
}

export function WorkoutStatusPill({ status, className }: { status: keyof typeof workout; className?: string }) {
  const p = workout[status];
  return <span className={cn(filled, p.cls, className)}>{p.label}</span>;
}

export function BookingStatusPill({ status, className }: { status: Booking["status"]; className?: string }) {
  const p = booking[status];
  return <span className={cn(filled, p.cls, className)}>{p.label}</span>;
}

const planState: Record<PlanState, Pill> = {
  on_sale: { label: "On sale", cls: "bg-status-active-bg text-status-active-fg" },
  scheduled: { label: "Starts later", cls: "bg-lilac-100 text-lilac-700" },
  ended: { label: "Ended", cls: "bg-status-expired-bg text-status-expired-fg" },
  off: { label: "Not on sale", cls: "bg-status-expired-bg text-status-expired-fg" },
};

/** Whether a plan is being sold. A filled pill, like membership status; it is the plan’s state, not money. */
export function PlanStatePill({ state, className }: { state: PlanState; className?: string }) {
  return <span className={cn(filled, planState[state].cls, className)}>{planState[state].label}</span>;
}
