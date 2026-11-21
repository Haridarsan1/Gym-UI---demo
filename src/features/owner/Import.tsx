import { useRef, useState } from "react";
import { Check, Download, FileSpreadsheet, Upload } from "lucide-react";
import { useImportActions, useImports } from "@/api/ownerHooks";
import type { ImportListRow } from "@/api/memberImport";
import type { ImportPreview, ImportResult } from "@/api/memberImport";
import { isApiError } from "@/api/errors";
import { Button3D } from "@/design/Button3D";
import { Sheet } from "@/design/Sheet";
import { useToast } from "@/design/Toast";
import { ResponsiveTable, type Column } from "@/design/layout/ResponsiveTable";
import { COLUMNS, COLUMN_HELP, REQUIRED, TEMPLATE_CSV, type PreviewRow } from "@/domain/memberImport";
import { istDateOf } from "@/domain/dates";
import { cn } from "@/lib/format";
import { formatDate } from "@/lib/when";

const newKey = () => `import-${crypto.randomUUID()}`;

/** A tick whose whole 44 px square is the target. */
function Tick({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <label className={cn("relative inline-flex min-h-[2.75rem] min-w-[2.75rem] items-center justify-center gap-2 px-2", disabled ? "opacity-40" : "cursor-pointer")}>
      <input type="checkbox" aria-label={label} checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} className="absolute inset-0 h-full w-full cursor-[inherit] opacity-0" />
      <span aria-hidden="true" className={cn("grid h-6 w-6 place-items-center rounded-md border-2", checked ? "border-ember-600 bg-ember-650 text-white" : "border-clay-subtle bg-white")}>{checked && <Check className="h-4 w-4" strokeWidth={3} />}</span>
      <span aria-hidden="true" className="text-sm font-semibold sm:hidden">{disabled ? "Can’t be imported" : "Import this row"}</span>
    </label>
  );
}

/** Who has joined the app, who has been invited and who hasn’t, for each import, with a button that invites the rest. Invitations go through the delivery log, so a failed one can be retried there. */
function RecentImports() {
  const list = useImports();
  const { invite } = useImportActions();
  const toast = useToast();
  if (!list.data || list.data.length === 0) return null;
  const send = async (r: ImportListRow) => {
    try {
      const res = await invite.mutateAsync({ memberIds: r.memberIds, key: `invite-${crypto.randomUUID()}` });
      toast({ title: "Invitations sent", description: `${res.sent} sent${res.failed ? `, ${res.failed} failed (retry them in Communications)` : ""}${res.skipped.length ? `, ${res.skipped.length} not sent: ${[...new Set(res.skipped.map((s) => s.reason.split(".")[0]))].slice(0, 2).join("; ")}` : ""}.`, tone: res.failed ? "error" : "success" });
    } catch (e) { toast({ title: "Not sent", description: isApiError(e) ? e.message : "Try again.", tone: "error" }); }
  };
  return (
    <section aria-labelledby="imp-recent" className="clay space-y-3 p-4 sm:p-5">
      <h2 id="imp-recent" className="text-lg font-bold">Imports and the app</h2>
      <p className="text-[0.95rem] text-clay-muted">An imported member has no login yet. Send them an invitation by email: they follow the link and choose phone and a code, or email and a password. A member without an email address can’t be invited.</p>
      <ul aria-label="Imports" className="divide-y divide-clay-line">
        {list.data.map((r) => (
          <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
            <div className="min-w-0"><p className="font-semibold">{r.fileName ?? "Import"} <span className="font-normal text-clay-muted">{formatDate(istDateOf(r.at))}, {r.created} {r.created === 1 ? "member" : "members"}</span></p><p className="text-sm text-clay-muted"><strong className="text-clay-ink">{r.joined}</strong> joined, <strong className="text-clay-ink">{r.invited}</strong> invited, <strong className="text-clay-ink">{r.notInvited}</strong> not invited{r.notInvited > r.canInvite ? ` (${r.notInvited - r.canInvite} have no email)` : ""}</p></div>
            <Button3D variant="white" size="md" disabled={r.canInvite === 0 || invite.isPending} onClick={() => void send(r)}>Send app invites ({r.canInvite})</Button3D>
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * Import members (S01), owner only: the template, a file (or pasted text), a check that writes nothing and says what would happen to every row, a tick on each row to leave it out, and the
 * import. A number another member already has is not an error: the row is imported as a separate member who shares it, flagged, and can be unticked. Sending the same import twice adds nobody twice.
 */
export default function Import() {
  const { preview, run } = useImportActions();
  const toast = useToast();
  const [csv, setCsv] = useState("");
  const [fileName, setFileName] = useState<string>();
  const [data, setData] = useState<ImportPreview>();
  const [leaveOut, setLeaveOut] = useState<Set<number>>(new Set());
  const [problemsOnly, setProblemsOnly] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [error, setError] = useState<string>();
  const [result, setResult] = useState<ImportResult>();
  const key = useRef(newKey());
  const file = useRef<HTMLInputElement>(null);

  const download = () => {
    const url = URL.createObjectURL(new Blob([TEMPLATE_CSV], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url; a.download = "ember-members-template.csv"; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const reset = () => { setCsv(""); setFileName(undefined); setData(undefined); setLeaveOut(new Set()); setResult(undefined); setError(undefined); setAgreed(false); key.current = newKey(); if (file.current) file.current.value = ""; };
  const check = async (text: string) => {
    setError(undefined); setResult(undefined);
    try { const p = await preview.mutateAsync(text); setData(p); setLeaveOut(new Set()); key.current = newKey(); }
    catch (e) { setData(undefined); setError(isApiError(e) ? e.message : "We couldn’t read the file. Try again."); }
  };
  const onFile = async (f: File | undefined) => { if (!f) return; const text = await f.text(); setCsv(text); setFileName(f.name); await check(text); };

  const importable = data?.rows.filter((r) => r.status !== "error") ?? [];
  const chosen = importable.filter((r) => !leaveOut.has(r.line));
  const submit = async () => {
    setError(undefined);
    try {
      const r = await run.mutateAsync({ key: key.current, csv, leaveOut: [...leaveOut], fileName, consentConfirmed: agreed as true });
      setResult(r); setConfirming(false);
      toast({ title: r.repeated ? "Already imported" : "Members imported", description: r.repeated ? "This import was done before, so nobody was added twice." : `${r.created} ${r.created === 1 ? "member" : "members"} added.`, tone: "success" });
    } catch (e) { setError(isApiError(e) ? e.message : "The import didn’t finish and nothing was added. Try again: sending it twice never adds anyone twice."); }
  };

  const rows = (data?.rows ?? []).filter((r) => !problemsOnly || r.status !== "ok");
  const columns: Array<Column<PreviewRow>> = [
    { key: "tick", header: "Import", action: true, cell: (r) => <Tick checked={r.status !== "error" && !leaveOut.has(r.line)} disabled={r.status === "error"} label={r.status === "error" ? `Row ${r.line}, ${r.name || "no name"}: has a problem and can’t be imported` : `Import row ${r.line}, ${r.name}`} onChange={(on) => setLeaveOut((s) => { const n = new Set(s); if (on) n.delete(r.line); else n.add(r.line); return n; })} /> },
    { key: "line", header: "Row", hideOnPhone: true, cell: (r) => <span className="tabular">{r.line}</span> },
    { key: "name", header: "Member", primary: true, cell: (r) => <span><span className="font-semibold">{r.name || "No name"}</span><span className="block text-sm font-normal text-clay-muted">{r.phone}{r.email ? `, ${r.email}` : ""}</span></span> },
    { key: "where", header: "Branch and plan", cell: (r) => <span>{r.branchName}<span className="block text-sm text-clay-muted">{r.status === "error" ? "" : r.summary}</span></span> },
    {
      key: "note", header: "What will happen",
      cell: (r) => r.status === "error" ? (
        <ul aria-label={`Problems in row ${r.line}`} className="space-y-0.5 text-sm font-semibold text-status-danger-fg">{r.errors.map((e) => <li key={e}>{e}</li>)}</ul>
      ) : r.status === "shared" ? (
        <span className="text-sm"><span className="mr-1 inline-flex rounded-full bg-lilac-100 px-2 py-0.5 text-xs font-semibold text-lilac-700">Shared number</span>Shares this number with {r.sharedWith.map((s) => (s.source === "existing" ? `${s.name} (a member)` : `${s.name} (row ${s.line})`)).join(", ")}. Added as a separate member with the shared-number flag.</span>
      ) : <span className="text-sm text-clay-muted">A new member.</span>,
    },
  ];

  return (
    <div className="max-w-6xl space-y-5">
      <header>
        <h1 className="text-[1.7rem] font-bold tracking-tight lg:text-4xl">Import members</h1>
        <p className="max-w-[70ch] text-clay-muted">Bring members, their plans and their balances from a spreadsheet. The file is checked first and nothing is added until you say so. Sending an import twice never adds anyone twice.</p>
      </header>

      <section aria-labelledby="imp-1" className="clay space-y-3 p-4 sm:p-5">
        <h2 id="imp-1" className="text-lg font-bold">1. Get the file ready</h2>
        <p className="text-[0.95rem] text-clay-muted">One member on each line, with these columns in the first line. Save the sheet as CSV.</p>
        <div className="flex flex-wrap gap-3"><Button3D variant="white" size="md" onClick={download}><Download className="h-4 w-4" aria-hidden="true" />Download the template</Button3D></div>
        <details className="rounded-2xl bg-clay-canvas p-3"><summary className="min-h-[2.75rem] cursor-pointer py-2 font-semibold">What each column means</summary>
          <dl className="mt-1 grid gap-x-6 gap-y-1 text-[0.95rem] sm:grid-cols-[auto_1fr]">{COLUMNS.map((c) => <div key={c} className="contents"><dt className="font-mono text-sm font-semibold">{c}{REQUIRED.includes(c) ? " *" : ""}</dt><dd className="text-clay-muted">{COLUMN_HELP[c]}</dd></div>)}</dl>
        </details>
      </section>

      <section aria-labelledby="imp-2" className="clay space-y-3 p-4 sm:p-5">
        <h2 id="imp-2" className="text-lg font-bold">2. Add the file</h2>
        <div className="flex flex-wrap items-center gap-3">
          <label className="clay-flat inline-flex min-h-[2.75rem] cursor-pointer items-center gap-2 px-4 font-semibold has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ember-300"><Upload className="h-4 w-4" aria-hidden="true" />Choose a CSV file<input ref={file} type="file" accept=".csv,text/csv" className="sr-only" onChange={(e) => void onFile(e.target.files?.[0])} /></label>
          {fileName && <span className="text-[0.95rem] text-clay-muted">{fileName}</span>}
        </div>
        <details className="rounded-2xl bg-clay-canvas p-3"><summary className="min-h-[2.75rem] cursor-pointer py-2 font-semibold">Or paste the contents</summary>
          <label className="mt-1 block"><span className="sr-only">CSV contents</span><textarea value={csv} onChange={(e) => { setCsv(e.target.value); setFileName(undefined); }} rows={6} className="clay-flat w-full p-3 font-mono text-sm outline-none focus-visible:ring-2 focus-visible:ring-ember-300" placeholder={TEMPLATE_CSV} /></label>
          <div className="mt-2"><Button3D variant="white" size="md" disabled={!csv.trim() || preview.isPending} onClick={() => void check(csv)}>Check the pasted text</Button3D></div>
        </details>
        {preview.isPending && <p role="status" className="text-clay-muted">Checking the file…</p>}
        {error && !data && <p role="alert" className="rounded-2xl bg-status-danger-bg px-4 py-3 text-sm font-semibold text-status-danger-fg">{error}</p>}
      </section>

      {data && data.fileErrors.length > 0 && (
        <section aria-label="The file can’t be read" className="clay p-4 sm:p-5"><ul role="alert" className="space-y-1 font-semibold text-status-danger-fg">{data.fileErrors.map((e) => <li key={e}>{e}</li>)}</ul></section>
      )}

      {data && data.fileErrors.length === 0 && !result && (
        <section aria-labelledby="imp-3" className="space-y-3">
          <h2 id="imp-3" className="text-lg font-bold">3. Check it</h2>
          <dl aria-label="Summary" className="grid grid-cols-3 gap-3">
            <div className="clay p-3"><dt className="text-sm text-clay-muted">Ready</dt><dd className="font-display text-3xl font-extrabold tabular">{data.counts.ok}</dd></div>
            <div className="clay p-3"><dt className="text-sm text-clay-muted">Shared number</dt><dd className="font-display text-3xl font-extrabold tabular">{data.counts.shared}</dd></div>
            <div className="clay p-3"><dt className="text-sm text-clay-muted">Problems</dt><dd className="font-display text-3xl font-extrabold tabular">{data.counts.error}</dd></div>
          </dl>
          {data.ignoredColumns.length > 0 && <p className="text-sm text-clay-muted">Ignored columns: {data.ignoredColumns.join(", ")}.</p>}
          {data.limit !== null && <p className="text-sm text-clay-muted">Your Ember plan allows {data.limit} active members; {data.active} are active now.</p>}
          <div role="group" aria-label="Show" className="flex flex-wrap gap-2">
            {[{ v: false, l: `All rows ${data.rows.length}` }, { v: true, l: `Needs a look ${data.counts.shared + data.counts.error}` }].map((f) => <button key={f.l} type="button" aria-pressed={problemsOnly === f.v} onClick={() => setProblemsOnly(f.v)} className={cn("min-h-[2.75rem] cursor-pointer rounded-full border border-clay-line px-4 text-sm font-semibold", problemsOnly === f.v ? "bg-clay-ink text-white" : "bg-white hover:bg-clay-canvas")}>{f.l}</button>)}
          </div>
          <ResponsiveTable rows={rows} columns={columns} rowKey={(r) => String(r.line)} caption="Rows in the file" />
          <div role="region" aria-label="Import" className="sticky bottom-0 z-30 -mx-4 flex flex-wrap items-center gap-3 border-t border-clay-line bg-clay-canvas/95 px-4 py-3 backdrop-blur sm:mx-0 sm:rounded-2xl sm:border sm:px-5">
            <p className="min-w-0 flex-1 font-semibold">{chosen.length} of {data.rows.length} rows will be imported{data.counts.error ? `; ${data.counts.error} have problems and are left out` : ""}.</p>
            <Button3D variant="white" size="md" onClick={reset}>Start again</Button3D>
            <Button3D variant="ember" size="md" disabled={chosen.length === 0} onClick={() => { setError(undefined); setConfirming(true); }}>Import {chosen.length} {chosen.length === 1 ? "member" : "members"}</Button3D>
          </div>
        </section>
      )}

      {result && (
        <section aria-labelledby="imp-done" className="clay space-y-3 p-4 sm:p-5">
          <h2 id="imp-done" className="flex items-center gap-2 text-lg font-bold"><FileSpreadsheet className="h-5 w-5" aria-hidden="true" />{result.repeated ? "Already imported" : "Imported"}</h2>
          <p>{result.repeated ? "This import had already been done, so nobody was added twice." : `${result.created} ${result.created === 1 ? "member was" : "members were"} added.`}</p>
          <ul aria-label="What was imported" className="text-[0.95rem] text-clay-muted"><li>{result.memberships} {result.memberships === 1 ? "membership" : "memberships"} started or scheduled</li><li>{result.credits} {result.credits === 1 ? "balance" : "balances"} of training sessions</li><li>{result.shared} with a shared number, flagged</li><li>{result.leftOut} left out by you, {result.withProblems} left out for problems</li></ul>
          <div className="flex flex-wrap gap-3"><Button3D variant="ember" size="md" onClick={reset}>Import another file</Button3D><Button3D variant="white" size="md" disabled={run.isPending} onClick={() => void submit()}>Send this import again</Button3D></div>
          <p className="text-sm text-clay-muted">“Send this import again” is safe: it finds the import already done and adds nobody.</p>
        </section>
      )}

      <RecentImports />

      <Sheet open={confirming} onClose={() => setConfirming(false)} label="Import members" kind="confirm">
        <div className="space-y-3 p-5">
          <h2 className="text-xl font-bold">Import {chosen.length} {chosen.length === 1 ? "member" : "members"}?</h2>
          <p>They are added to the gym with the plans and balances in the file. No invoice is made for a plan brought over this way. It is written to the audit log.</p>
          <label className="clay-flat flex min-h-[2.75rem] cursor-pointer items-start gap-3 p-3"><input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} className="mt-1 h-5 w-5 shrink-0" /><span className="font-semibold">These members agreed to the gym keeping their details.<span className="block text-sm font-normal text-clay-muted">Offers and news stay off until each member agrees.</span></span></label>
          {error && <p role="alert" className="rounded-2xl bg-status-danger-bg px-4 py-3 text-sm font-semibold text-status-danger-fg">{error}</p>}
          <div className="flex flex-wrap gap-3"><Button3D variant="ember" size="md" disabled={!agreed || run.isPending} onClick={() => void submit()}>{run.isPending ? "Importing…" : "Import"}</Button3D><Button3D variant="white" size="md" onClick={() => setConfirming(false)}>Cancel</Button3D></div>
        </div>
      </Sheet>
    </div>
  );
}
