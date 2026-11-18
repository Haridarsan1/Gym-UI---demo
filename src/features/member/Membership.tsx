import { useState } from "react";
import { Receipt, Ticket, Wallet } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { useMembership } from "@/api";
import type { MembershipData } from "@/api";
import { DEMO_MODE } from "@/app/mode";
import { Button3D } from "@/design/Button3D";
import { QueryBoundary } from "@/design/QueryBoundary";
import { SkeletonCard, SkeletonRows } from "@/design/Skeleton";
import { EmptyState } from "@/design/States";
import { AutoRenewCard } from "@/features/member/membership/AutoRenew";
import { CheckoutSheet, type Intent } from "@/features/member/membership/CheckoutSheet";
import { CurrentCard } from "@/features/member/membership/CurrentCard";
import { DemoPanel } from "@/features/member/membership/DemoPanel";
import { InvoiceList, PaymentHistory } from "@/features/member/membership/Lists";
import { Chips } from "@/features/member/progress/MetricCard";
import { formatRupees, formatWeekdayDate } from "@/lib/when";

/** Membership (M01 to M04, M06): the plan, paying, renewing, buying sessions, auto-renew, invoices, payments and receipts. */
export default function Membership() {
  const query = useMembership();
  return (
    <div className="space-y-5">
      <header>
        <p className="text-sm text-clay-muted">{query.data ? formatWeekdayDate(query.data.today) : "Your plan and payments"}</p>
        <h1 className="text-[1.7rem] font-bold leading-tight tracking-tight">Membership</h1>
      </header>
      <QueryBoundary query={query} errorTitle="We couldn’t load your membership" skeleton={<MembershipSkeleton />}>
        {(d) => <MembershipContent d={d} />}
      </QueryBoundary>
    </div>
  );
}

function intentFrom(params: URLSearchParams): Intent | null {
  const pay = params.get("pay");
  if (pay) return { kind: "invoice", invoiceId: pay };
  if (params.get("renew")) return { kind: "renewal" };
  if (params.get("buy") === "sessions") return { kind: "sessions" };
  return null;
}

function MembershipContent({ d }: { d: MembershipData }) {
  const [params, setParams] = useSearchParams();
  const [intent, setIntent] = useState<Intent | null>(() => intentFrom(params));
  const [tab, setTab] = useState<"invoices" | "payments">("invoices");
  const close = () => {
    setIntent(null);
    for (const k of ["pay", "renew", "buy"]) params.delete(k);
    setParams(params, { replace: true });
  };
  const m = d.current;
  const canRenew = d.renewal.options.length > 0;
  const shownInvoices = d.invoices.filter((i) => i.status !== "void");

  return (
    <>
      {d.dues && (
        <aside aria-label="Payment due" className="rounded-2xl bg-status-pending-bg px-4 py-4 text-status-pending-fg">
          <div className="flex items-start gap-3">
            <Receipt className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
            <p className="text-[0.95rem]">
              {d.dues.overdue ? "Overdue: " : ""}You have {formatRupees(d.dues.totalDuePaise)} to pay{d.dues.totalDuePaise !== d.dues.duePaise ? `, starting with invoice ${d.dues.number} of ${formatRupees(d.dues.duePaise)}` : ` on invoice ${d.dues.number}`}.
            </p>
          </div>
          <Button3D className="mt-3 w-full" onClick={() => setIntent({ kind: "invoice", invoiceId: d.dues!.invoiceId })}>
            Pay {formatRupees(d.dues.duePaise)}
          </Button3D>
        </aside>
      )}

      {m ? (
        <CurrentCard d={d} />
      ) : (
        <EmptyState icon={Wallet} title="No membership yet">Ask the front desk to set up your membership. Your invoices and receipts will appear here.</EmptyState>
      )}

      {m && (
        <section aria-label="Renew or buy" className="space-y-3">
          <Button3D size="lg" className="w-full" disabled={!canRenew} onClick={() => setIntent({ kind: "renewal" })}>
            Renew membership
          </Button3D>
          {!canRenew && d.renewal.blockedReason && <p className="px-1 text-sm text-clay-muted">{d.renewal.blockedReason}</p>}
          <div className="clay-flat flex items-center justify-between gap-3 p-4">
            <div>
              <p className="font-bold">Training sessions</p>
              <p className="text-sm text-clay-muted">
                {d.credits.available} {d.credits.available === 1 ? "session" : "sessions"} left{d.credits.reserved ? `, ${d.credits.reserved} held for bookings` : ""}
              </p>
            </div>
            <Button3D variant="white" disabled={!!d.sessions.blockedReason} onClick={() => setIntent({ kind: "sessions" })}>
              <Ticket className="h-5 w-5" aria-hidden="true" />
              Buy more sessions
            </Button3D>
          </div>
        </section>
      )}

      {m && <AutoRenewCard d={d} />}

      <Chips
        label="Money"
        value={tab}
        options={[{ value: "invoices", label: `Invoices (${shownInvoices.length})` }, { value: "payments", label: `Payments (${d.payments.length})` }]}
        onChange={setTab}
      />
      {tab === "invoices" ? <InvoiceList invoices={d.invoices} /> : <PaymentHistory payments={d.payments} />}

      {DEMO_MODE && <DemoPanel d={d} />}

      <CheckoutSheet intent={intent} d={d} onClose={close} />
    </>
  );
}

function MembershipSkeleton() {
  return (
    <div className="space-y-5" role="status" aria-label="Loading your membership">
      <SkeletonCard />
      <SkeletonRows rows={3} />
    </div>
  );
}
