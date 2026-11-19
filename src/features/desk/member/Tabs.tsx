import { Link } from "react-router-dom";
import type { MemberProfileData } from "@/api/memberProfile";
import { Button3D } from "@/design/Button3D";
import { BookingStatusPill } from "@/design/StatusPills";
import { formatDate, formatRupees, formatTime } from "@/lib/when";
import { PAY_METHOD_LABEL } from "@/domain/renewal";
import { istDateOf } from "@/domain/dates";

const Empty = ({ children }: { children: string }) => <p className="mt-2 text-[0.95rem] text-clay-muted">{children}</p>;
const when = (iso: string) => `${formatDate(istDateOf(iso))}, ${formatTime(iso)}`;
const STATUS = { open: "Open", partially_paid: "Part paid", paid: "Paid", void: "Void", draft: "Draft" } as const;
const method = (m: string) => PAY_METHOD_LABEL[m as keyof typeof PAY_METHOD_LABEL] ?? m;

export function Billing({ p, canPay, canRefund, collect, refund }: { p: MemberProfileData; canPay: boolean; canRefund: boolean; collect: (id?: string) => void; refund: () => void }) {
  return (
    <>
      <section aria-labelledby="inv-title" className="clay p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2"><h2 id="inv-title" className="text-lg font-bold">Invoices</h2>{canPay && p.dues.totalPaise > 0 && <Button3D size="md" variant="ember" onClick={() => collect()}>Collect payment</Button3D>}</div>
        {p.invoices.length === 0 ? <Empty>No invoices yet.</Empty> : (
          <ul aria-label="Invoices" className="mt-2 divide-y divide-clay-line">
            {p.invoices.map((i) => (
              <li key={i.id} className="flex flex-wrap items-start justify-between gap-2 py-3">
                <span className="min-w-0"><Link to={`/desk/members/${p.member.id}/invoices/${i.id}`} className="inline-flex min-h-[2.75rem] items-center font-semibold underline underline-offset-4">{i.number}</Link> <span className="text-sm text-clay-muted">{formatDate(i.issuedOn)}</span><span className="block text-[0.95rem]">{i.description}</span>{i.creditNote && <span className="block text-sm text-clay-muted">Credit note {i.creditNote.number}: −{formatRupees(i.creditNote.totalPaise)}</span>}</span>
                <span className="text-right"><span className="block font-semibold tabular">{formatRupees(i.totalPaise)}</span><span className="block text-sm text-clay-muted">{STATUS[i.status]}{i.duePaise > 0 ? `, ${formatRupees(i.duePaise)} due` : ""}{i.overdue ? ", overdue" : ""}</span></span>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section aria-labelledby="pay-title" className="clay p-4 sm:p-5">
        <h2 id="pay-title" className="text-lg font-bold">Payments</h2>
        {p.payments.length === 0 ? <Empty>No payments yet.</Empty> : (
          <ul aria-label="Payments" className="mt-2 divide-y divide-clay-line">
            {p.payments.map((x) => (
              <li key={x.id} className="flex flex-wrap items-start justify-between gap-2 py-3">
                <span className="min-w-0"><span className="font-semibold">{method(x.method)}</span> <span className="text-sm text-clay-muted">{when(x.at)}</span><span className="block text-sm text-clay-muted">Invoice {x.invoiceNumber}{x.receiptNumber ? `, receipt ${x.receiptNumber}` : ""}{x.reference ? `, ${x.reference}` : ""}{x.by ? `, taken by ${x.by}` : ""}</span></span>
                <span className="text-right"><span className="block font-semibold tabular">{formatRupees(x.amountPaise)}</span>{x.status !== "succeeded" && <span className="block text-sm text-clay-muted">{x.status === "failed" ? "Did not go through" : "Pending"}</span>}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section aria-labelledby="cn-title" className="clay p-4 sm:p-5">
        <h2 id="cn-title" className="text-lg font-bold">Credit notes</h2>
        {p.creditNotes.length === 0 ? <Empty>None. An upgrade issues one for the unused days of the old plan.</Empty> : (
          <ul aria-label="Credit notes" className="mt-2 divide-y divide-clay-line">
            {p.creditNotes.map((n) => <li key={n.id} className="py-3"><span className="font-semibold">{n.number}</span> <span className="text-sm text-clay-muted">{formatDate(n.issuedOn)}</span><span className="block text-[0.95rem]">{formatRupees(n.totalPaise)} against invoice {n.invoiceNumber}{n.appliedTo ? `, applied to ${n.appliedTo}` : ""}</span><span className="block text-sm text-clay-muted">{n.reason}</span></li>)}
          </ul>
        )}
      </section>
      {canRefund && p.invoices.some((i) => i.paidPaise > 0) && <div><Button3D variant="white" size="md" onClick={refund}>Request refund</Button3D></div>}
    </>
  );
}

const KIND = { purchase: "Bought", reservation: "Held for a booking", consumption: "Used", release: "Given back", reversal: "Reversed", expiry: "Expired", adjustment: "Adjusted" } as const;

export function Credits({ p }: { p: MemberProfileData }) {
  const b = p.credits.balance;
  return (
    <section aria-labelledby="cr-title" className="clay p-4 sm:p-5">
      <h2 id="cr-title" className="text-lg font-bold">Training credits</h2>
      <dl className="mt-3 grid grid-cols-3 gap-3 sm:max-w-md">
        <div className="rounded-2xl bg-clay-canvas p-3"><dt className="text-sm text-clay-muted">Available</dt><dd className="font-display text-3xl font-extrabold tabular">{b.available}</dd></div>
        <div className="rounded-2xl bg-clay-canvas p-3"><dt className="text-sm text-clay-muted">Held</dt><dd className="font-display text-3xl font-extrabold tabular">{b.reserved}</dd></div>
        <div className="rounded-2xl bg-clay-canvas p-3"><dt className="text-sm text-clay-muted">Used</dt><dd className="font-display text-3xl font-extrabold tabular">{b.consumed}</dd></div>
      </dl>
      {p.credits.ledger.length === 0 ? <Empty>No credits have been bought.</Empty> : (
        <ul aria-label="Credit ledger" className="mt-3 divide-y divide-clay-line">
          {p.credits.ledger.map((e) => <li key={e.id} className="flex flex-wrap justify-between gap-2 py-2"><span><span className="font-semibold">{KIND[e.kind as keyof typeof KIND] ?? e.kind}</span> <span className="text-sm text-clay-muted">{when(e.at)}</span>{e.reason && <span className="block text-sm text-clay-muted">{e.reason}</span>}</span><span className="tabular font-semibold">{e.credits}{e.expiresOn ? <span className="block text-right text-sm font-normal text-clay-muted">expires {formatDate(e.expiresOn)}</span> : null}</span></li>)}
        </ul>
      )}
    </section>
  );
}

const RESULT = { allowed: "In", allowed_with_dues: "In, payment due", repeat_scan: "Repeat scan", override: "Override", denied: "Turned away" } as const;

export function Activity({ p }: { p: MemberProfileData }) {
  return (
    <>
      <section aria-labelledby="bk-title" className="clay p-4 sm:p-5">
        <h2 id="bk-title" className="text-lg font-bold">Training sessions</h2>
        {p.bookings.length === 0 ? <Empty>No sessions booked.</Empty> : <ul aria-label="Training sessions" className="mt-2 divide-y divide-clay-line">{p.bookings.map((b) => <li key={b.id} className="flex items-center justify-between gap-2 py-2"><span>{when(b.startsAt)}<span className="block text-sm text-clay-muted">{b.trainerName}, {b.branchName}</span></span><BookingStatusPill status={b.status} /></li>)}</ul>}
      </section>
      <section aria-labelledby="ci-title" className="clay p-4 sm:p-5">
        <h2 id="ci-title" className="text-lg font-bold">Check-ins</h2>
        {p.checkIns.length === 0 ? <Empty>No check-ins yet.</Empty> : <ul aria-label="Check-ins" className="mt-2 divide-y divide-clay-line">{p.checkIns.map((k) => <li key={k.id} className="flex items-center justify-between gap-2 py-2"><span>{when(k.at)}<span className="block text-sm text-clay-muted">{k.branchName}, {k.method === "qr" ? "scanned" : "at the desk"}{k.note ? `, ${k.note}` : ""}</span></span><span className="text-sm font-semibold">{RESULT[k.result]}</span></li>)}</ul>}
      </section>
    </>
  );
}

export function Trainer({ p, canAssign, change }: { p: MemberProfileData; canAssign: boolean; change: () => void }) {
  return (
    <section aria-labelledby="tr-title" className="clay p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2"><h2 id="tr-title" className="text-lg font-bold">Trainer</h2>{canAssign && <Button3D size="md" variant="ember" onClick={change}>Change trainer</Button3D>}</div>
      {p.trainer.current ? <p className="mt-2 text-lg"><span className="font-bold">{p.trainer.current.name}</span>, since {formatDate(p.trainer.current.from)}</p> : <Empty>No trainer yet.</Empty>}
      {p.trainer.history.length > 0 && (
        <>
          <h3 className="mt-4 font-bold">History</h3>
          <ul aria-label="Trainer history" className="mt-1 divide-y divide-clay-line">{p.trainer.history.map((h, i) => <li key={i} className="py-2"><span className="font-semibold">{h.name}</span>, {formatDate(h.from)}{h.to ? ` to ${formatDate(h.to)}` : " until now"}<span className="block text-sm text-clay-muted">Assigned by {h.by}{h.reason ? `: ${h.reason}` : ""}</span></li>)}</ul>
        </>
      )}
      <p className="mt-3 text-sm text-clay-muted">What each trainer wrote keeps its author when the trainer changes. The desk never sees assessments, photos or trainers’ private notes.</p>
    </section>
  );
}

export function Messages({ p }: { p: MemberProfileData }) {
  return (
    <section aria-labelledby="ms-title" className="clay p-4 sm:p-5">
      <h2 id="ms-title" className="text-lg font-bold">Messages</h2>
      {p.emails.length === 0 ? <Empty>No emails have been sent.</Empty> : <ul aria-label="Emails sent" className="mt-2 divide-y divide-clay-line">{p.emails.map((e) => <li key={e.id} className="py-2"><span className="font-semibold">{e.subject}</span><span className="block text-sm text-clay-muted">{when(e.at)}, {e.status === "sent" ? `sent to ${e.to}` : "not sent: no email address"}</span></li>)}</ul>}
      <p className="mt-3 text-sm text-clay-muted"><Link to="/desk/dues" className="underline underline-offset-4">Payment reminders</Link> are sent from Dues.</p>
    </section>
  );
}
