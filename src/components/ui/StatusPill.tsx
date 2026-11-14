import { cn } from "@/lib/format";

export type MembershipStatus = "active" | "pending" | "frozen" | "expired" | "canceled";
export type InvoiceStatus = "paid" | "partial" | "due" | "overdue" | "refunded";

const membership: Record<MembershipStatus, { label: string; cls: string }> = {
  active: { label: "Active", cls: "bg-status-active-bg text-status-active-fg" },
  pending: { label: "Pending", cls: "bg-status-pending-bg text-status-pending-fg" },
  frozen: { label: "Frozen", cls: "bg-status-frozen-bg text-status-frozen-fg" },
  expired: { label: "Expired", cls: "bg-status-expired-bg text-status-expired-fg" },
  canceled: { label: "Canceled", cls: "bg-status-danger-bg text-status-danger-fg" },
};

const invoice: Record<InvoiceStatus, { label: string; cls: string }> = {
  paid: { label: "Paid", cls: "border-[#2E9E5B] text-status-active-fg" },
  partial: { label: "Partially paid", cls: "border-[#D29A3A] text-status-pending-fg" },
  due: { label: "Due", cls: "border-ash-500 text-ash-600" },
  overdue: { label: "Overdue", cls: "border-[#D0473C] text-status-danger-fg" },
  refunded: { label: "Refunded", cls: "border-[#5B8FC0] text-status-frozen-fg" },
};

/** Membership status: filled pill. */
export function MembershipPill({ status, className }: { status: MembershipStatus; className?: string }) {
  const s = membership[status];
  return (
    <span className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold", s.cls, className)}>
      {s.label}
    </span>
  );
}

/** Invoice status: outlined pill — deliberately different from membership status (spec M02). */
export function InvoicePill({ status, className }: { status: InvoiceStatus; className?: string }) {
  const s = invoice[status];
  return (
    <span
      className={cn("inline-flex items-center rounded-full border-[1.5px] px-2 py-[1px] text-xs font-semibold", s.cls, className)}
    >
      {s.label}
    </span>
  );
}
