import { useState } from "react";
import { LifeBuoy } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { useAdminActions, useSupport } from "@/api/adminHooks";
import type { SupportRow } from "@/api/platform";
import { isApiError } from "@/api/errors";
import { writeGym } from "@/app/gymCache";
import { ADMIN_SESSION_KEY, SESSION_KEY, writeSession } from "@/app/session";
import { Button3D } from "@/design/Button3D";
import { Choice } from "@/design/Choice";
import { Field, inputClass } from "@/design/Field";
import { QueryBoundary } from "@/design/QueryBoundary";
import { SkeletonRows } from "@/design/Skeleton";
import { EmptyState } from "@/design/States";
import { useToast } from "@/design/Toast";
import { istDateOf } from "@/domain/dates";
import { SUPPORT_MIN_REASON, SUPPORT_MINUTES, validateSupportRequest } from "@/domain/platform";
import { formatDate, formatTime } from "@/lib/when";

/**
 * Support access (R01, S05): the only way in to a gym’s records. Ask with a reason and a time; everyone in that gym is told while it lasts, it is read-only, it ends on its own, and every screen opened
 * is a line in the gym’s audit log, which its owner can read. This page is for administrators; a gym never sees it.
 */
export default function Support() {
  const query = useSupport();
  return (
    <div className="max-w-5xl space-y-5">
      <QueryBoundary query={query} errorTitle="We couldn’t load support access" skeleton={<><h1 className="text-[1.7rem] font-bold tracking-tight lg:text-4xl">Support access</h1><SkeletonRows rows={5} /></>}>{(v) => <Loaded v={v} />}</QueryBoundary>
    </div>
  );
}

function Loaded({ v }: { v: { sessions: SupportRow[]; tenants: Array<{ id: string; name: string }>; log: Array<{ id: string; at: string; label: string; actor: string }> } }) {
  const [params] = useSearchParams();
  const { requestSupport, endSupport, enterSupport } = useAdminActions();
  const toast = useToast();
  const [tenantId, setTenantId] = useState(v.tenants.some((t) => t.id === params.get("tenant")) ? params.get("tenant")! : "");
  const [reason, setReason] = useState("");
  const [minutes, setMinutes] = useState<number>(30);
  const [tried, setTried] = useState(false);
  const [failure, setFailure] = useState<string>();
  const [key, setKey] = useState(() => `support-${crypto.randomUUID()}`);
  const errors = validateSupportRequest({ tenantId, reason, minutes });
  const active = v.sessions.filter((s) => s.active && s.mine);
  const submit = async () => {
    setTried(true); setFailure(undefined);
    if (Object.keys(errors).length) return;
    try { const s = await requestSupport.mutateAsync({ key, tenantId, reason, minutes }); toast({ title: "Support access started", description: `Everyone in ${v.tenants.find((t) => t.id === s.tenantId)?.name} can see it. It ends at ${formatTime(s.expiresAt)}.`, tone: "success" }); setReason(""); setTried(false); setKey(`support-${crypto.randomUUID()}`); }
    catch (e) { setFailure(isApiError(e) ? e.message : "We couldn’t start support access. Try again."); }
  };
  const open = async (s: SupportRow) => {
    try {
      const inside = await enterSupport.mutateAsync({ sessionId: s.id });
      try { const own = localStorage.getItem(SESSION_KEY); if (own) localStorage.setItem(ADMIN_SESSION_KEY, own); } catch { /* the admin signs in again after support */ }
      writeSession(inside);
      writeGym({ tenantId: s.tenantId, name: s.tenantName });
      window.location.assign("/owner");
    } catch (e) { toast({ title: "Not opened", description: isApiError(e) ? e.message : "Try again.", tone: "error" }); }
  };
  return (
    <>
      <header>
        <h1 className="text-[1.7rem] font-bold tracking-tight lg:text-4xl">Support access</h1>
        <p className="max-w-[70ch] text-clay-muted">Ember has no access to a gym’s records unless you ask for it here. Access is read-only, for a time you choose, and shown to everyone in the gym while it lasts. Every screen you open is written to the gym’s audit log, where its owner reads it.</p>
      </header>

      {active.length > 0 && (
        <section aria-labelledby="act-t" className="clay space-y-3 p-4 sm:p-5">
          <h2 id="act-t" className="text-lg font-bold">Your access right now</h2>
          <ul aria-label="Active support access" className="space-y-3">
            {active.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-lilac-100 p-3 text-lilac-700">
                <span className="min-w-0"><span className="font-bold">{s.tenantName}</span> until {formatTime(s.expiresAt)}<span className="block text-sm">“{s.reason}”</span></span>
                <span className="flex gap-2"><Button3D variant="ember" size="md" disabled={enterSupport.isPending} onClick={() => void open(s)} aria-label={`Open ${s.tenantName}`}>Open the gym</Button3D><Button3D variant="white" size="md" disabled={endSupport.isPending} onClick={() => void endSupport.mutateAsync({ sessionId: s.id }).then(() => toast({ title: "Support access ended", description: "The gym’s owner can see it in their audit log.", tone: "success" }))} aria-label={`End access to ${s.tenantName}`}>End now</Button3D></span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <form onSubmit={(e) => { e.preventDefault(); void submit(); }} noValidate aria-label="Ask for support access" className="clay space-y-4 p-4 sm:p-5">
        <h2 className="text-lg font-bold">Ask for access</h2>
        <Field label="Gym" htmlFor="sp-gym" error={tried ? errors.tenantId : undefined}><select id="sp-gym" value={tenantId} onChange={(e) => setTenantId(e.target.value)} className={inputClass} aria-invalid={tried && errors.tenantId ? true : undefined}><option value="">Choose a gym</option>{v.tenants.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></Field>
        <Field label="Why you need access" htmlFor="sp-reason" hint={`At least ${SUPPORT_MIN_REASON} characters. The gym’s owner reads this.`} error={tried ? errors.reason : undefined}><textarea id="sp-reason" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} className={`${inputClass} py-2`} aria-invalid={tried && errors.reason ? true : undefined} aria-describedby={tried && errors.reason ? "sp-reason-error" : undefined} /></Field>
        <fieldset><legend className="text-sm font-semibold">For how long</legend><div className="mt-1 grid gap-2 sm:grid-cols-4">{SUPPORT_MINUTES.map((m) => <Choice key={m} type="radio" name="sp-minutes" checked={minutes === m} onChange={() => setMinutes(m)} label={`${m} minutes`} />)}</div></fieldset>
        {failure && <p role="alert" className="rounded-2xl bg-status-danger-bg px-4 py-3 text-sm font-semibold text-status-danger-fg">{failure}</p>}
        <Button3D type="submit" variant="ember" size="md" disabled={requestSupport.isPending}>{requestSupport.isPending ? "Starting…" : "Start support access"}</Button3D>
      </form>

      <section aria-labelledby="his-t" className="clay space-y-2 p-4 sm:p-5">
        <h2 id="his-t" className="text-lg font-bold">Every session</h2>
        {v.sessions.length === 0 ? <EmptyState icon={LifeBuoy} title="No support access yet">When you ask for access to a gym, the session is listed here with who, why and for how long.</EmptyState> : (
          <ul aria-label="Support sessions" className="divide-y divide-clay-line">
            {v.sessions.map((s) => <li key={s.id} className="py-3 text-[0.95rem]"><span className="font-semibold">{s.tenantName}</span>, {s.minutes} minutes from {formatTime(s.startedAt)} on {formatDate(istDateOf(s.startedAt))}<span className="block text-clay-muted">“{s.reason}”. {s.endedAt ? (s.endedBy === "time" ? "Ended by itself when the time ran out." : "Ended early.") : `Active until ${formatTime(s.expiresAt)}.`}</span></li>)}
          </ul>
        )}
      </section>

      <section aria-labelledby="log-t" className="clay space-y-2 p-4 sm:p-5">
        <h2 id="log-t" className="text-lg font-bold">Platform log</h2>
        <p className="text-sm text-clay-muted">What administrators have done to accounts, newest first. Each change to one gym is also in that gym’s own audit log.</p>
        <ol aria-label="Platform log" className="divide-y divide-clay-line text-[0.95rem]">{v.log.map((e) => <li key={e.id} className="flex flex-wrap justify-between gap-2 py-2"><span>{e.label}</span><span className="text-clay-muted">{e.actor}, {formatDate(istDateOf(e.at))} {formatTime(e.at)}</span></li>)}{v.log.length === 0 && <li className="py-2 text-clay-muted">Nothing yet.</li>}</ol>
      </section>
    </>
  );
}
