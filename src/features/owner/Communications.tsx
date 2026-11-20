import { useState } from "react";
import { Mail, Send } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { useCommsActions, useCommunications } from "@/api/ownerHooks";
import type { AudienceView, CommunicationsView, LogRow, TemplateView } from "@/api/communications";
import { isApiError } from "@/api/errors";
import { Button3D } from "@/design/Button3D";
import { QueryBoundary } from "@/design/QueryBoundary";
import { Sheet } from "@/design/Sheet";
import { SkeletonRows } from "@/design/Skeleton";
import { EmptyState } from "@/design/States";
import { Switch } from "@/design/Switch";
import { ResponsiveTable, type Column } from "@/design/layout/ResponsiveTable";
import { useBranch } from "@/design/shells/BranchContext";
import { useToast } from "@/design/Toast";
import { istDateOf } from "@/domain/dates";
import { cn } from "@/lib/format";
import { formatDate, formatTime } from "@/lib/when";
import { DEMO_MODE } from "@/app/mode";
import { TemplateEditor } from "@/features/owner/comms/TemplateEditor";

const STATUSES = [{ id: "all", label: "All" }, { id: "failed", label: "Failed" }, { id: "skipped", label: "Not sent" }, { id: "sent", label: "Sent" }] as const;
const PAGE = 25;

/** Email status as a pill: sent is green, not sent is grey (it was never going to go), failed is the one that needs someone. */
function MailPill({ s }: { s: LogRow["status"] }) {
  const p = { sent: ["Sent", "bg-status-active-bg text-status-active-fg"], skipped: ["Not sent", "bg-status-expired-bg text-status-expired-fg"], failed: ["Failed", "bg-status-danger-bg text-status-danger-fg"] }[s];
  return <span className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold", p[1])}>{p[0]}</span>;
}

/**
 * Communications (O04), email only: the delivery log with status and retry, a send to a group (renewals, a quiet spell, offers) that respects each member’s preferences and consent, the gym’s own
 * wording for the emails it writes with a preview, and, in the demo, a switch that makes the mail server refuse mail so failures and retries can be seen.
 */
export default function Communications() {
  const { branchId } = useBranch();
  const [params] = useSearchParams();
  const status = STATUSES.find((s) => s.id === params.get("status"))?.id;
  const [limit, setLimit] = useState(PAGE);
  const q = { branchId: branchId === "all" ? undefined : branchId, status: status && status !== "all" ? status : undefined, template: params.get("template") ?? undefined, limit };
  const query = useCommunications(q);
  return (
    <div className="max-w-6xl space-y-5">
      <QueryBoundary query={query} errorTitle="We couldn’t load the communications" skeleton={<><h1 className="text-[1.7rem] font-bold tracking-tight lg:text-4xl">Communications</h1><SkeletonRows rows={6} /></>}>
        {(v) => <Loaded v={v} q={q} more={() => setLimit((n) => n + PAGE)} />}
      </QueryBoundary>
    </div>
  );
}

function Loaded({ v, q, more }: { v: CommunicationsView; q: { branchId?: string; status?: string; template?: string }; more: () => void }) {
  const [params, setParams] = useSearchParams();
  const { send, retry, retryAll, failure } = useCommsActions();
  const toast = useToast();
  const [group, setGroup] = useState<AudienceView | null>(null);
  const [template, setTemplate] = useState<TemplateView | null>(null);
  const [row, setRow] = useState<LogRow | null>(null);
  const [error, setError] = useState<string>();
  const set = (patch: Record<string, string | null>) => { const n = new URLSearchParams(params); for (const [k, val] of Object.entries(patch)) (val ? n.set(k, val) : n.delete(k)); setParams(n, { replace: true }); };
  const status = q.status ?? "all";
  const doRetry = async (r: LogRow) => {
    try {
      const res = await retry.mutateAsync({ id: r.id });
      toast({ title: res.result === "sent" ? "Sent on retry" : "Failed again", description: res.result === "sent" ? `${r.name}’s email went on try ${res.attempts}.` : `Try ${res.attempts}. The mail server still didn’t accept it.`, tone: res.result === "sent" ? "success" : "error" });
      setRow(null);
    } catch (e) { toast({ title: "Not retried", description: isApiError(e) ? e.message : "Try again.", tone: "error" }); }
  };
  const doSend = async () => {
    if (!group) return;
    setError(undefined);
    try {
      const r = await send.mutateAsync({ audience: group.id, key: `send-${crypto.randomUUID()}`, branchId: q.branchId });
      toast({ title: "Emails sent", description: `${r.reached} sent${r.failed ? `, ${r.failed} failed (retry them below)` : ""}${r.noEmail + r.optedOut + r.noConsent ? `, ${r.noEmail + r.optedOut + r.noConsent} not sent` : ""}.`, tone: r.failed ? "error" : "success" });
      setGroup(null);
    } catch (e) { setError(isApiError(e) ? e.message : "We couldn’t send. Try again."); }
  };
  const columns: Array<Column<LogRow>> = [
    { key: "at", header: "When", hideOnPhone: true, cell: (r) => <span className="whitespace-nowrap">{formatDate(istDateOf(r.at))}<span className="block text-sm text-clay-muted">{formatTime(r.at)}</span></span> },
    { key: "to", header: "To", primary: true, cell: (r) => <span><span className="font-semibold">{r.name}</span><span className="block text-sm font-normal text-clay-muted">{r.to ?? "No address"}</span></span> },
    { key: "what", header: "Email", cell: (r) => <span>{r.template}<span className="block text-sm text-clay-muted">{r.subject}</span></span> },
    { key: "status", header: "Status", cell: (r) => <span><MailPill s={r.status} />{r.detail && <span className="mt-1 block max-w-[28ch] text-sm text-clay-muted">{r.detail}</span>}{r.attempts > 1 && <span className="block text-sm text-clay-muted">{r.attempts} tries</span>}</span> },
    { key: "act", header: "", action: true, cell: (r) => (r.canRetry ? <Button3D variant="white" size="md" disabled={retry.isPending} onClick={() => void doRetry(r)} aria-label={`Retry the email to ${r.name}`}>Retry</Button3D> : <Button3D variant="white" size="md" onClick={() => setRow(r)} aria-label={`Read the email to ${r.name}`}>Read</Button3D>) },
  ];
  return (
    <>
      <header>
        <h1 className="text-[1.7rem] font-bold tracking-tight lg:text-4xl">Communications</h1>
        <p className="max-w-[70ch] text-clay-muted">Email only. A message goes only to a member who can be reached and hasn’t turned that kind off; offers and news go only to members who agreed. Every one that doesn’t go says why.</p>
      </header>

      {DEMO_MODE && (
        <section aria-label="Demo control" className="clay p-4 sm:p-5">
          <Switch id="mail-fails" checked={v.emailFails} onChange={(on) => void failure.mutateAsync(on)} label="Demo: make the mail server refuse mail" description={v.emailFails ? "Every email now fails and is logged as Failed. Switch this off, then press Retry, to see them go." : "Switch this on, then send something, to see a failed email and its retry. Nothing is really sent in this demo."} disabled={failure.isPending} />
        </section>
      )}

      <section aria-labelledby="grp-title" className="space-y-3">
        <h2 id="grp-title" className="text-lg font-bold">Send to a group</h2>
        <ul aria-label="Groups" className="grid gap-3 md:grid-cols-3">
          {v.audiences.map((a) => (
            <li key={a.id} className="clay flex flex-col p-4">
              <h3 className="font-bold">{a.title}</h3>
              <p className="mt-1 text-[0.95rem] text-clay-muted">{a.total === 0 ? "No one is in this group right now." : `${a.total} ${a.total === 1 ? "member" : "members"}: ${a.willSend} can be sent it${a.noEmail ? `, ${a.noEmail} have no email` : ""}${a.optedOut ? `, ${a.optedOut} turned it off` : ""}${a.noConsent ? `, ${a.noConsent} haven’t agreed to offers` : ""}.`}</p>
              <div className="mt-auto pt-3"><Button3D variant="white" size="md" disabled={a.total === 0} onClick={() => { setError(undefined); setGroup(a); }}><Send className="h-4 w-4" aria-hidden="true" />Send to {a.willSend}</Button3D></div>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="tpl-title" className="space-y-3">
        <h2 id="tpl-title" className="text-lg font-bold">Wording</h2>
        <ul aria-label="Email wording" className="grid gap-3 md:grid-cols-2">
          {v.templates.map((t) => (
            <li key={t.id} className="clay flex items-start justify-between gap-3 p-4">
              <div className="min-w-0"><h3 className="font-bold">{t.title}{t.custom && <span className="ml-2 text-sm font-semibold text-ember-800">Edited</span>}</h3><p className="text-[0.95rem] text-clay-muted">{t.preview.subject}</p></div>
              <Button3D variant="white" size="md" onClick={() => setTemplate(t)} aria-label={`${v.canEditTemplates ? "Edit" : "Preview"} the ${t.title} email`}>{v.canEditTemplates ? "Edit" : "Preview"}</Button3D>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="log-title" className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 id="log-title" className="text-lg font-bold">Delivery log</h2>
          {v.failedRetryable > 0 && <Button3D variant="ember" size="md" disabled={retryAll.isPending} onClick={() => void retryAll.mutateAsync({ branchId: q.branchId }).then((r) => toast({ title: "Retried", description: `${r.sent} sent, ${r.failed} still failing.`, tone: r.failed ? "error" : "success" }))}>Retry all failed ({v.failedRetryable})</Button3D>}
        </div>
        <div role="group" aria-label="Show" className="flex flex-wrap gap-2">
          {STATUSES.map((s) => <button key={s.id} type="button" aria-pressed={status === s.id} onClick={() => set({ status: s.id === "all" ? null : s.id })} className={cn("min-h-[2.75rem] cursor-pointer rounded-full border border-clay-line px-4 text-sm font-semibold", status === s.id ? "bg-clay-ink text-white" : "bg-white hover:bg-clay-canvas")}>{s.label}<span className="ml-1.5 tabular font-normal">{v.counts[s.id as keyof typeof v.counts]}</span></button>)}
        </div>
        {v.rows.length === 0 ? <EmptyState icon={Mail} title={v.counts.all === 0 ? "No emails yet" : "Nothing matches"}>{v.counts.all === 0 ? "Emails the gym sends, such as receipts, reminders and invitations, are listed here with whether they went." : "No email has this status. Choose All to see every one."}</EmptyState> : (
          <>
            <ResponsiveTable rows={v.rows} columns={columns} rowKey={(r) => r.id} caption="Delivery log" onRowClick={(r) => setRow(r)} />
            {v.matching > v.rows.length && <div><Button3D variant="white" size="md" onClick={more}>Show more ({v.matching - v.rows.length} left)</Button3D></div>}
          </>
        )}
      </section>

      <Sheet open={!!group} onClose={() => setGroup(null)} label="Send to a group" kind="confirm">
        {group && (
          <div className="space-y-3 p-5">
            <h2 className="text-xl font-bold">Send “{v.templates.find((t) => t.id === group.template)?.title}”?</h2>
            <p>It goes to {group.willSend} {group.willSend === 1 ? "member" : "members"}.{group.total - group.willSend > 0 ? ` The other ${group.total - group.willSend} are listed in the log as not sent, each with the reason.` : ""} Sending is written to the audit log.</p>
            <p className="rounded-2xl bg-clay-canvas p-3 text-[0.95rem]"><span className="font-semibold">{v.templates.find((t) => t.id === group.template)?.preview.subject}</span></p>
            {error && <p role="alert" className="rounded-2xl bg-status-danger-bg px-4 py-3 text-sm font-semibold text-status-danger-fg">{error}</p>}
            <div className="flex flex-wrap gap-3"><Button3D variant="ember" size="md" disabled={send.isPending || group.willSend === 0} onClick={() => void doSend()}>{send.isPending ? "Sending…" : `Send to ${group.willSend}`}</Button3D><Button3D variant="white" size="md" onClick={() => setGroup(null)}>Cancel</Button3D></div>
          </div>
        )}
      </Sheet>
      <Sheet open={!!template} onClose={() => setTemplate(null)} label={template ? `Email: ${template.title}` : "Email"}>{template && <TemplateEditor key={template.id} t={template} canEdit={v.canEditTemplates} onClose={() => setTemplate(null)} />}</Sheet>
      <Sheet open={!!row} onClose={() => setRow(null)} label="Email">
        {row && (
          <div className="space-y-3 p-5">
            <div className="flex items-center justify-between gap-3"><h2 className="text-xl font-bold">{row.template}</h2><MailPill s={row.status} /></div>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-[0.95rem]"><dt className="text-clay-muted">To</dt><dd>{row.name}{row.to ? `, ${row.to}` : ", no address"}</dd><dt className="text-clay-muted">When</dt><dd>{formatDate(istDateOf(row.at))}, {formatTime(row.at)}</dd>{row.detail && <><dt className="text-clay-muted">Note</dt><dd>{row.detail}</dd></>}<dt className="text-clay-muted">Tries</dt><dd>{row.attempts}</dd></dl>
            <p className="font-semibold">{row.subject}</p>
            <p className="max-w-[70ch] whitespace-pre-line rounded-2xl bg-clay-canvas p-3 text-[0.95rem]">{row.body}</p>
            <div className="flex flex-wrap gap-3">{row.canRetry && <Button3D variant="ember" size="md" onClick={() => void doRetry(row)} disabled={retry.isPending}>Retry</Button3D>}<Button3D variant="white" size="md" onClick={() => setRow(null)}>Close</Button3D></div>
          </div>
        )}
      </Sheet>
    </>
  );
}
