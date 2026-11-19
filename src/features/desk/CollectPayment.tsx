import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Search } from "lucide-react";
import { useMembers } from "@/api/hooks";
import { useMemberProfile } from "@/api/deskHooks";
import { Avatar } from "@/design/Avatar";
import { Button3D } from "@/design/Button3D";
import { QueryBoundary } from "@/design/QueryBoundary";
import { SkeletonRows } from "@/design/Skeleton";
import { EmptyState } from "@/design/States";
import { useBranch } from "@/design/shells/BranchContext";
import { CollectSheet } from "@/features/desk/member/Sheets";
import { formatDate, formatRupees } from "@/lib/when";
import { useState } from "react";

/**
 * Collect payment (M03): find the member, see what they owe, and record cash, UPI, card or a transfer against an invoice, in full or (when the gym
 * allows it) in part. The receipt is emailed and can be printed. The member is in the address (`?member=`).
 */
export default function CollectPayment() {
  const [params, setParams] = useSearchParams();
  const memberId = params.get("member") ?? undefined;
  return (
    <div className="space-y-4">
      <h1 className="text-[1.7rem] font-bold tracking-tight lg:text-4xl">Collect payment</h1>
      {memberId ? <Owed memberId={memberId} onOther={() => setParams({}, { replace: true })} /> : <Find onPick={(id) => setParams({ member: id }, { replace: true })} />}
    </div>
  );
}

function Find({ onPick }: { onPick: (id: string) => void }) {
  const [q, setQ] = useState("");
  const { branchId } = useBranch();
  const query = useMembers({ search: q, branchId: branchId === "all" ? undefined : branchId, pageSize: 8 });
  return (
    <section aria-labelledby="find-title" className="clay max-w-2xl space-y-3 p-4 sm:p-5">
      <h2 id="find-title" className="text-lg font-bold">Who is paying?</h2>
      <label className="relative block">
        <span className="sr-only">Search members</span>
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-clay-muted" aria-hidden="true" />
        <input type="search" autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name or phone number" className="h-14 w-full rounded-2xl border border-clay-line bg-white pl-11 pr-3 text-lg focus:border-ember-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-ember-300" />
      </label>
      {q.trim().length >= 2 && (
        <QueryBoundary query={query} errorTitle="We couldn’t search" skeleton={<SkeletonRows rows={3} />}>
          {(page) => page.rows.length === 0 ? <EmptyState title="No member matches">Check the spelling, or register them in New member.</EmptyState> : (
            <ul aria-label="Matching members" className="divide-y divide-clay-line rounded-2xl border border-clay-line bg-white">
              {page.rows.map((m) => (
                <li key={m.id}><button type="button" onClick={() => onPick(m.id)} className="flex min-h-[3.5rem] w-full cursor-pointer items-center gap-3 px-4 py-2 text-left hover:bg-clay-canvas"><Avatar name={m.name} /><span className="min-w-0 flex-1"><span className="block truncate font-semibold">{m.name}</span><span className="block truncate text-sm text-clay-muted">{m.phone}, {m.branchName}</span></span><span className="font-bold text-ember-700">Choose</span></button></li>
              ))}
            </ul>
          )}
        </QueryBoundary>
      )}
    </section>
  );
}

function Owed({ memberId, onOther }: { memberId: string; onOther: () => void }) {
  const navigate = useNavigate();
  const query = useMemberProfile(memberId);
  const [invoiceId, setInvoiceId] = useState<string>();
  const [open, setOpen] = useState(false);
  return (
    <QueryBoundary query={query} errorTitle="We couldn’t open this member" skeleton={<SkeletonRows rows={4} />}>
      {(p) => {
        const owed = p.invoices.filter((i) => i.duePaise > 0 && i.status !== "void");
        return (
          <section aria-labelledby="owed-title" className="clay max-w-2xl space-y-3 p-4 sm:p-5">
            <div className="flex items-center gap-3"><Avatar name={p.member.name} /><div className="min-w-0 flex-1"><h2 id="owed-title" className="truncate text-lg font-bold">{p.member.name}</h2><p className="text-sm text-clay-muted">{p.member.phone}, {p.member.branchName}</p></div><button type="button" onClick={onOther} className="min-h-[2.75rem] cursor-pointer font-semibold underline underline-offset-4">Someone else</button></div>
            {owed.length === 0 ? <p className="rounded-2xl bg-status-active-bg p-4 font-semibold text-status-active-fg">{p.member.firstName} owes nothing. Every invoice is paid.</p> : (
              <>
                <p className="font-semibold">{formatRupees(p.dues.totalPaise)} owed on {p.dues.invoices} {p.dues.invoices === 1 ? "invoice" : "invoices"}</p>
                <ul aria-label="Open invoices" className="space-y-2">
                  {owed.map((i) => (
                    <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-clay-canvas p-3">
                      <span><span className="font-semibold">{i.number}</span> <span className="text-clay-muted">{i.description}</span><span className="block text-sm text-clay-muted">{formatRupees(i.duePaise)} due{i.status === "partially_paid" ? `, part paid (${formatRupees(i.paidPaise)})` : ""}{i.overdue ? `, overdue since ${formatDate(i.dueOn)}` : ""}</span></span>
                      <Button3D size="md" variant="ember" onClick={() => { setInvoiceId(i.id); setOpen(true); }}>Collect {formatRupees(i.duePaise)}</Button3D>
                    </li>
                  ))}
                </ul>
              </>
            )}
            <p><Link to={`/desk/members/${p.member.id}`} className="font-semibold underline underline-offset-4">Open the member’s profile</Link></p>
            {open && <CollectSheet p={p} invoiceId={invoiceId} onClose={() => { setOpen(false); navigate(`/desk/payments/new?member=${memberId}`, { replace: true }); }} />}
          </section>
        );
      }}
    </QueryBoundary>
  );
}
