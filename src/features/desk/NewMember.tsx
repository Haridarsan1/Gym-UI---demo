import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Check, Printer } from "lucide-react";
import { useMe } from "@/api/hooks";
import { useDuplicates, useRegisterMember, useWizardOptions } from "@/api/deskMoreHooks";
import type { RegisterResult } from "@/api/newMember";
import { isApiError } from "@/api/errors";
import { useSession } from "@/app/SessionContext";
import { Button3D, Button3DLink } from "@/design/Button3D";
import { QueryBoundary } from "@/design/QueryBoundary";
import { SkeletonCard } from "@/design/Skeleton";
import { useBranch } from "@/design/shells/BranchContext";
import { QrCode } from "@/features/member/pass/QrCode";
import { clearDraft, newKey, readDraft, rupeesToPaise, saveDraft, STEPS, type Draft } from "@/features/desk/newmember/draft";
import { ConsentStep, DetailsStep, PaymentStep, PlanStep, Summary, TrainerStep } from "@/features/desk/newmember/Steps";
import { formatDate, formatRupees } from "@/lib/when";
import { cn } from "@/lib/format";

const digits = (s: string) => s.replace(/\D/g, "").slice(-10);

/**
 * New member (T01, M01, M03, O03): details with a duplicate check, consent, plan, trainer, then the invoice and first payment, and the
 * member’s pass. The draft is kept in the tab; one key makes one member however many times the last button is pressed. On a phone the
 * Back and Next buttons stay in reach above the navigation bar.
 */
export default function NewMember() {
  const me = useMe();
  const { branchId: chosen } = useBranch();
  const branches = me.data?.branches ?? [];
  const [local, setLocal] = useState<string>();
  const branchId = chosen !== "all" ? chosen : (local ?? branches[0]?.id);
  const options = useWizardOptions(branchId);
  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-[1.7rem] font-bold tracking-tight lg:text-4xl">New member</h1>
        {chosen === "all" && branches.length > 1 && (
          <label className="flex items-center gap-2 text-sm font-semibold">Branch
            <select value={branchId} onChange={(e) => setLocal(e.target.value)} className="h-11 rounded-xl border border-clay-line bg-white px-3">{branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select>
          </label>
        )}
      </header>
      <QueryBoundary query={options} errorTitle="We couldn’t open the registration form" skeleton={<SkeletonCard label="Loading registration" />}>
        {(o) => <Wizard key={o.branchId} o={o} />}
      </QueryBoundary>
    </div>
  );
}

function Wizard({ o }: { o: NonNullable<ReturnType<typeof useWizardOptions>["data"]> }) {
  const { session } = useSession();
  const userId = session?.userId ?? "";
  const [d, setD] = useState<Draft>(() => readDraft(userId, o.today));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string>();
  const [result, setResult] = useState<RegisterResult | null>(null);
  const register = useRegisterMember();
  const set = useCallback((patch: Partial<Draft>) => setD((x) => ({ ...x, ...patch })), []);
  useEffect(() => saveDraft(userId, d), [userId, d]);

  const phone = digits(d.details.phone);
  const dupQuery = useMemo(() => ({ name: d.details.name, phone: d.details.phone, email: d.details.email || undefined, dateOfBirth: d.details.dateOfBirth || undefined }), [d.details.name, d.details.phone, d.details.email, d.details.dateOfBirth]);
  const dup = useDuplicates(dupQuery, d.step === 0 && (phone.length === 10 || d.details.name.trim().length >= 3));
  const plan = o.plans.find((p) => p.id === d.planId);

  const validate = (step: number): Record<string, string> => {
    const e: Record<string, string> = {};
    if (step === 0) {
      const v = d.details;
      if (v.name.trim().length < 2) e.name = "Enter the member’s name.";
      if (!/^[6-9]\d{9}$/.test(phone)) e.phone = "Enter a 10-digit mobile number.";
      if (v.email.trim() && !/^\S+@\S+\.\S+$/.test(v.email.trim())) e.email = "Enter an email like name@example.in, or leave it empty.";
      if (v.emergencyPhone.trim() && !/^[6-9]\d{9}$/.test(digits(v.emergencyPhone))) e.emergencyPhone = "Enter a 10-digit mobile number, or leave it empty.";
      if (!e.name && !e.phone && !e.email && dup.data?.sharing.length && !dup.data.sharing.every((m) => d.sharesWith.includes(m.memberId))) e.phone = "Choose: the same person (open their profile), or a different person sharing this number.";
      if (!e.name && !e.phone && !e.email && dup.data?.warnings.length && !d.notADuplicate) e.name = "Check it is a different person, then continue.";
    }
    if (step === 2 && !d.planId) e.plan = "Choose a plan.";
    if (step === 4 && plan) {
      const disc = rupeesToPaise(d.discount);
      const max = Math.floor((plan.pricePaise * o.maxDiscountBp) / 10000);
      if (disc === undefined) e.discount = "Enter the discount in rupees, like 250.";
      else if (disc > max) e.discount = `You can give up to ${formatRupees(max)}. Ask a manager for more.`;
      const total = plan.totalPaise - Math.round(((disc ?? 0) * (10000 + plan.taxRateBp)) / 10000);
      if (d.payNow && total > 0) {
        const paid = rupeesToPaise(d.amount === "" ? String(total / 100) : d.amount);
        if (paid === undefined || paid <= 0) e.amount = "Enter the amount received in rupees.";
        else if (paid > total) e.amount = `That is more than the ${formatRupees(total)} due.`;
        else if (paid < total && !o.partialPaymentsEnabled) e.amount = `This gym takes the full ${formatRupees(total)} at once.`;
      }
    }
    return e;
  };

  const next = () => {
    const e = validate(d.step);
    setErrors(e);
    setFormError(e.plan);
    if (Object.keys(e).length === 0) set({ step: d.step + 1 });
  };
  const back = () => { setErrors({}); setFormError(undefined); set({ step: Math.max(0, d.step - 1) }); };

  const submit = async () => {
    const e = validate(4);
    setErrors(e);
    if (Object.keys(e).length) return;
    setFormError(undefined);
    const disc = rupeesToPaise(d.discount) ?? 0;
    const total = plan!.totalPaise - Math.round((disc * (10000 + plan!.taxRateBp)) / 10000);
    const v = d.details;
    try {
      const r = await register.mutateAsync({
        key: d.key, branchId: o.branchId, notADuplicate: d.notADuplicate, sharesContactWith: d.sharesWith.length ? d.sharesWith : undefined,
        member: { name: v.name, phone: v.phone, email: v.email, dateOfBirth: v.dateOfBirth, gender: (v.gender || undefined) as never, leadSource: v.leadSource || undefined, emergencyContact: v.emergencyName.trim() && v.emergencyPhone.trim() ? { name: v.emergencyName, phone: v.emergencyPhone } : undefined },
        consents: { ...d.consents, dataProcessing: true }, planId: d.planId, startsOn: d.startsOn, discountPaise: disc || undefined,
        trainer: d.trainerId ? { trainerId: d.trainerId, effectiveOn: d.trainerOn } : undefined,
        payment: d.payNow && total > 0 ? { method: d.method, amountPaise: rupeesToPaise(d.amount === "" ? String(total / 100) : d.amount)!, reference: d.reference || undefined } : undefined,
      });
      clearDraft(userId);
      setResult(r);
    } catch (err) {
      setFormError(isApiError(err) ? err.message : "We couldn’t register the member. Nothing was saved. Try again.");
    }
  };

  const startOver = () => { clearDraft(userId); setResult(null); setErrors({}); setFormError(undefined); setD({ ...readDraft("", o.today), key: newKey() }); };
  if (result) return <Done r={result} onAnother={startOver} />;

  const last = d.step === STEPS.length - 1;
  const heading = STEPS[d.step]!;
  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_18rem]">
      <div className="min-w-0 space-y-4">
        <nav aria-label="Steps">
          <ol className="flex gap-2 overflow-x-auto pb-1">
            {STEPS.map((s, i) => (
              <li key={s} aria-current={i === d.step ? "step" : undefined} className={cn("flex min-h-[2.75rem] shrink-0 items-center gap-2 rounded-full px-4 text-sm font-semibold", i === d.step ? "bg-clay-ink text-white" : i < d.step ? "bg-mint-300 text-[#06301f]" : "bg-clay-lavender")}>
                {i < d.step ? <Check className="h-4 w-4" aria-hidden="true" /> : <span aria-hidden="true">{i + 1}</span>}{s}
              </li>
            ))}
          </ol>
        </nav>
        <section aria-labelledby="step-title" className="clay p-4 sm:p-6">
          <h2 id="step-title" className="mb-4 text-xl font-bold">Step {d.step + 1} of {STEPS.length}: {heading}</h2>
          {d.step === 0 && <DetailsStep d={d} set={set} dup={dup.data} errors={errors} />}
          {d.step === 1 && <ConsentStep d={d} set={set} notice={o.noticeVersion} />}
          {d.step === 2 && <PlanStep d={d} set={set} o={o} />}
          {d.step === 3 && <TrainerStep d={d} set={set} o={o} />}
          {d.step === 4 && <PaymentStep d={d} set={set} o={o} errors={errors} />}
          {formError && <p role="alert" className="mt-4 rounded-2xl bg-status-danger-bg px-4 py-3 font-semibold text-status-danger-fg">{formError}</p>}
        </section>
        {/* On a phone this bar stays above the navigation bar; from 640 px it is an ordinary row. */}
        <div className="sticky bottom-[5.25rem] z-30 flex flex-wrap items-center gap-3 rounded-2xl bg-clay-canvas/95 py-2 backdrop-blur sm:static sm:bg-transparent sm:backdrop-blur-none">
          {d.step > 0 && <Button3D variant="white" size="lg" onClick={back}>Back</Button3D>}
          {last ? <Button3D variant="ember" size="lg" className="flex-1 sm:flex-none" disabled={register.isPending} onClick={() => void submit()}>{register.isPending ? "Registering…" : "Register member"}</Button3D> : <Button3D variant="ember" size="lg" className="flex-1 sm:flex-none" onClick={next}>Next</Button3D>}
          <button type="button" onClick={startOver} className="min-h-[2.75rem] cursor-pointer px-2 font-semibold text-clay-muted underline underline-offset-4">Start over</button>
        </div>
      </div>
      <div className="hidden xl:block"><div className="sticky top-6"><Summary d={d} o={o} /></div></div>
    </div>
  );
}

/** The member is registered: the pass to show or print, what was paid, and what to do next. */
function Done({ r, onAnother }: { r: RegisterResult; onAnother: () => void }) {
  const status = r.membership.status;
  return (
    <section aria-labelledby="done-title" className="space-y-4">
      <div className="clay border-2 border-mint-300 p-5 sm:p-7">
        <p className="flex items-center gap-2 font-semibold text-status-active-fg"><Check className="h-5 w-5" aria-hidden="true" />Registered</p>
        <h2 id="done-title" className="mt-1 text-3xl font-extrabold tracking-tight">{r.name} is a member</h2>
        <p className="mt-1 text-lg">{r.membership.planName}: {status === "active" ? `active until ${formatDate(r.membership.endsOn!)}` : status === "scheduled" ? `starts ${formatDate(r.membership.startsOn)}` : "starts once the first payment is made"}</p>
        {r.trainer && <p className="text-clay-muted">Trainer: {r.trainer.name}, from {formatDate(r.trainer.effectiveOn)}</p>}
        {r.invoice && <p className="mt-2">Invoice <span className="font-semibold">{r.invoice.number}</span>, {formatRupees(r.invoice.totalPaise)}{r.invoice.duePaise > 0 ? `, ${formatRupees(r.invoice.duePaise)} still due` : ", paid"}{r.payment?.receiptNumber ? `. Receipt ${r.payment.receiptNumber}` : ""}</p>}
        {r.membership.status === "pending" && <p className="mt-2 rounded-2xl bg-status-pending-bg p-3 font-semibold text-status-pending-fg">Their pass won’t open the door until the invoice is paid.</p>}
      </div>
      <div className="clay grid gap-5 p-5 sm:grid-cols-[14rem_minmax(0,1fr)] sm:p-7 print:block">
        <div className="w-56 max-w-full rounded-2xl bg-white p-2"><QrCode value={r.qrToken} label={`Pass for ${r.name}`} className="h-auto w-full" /></div>
        <div>
          <h3 className="text-lg font-bold">Their pass</h3>
          <p className="mt-1">Pass code <span className="font-mono text-lg font-bold tracking-wide">{r.passCode}</span></p>
          <p className="mt-2 text-clay-muted">{r.emailedTo ? `The pass${r.payment ? " and receipt" : ""} were emailed to ${r.emailedTo}.` : `There is no email address, so print the pass or show this code. Nothing was emailed.`}</p>
          <div className="print-hide mt-3"><Button3D variant="white" onClick={() => window.print()}><Printer className="h-4 w-4" aria-hidden="true" />Print the pass</Button3D></div>
        </div>
      </div>
      <div className="print-hide flex flex-wrap gap-3">
        <Button3DLink to={`/desk/members/${r.memberId}`} size="lg" variant="ember">Open profile</Button3DLink>
        <Button3DLink to="/desk" size="lg" variant="white">Back to check-in</Button3DLink>
        <Button3D size="lg" variant="white" onClick={onAnother}>Register another member</Button3D>
        {r.invoice && r.invoice.duePaise > 0 && <Link to={`/desk/members/${r.memberId}`} className="inline-flex min-h-[3rem] items-center font-semibold underline underline-offset-4">Collect the payment</Link>}
      </div>
    </section>
  );
}
