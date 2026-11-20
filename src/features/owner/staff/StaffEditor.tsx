import { useMemo, useRef, useState } from "react";
import { X } from "lucide-react";
import { useStaffActions } from "@/api/ownerHooks";
import { isApiError } from "@/api/errors";
import type { StaffRow, StaffView } from "@/api/staff";
import { Button3D } from "@/design/Button3D";
import { Choice } from "@/design/Choice";
import { Field, inputClass } from "@/design/Field";
import { Sheet } from "@/design/Sheet";
import { Switch } from "@/design/Switch";
import { useToast } from "@/design/Toast";
import { rupeesToPaise } from "@/domain/plans";
import { ROLE_LABEL } from "@/domain/roles";
import { accessChanges, accessSummary, authorityOf, cleanLimits, defaultLimits, limitsThatApply, ROLE_ABOUT, validateStaff, type Actor, type StaffDraft, type StaffErrors, type StaffRoleName } from "@/domain/staffRules";
import { cn } from "@/lib/format";
import { formatDate, formatRupees } from "@/lib/when";

interface Form {
  name: string;
  email: string;
  phone: string;
  role: StaffRoleName | "";
  branchIds: string[];
  refund: string;
  refundNone: boolean;
  discount: string;
  override: boolean;
  overrides: string;
  health: boolean;
  frontline: boolean;
}

const pctText = (bp: number) => String(bp / 100);
const formFor = (r: StaffRow | undefined): Form => {
  const l = r?.limits ?? defaultLimits("front_desk");
  return {
    name: r?.name ?? "", email: r?.email ?? "", phone: r?.phone ?? "", role: r?.role ?? "", branchIds: r?.branchIds ?? [], refund: l.refundLimitPaise === null ? "" : String(l.refundLimitPaise / 100), refundNone: l.refundLimitPaise === null, discount: pctText(l.maxDiscountBp),
    override: l.canOverrideCheckIn, overrides: l.maxOverridesPerDay === null || l.maxOverridesPerDay === undefined ? "" : String(l.maxOverridesPerDay), health: l.canViewClientHealth, frontline: l.canManageFrontline === true,
  };
};
const whole = (s: string): number | null => (s.trim() === "" ? null : /^\d+$/.test(s.trim()) ? Number(s.trim()) : Number.NaN);
const draftOf = (f: Form): StaffDraft => ({
  name: f.name, email: f.email, phone: f.phone, role: f.role, branchIds: f.branchIds,
  limits: {
    refundLimitPaise: f.refundNone ? null : f.refund.trim() === "" ? Number.NaN : (rupeesToPaise(f.refund) ?? Number.NaN),
    maxDiscountBp: /^\d+(\.\d{1,2})?$/.test(f.discount.trim()) ? Math.round(Number(f.discount.trim()) * 100) : Number.NaN, canOverrideCheckIn: f.override, maxOverridesPerDay: f.override ? whole(f.overrides) : null,
    canViewClientHealth: f.health, canManageFrontline: f.frontline,
  },
});

/**
 * The staff editor (R02, S03): the invitation form and the edit form are the same panel. It only asks for the limits that apply to the role chosen, says what the person will be able to do in plain
 * words as it changes, and lists what a save will change. A person the viewer may not change sees it read-only, with the reason.
 */
export function StaffEditor({ row, view, onClose }: { row: StaffRow | undefined; view: StaffView; onClose: () => void }) {
  const { invite, update, status, resend } = useStaffActions();
  const toast = useToast();
  const [f, setF] = useState<Form>(() => formFor(row));
  const [tried, setTried] = useState(false);
  const [failure, setFailure] = useState<string>();
  const [switching, setSwitching] = useState<"off" | "on" | null>(null);
  const [why, setWhy] = useState("");
  const [reason, setReason] = useState("");
  const key = useRef(`staff-${crypto.randomUUID()}`);
  const set = (patch: Partial<Form>) => setF((x) => ({ ...x, ...patch }));
  const actor: Actor = { userId: view.me.userId, role: view.me.role, branchIds: view.me.branchIds, limits: view.me.limits };
  const auth = authorityOf(actor);
  const readOnly = row ? !row.manage.ok && !row.you : auth.scope === "none";
  const self = !!row?.you;
  const draft = draftOf(f);
  const errors: StaffErrors = useMemo(() => validateStaff(draft, actor, { emailsTaken: view.emailsTaken.filter((e) => e.toLowerCase() !== (row?.email ?? "").toLowerCase()), allBranchIds: view.branches.map((b) => b.id) }), [draft, actor, view, row?.email]);
  const shown = (k: keyof StaffErrors) => (tried ? errors[k] : undefined);
  const applies = f.role ? limitsThatApply(f.role) : undefined;
  const names = (ids: string[]) => view.branches.filter((b) => ids.includes(b.id)).map((b) => b.name);
  const branchNames = f.role === "owner" ? view.branches.map((b) => b.name) : names(f.branchIds);
  const limits = f.role ? cleanLimits(f.role, draft.limits) : undefined;
  const summary = f.role && limits ? accessSummary(f.role, branchNames, limits) : [];
  const changes = row && f.role && limits ? accessChanges({ role: row.role, branchNames: row.branchNames, limits: row.limits }, { role: f.role, branchNames, limits }) : [];
  const err = (k: keyof StaffErrors, id: string) => ({ "aria-invalid": shown(k) ? true : undefined, "aria-describedby": shown(k) ? `${id}-error` : undefined });
  const ceilingRefund = auth.ceiling.refundLimitPaise;

  const pickRole = (role: StaffRoleName) => {
    const d = defaultLimits(role);
    setF((x) => ({ ...x, role, branchIds: role === "owner" ? [] : x.branchIds, refund: d.refundLimitPaise === null ? "" : String(d.refundLimitPaise / 100), refundNone: d.refundLimitPaise === null, discount: pctText(d.maxDiscountBp), override: d.canOverrideCheckIn, overrides: d.maxOverridesPerDay === undefined || d.maxOverridesPerDay === null ? "" : String(d.maxOverridesPerDay), health: false, frontline: false }));
  };
  const submit = async () => {
    setTried(true);
    setFailure(undefined);
    if (Object.keys(errors).length > 0 || !f.role || !limits) return;
    const payload = { name: f.name.trim(), email: f.email.trim(), phone: f.phone, role: f.role, branchIds: f.role === "owner" ? view.branches.map((b) => b.id) : f.branchIds, limits };
    try {
      if (row) {
        const r = await update.mutateAsync({ ...payload, userId: row.userId, key: key.current, reason: reason.trim() || undefined });
        toast({ title: r.changes.length ? "Access changed" : "Details saved", description: r.changes.length ? `${row.name.split(" ")[0]}’s new access applies from their next action. The change is in the audit log.` : `${row.name.split(" ")[0]}’s details are saved.`, tone: "success" });
      } else {
        const r = await invite.mutateAsync({ ...payload, key: key.current });
        toast({ title: "Invitation sent", description: `${r.name.split(" ")[0]} is invited as ${ROLE_LABEL[r.role].toLowerCase()}. The email is in the delivery log; they can’t sign in until they accept it.`, tone: "success" });
      }
      onClose();
    } catch (e) { setFailure(isApiError(e) ? e.message : "We couldn’t save. Try again."); }
  };
  const switchAccount = async (active: boolean) => {
    if (!row) return;
    try {
      const r = await status.mutateAsync({ userId: row.userId, active, reason: why, key: `st-${crypto.randomUUID()}` });
      toast({ title: active ? "Account switched on" : "Account switched off", description: active ? `${row.name.split(" ")[0]} can sign in again.` : `${row.name.split(" ")[0]} can no longer sign in.${r.clients > 0 ? ` Their ${r.clients} ${r.clients === 1 ? "client keeps" : "clients keep"} the assignment until you reassign ${r.clients === 1 ? "them" : "them"}.` : ""}`, tone: "success" });
      setSwitching(null);
      onClose();
    } catch (e) { setFailure(isApiError(e) ? e.message : "We couldn’t change that. Try again."); if (active) setSwitching(null); }
  };
  const sendAgain = async () => {
    if (!row) return;
    try { const r = await resend.mutateAsync({ userId: row.userId, key: `rs-${crypto.randomUUID()}` }); toast({ title: "Invitation sent again", description: `It went to ${r.sentTo}.`, tone: "success" }); }
    catch (e) { setFailure(isApiError(e) ? e.message : "We couldn’t send it. Try again."); }
  };
  const title = row ? (readOnly ? row.name : self ? "Your details" : "Edit access") : "Invite staff";

  return (
    <>
      <form onSubmit={(e) => { e.preventDefault(); void submit(); }} noValidate aria-label={row ? `Staff: ${row.name}` : "Invite staff"} className="flex min-h-full flex-col">
        <header className="flex items-start justify-between gap-3 px-5 pb-2 pt-5">
          <div className="min-w-0">
            <h2 className="text-xl font-bold">{title}</h2>
            {row && !readOnly && <p className="text-sm text-clay-muted">{row.name}, {ROLE_LABEL[row.role].toLowerCase()}{row.status === "invited" ? `, invited ${formatDate(row.invitedOn ?? view.today)}` : row.status === "disabled" ? ", switched off" : ""}</p>}
            {!row && <p className="text-sm text-clay-muted">They get an email with a link to set a password. Until they accept it they can’t sign in.</p>}
            {row && readOnly && <p className="text-sm text-clay-muted">{row.manage.reason}</p>}
            {self && <p className="text-sm text-clay-muted">You can fix your own name and phone. Another owner changes your access.</p>}
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="grid h-11 w-11 shrink-0 place-items-center rounded-full hover:bg-clay-canvas"><X className="h-5 w-5" aria-hidden="true" /></button>
        </header>
        <fieldset disabled={readOnly} className="min-w-0 flex-1 space-y-4 border-0 px-5 pb-4 pt-2">
          <Field label="Name" htmlFor="st-name" error={shown("name")}><input id="st-name" value={f.name} onChange={(e) => set({ name: e.target.value })} className={inputClass} autoComplete="off" data-autofocus {...err("name", "st-name")} /></Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Email" htmlFor="st-email" hint={row ? "They sign in with this address." : undefined} error={shown("email")}><input id="st-email" type="email" value={f.email} onChange={(e) => set({ email: e.target.value })} disabled={!!row} className={cn(inputClass, row && "opacity-70")} autoComplete="off" {...err("email", "st-email")} /></Field>
            <Field label="Mobile number" htmlFor="st-phone" hint="Optional" error={shown("phone")}><input id="st-phone" inputMode="tel" value={f.phone} onChange={(e) => set({ phone: e.target.value })} className={inputClass} autoComplete="off" {...err("phone", "st-phone")} /></Field>
          </div>

          <fieldset disabled={readOnly || self} aria-describedby={shown("role") ? "st-role-error" : undefined}>
            <legend className="text-sm font-semibold">Role</legend>
            <div className="mt-1 grid gap-2">
              {(row ? [row.role, ...auth.roles.filter((r) => r !== row.role)] : auth.roles).map((r) => <Choice key={r} type="radio" name="st-role" checked={f.role === r} onChange={() => pickRole(r)} label={ROLE_LABEL[r]} note={ROLE_ABOUT[r]} />)}
            </div>
            {shown("role") && <p id="st-role-error" role="alert" className="mt-1 text-sm font-semibold text-status-danger-fg">{shown("role")}</p>}
          </fieldset>

          {f.role && f.role !== "owner" && (
            <fieldset disabled={readOnly || self} aria-describedby={shown("branchIds") ? "st-branches-error" : undefined}>
              <legend className="text-sm font-semibold">Works at</legend>
              <div className="mt-1 grid gap-2">{view.branches.map((b) => <Choice key={b.id} type="checkbox" checked={f.branchIds.includes(b.id)} onChange={(on) => set({ branchIds: on ? [...f.branchIds, b.id] : f.branchIds.filter((x) => x !== b.id) })} label={b.name} />)}</div>
              {shown("branchIds") && <p id="st-branches-error" role="alert" className="mt-1 text-sm font-semibold text-status-danger-fg">{shown("branchIds")}</p>}
            </fieldset>
          )}

          {applies && (applies.refund || applies.discount || applies.override || applies.health || applies.frontline) && (
            <fieldset disabled={readOnly || self} className="space-y-4">
              <legend className="text-sm font-semibold">What they may do</legend>
              {applies.refund && (
                <Field label="Largest refund they can approve (₹)" htmlFor="st-refund" hint={ceilingRefund !== null ? `You can give up to ${formatRupees(ceilingRefund)}, your own limit.` : undefined} error={shown("refundLimitPaise")}>
                  <input id="st-refund" inputMode="decimal" value={f.refundNone ? "" : f.refund} onChange={(e) => set({ refund: e.target.value })} disabled={f.refundNone || readOnly || self} placeholder={f.refundNone ? "No limit" : undefined} className={inputClass} {...err("refundLimitPaise", "st-refund")} />
                  {auth.ceiling.refundLimitPaise === null && <div className="mt-2"><Switch id="st-refund-none" checked={f.refundNone} onChange={(on) => set({ refundNone: on })} label="No limit" description="They can approve a refund of any size." disabled={readOnly || self} /></div>}
                </Field>
              )}
              {applies.discount && <Field label="Largest discount they can give (%)" htmlFor="st-discount" hint={auth.scope === "frontline" ? `You can give up to ${Number((auth.ceiling.maxDiscountBp / 100).toFixed(2))}%, your own limit.` : undefined} error={shown("maxDiscountBp")}><input id="st-discount" inputMode="decimal" value={f.discount} onChange={(e) => set({ discount: e.target.value })} className={inputClass} {...err("maxDiscountBp", "st-discount")} /></Field>}
              {applies.override && (
                <>
                  <Switch id="st-override" checked={f.override} onChange={(on) => set({ override: on })} label="Can let a member in by override" description="When a check-in is turned away, they can let the member in with a reason. Every override is audited." disabled={readOnly || self || (!auth.ceiling.canOverrideCheckIn && !f.override)} />
                  {shown("canOverrideCheckIn") && <p role="alert" className="text-sm font-semibold text-status-danger-fg">{shown("canOverrideCheckIn")}</p>}
                  {f.override && <Field label="Overrides a day" htmlFor="st-overrides" hint="Leave empty for no limit." error={shown("maxOverridesPerDay")}><input id="st-overrides" inputMode="numeric" value={f.overrides} onChange={(e) => set({ overrides: e.target.value })} className={inputClass} {...err("maxOverridesPerDay", "st-overrides")} /></Field>}
                </>
              )}
              {applies.health && <Switch id="st-health" checked={f.health} onChange={(on) => set({ health: on })} label="Can view client health and progress photos" description="Off by default. Every time they open one it is written to the audit log. Only the owner can turn it on." disabled={readOnly || self || auth.scope !== "all"} />}
              {applies.frontline && <Switch id="st-frontline" checked={f.frontline} onChange={(on) => set({ frontline: on })} label="Can invite and manage front desk and trainers" description="At their own branches only, and never above their own refund or discount limit. Only the owner can turn it on." disabled={readOnly || self || auth.scope !== "all"} />}
            </fieldset>
          )}

          <section aria-label="What this person can do" aria-live="polite" className="rounded-2xl bg-clay-canvas p-4">
            <h3 className="font-bold">What {f.name.trim().split(" ")[0] || "they"} will be able to do</h3>
            {summary.length ? <ul className="mt-2 space-y-1 text-[0.95rem]">{summary.map((s) => <li key={s}>{s}</li>)}</ul> : <p className="mt-1 text-[0.95rem] text-clay-muted">Choose a role to see what it allows.</p>}
            {row && !readOnly && changes.length > 0 && (
              <div className="mt-3 border-t border-clay-line pt-3"><p className="font-semibold">This save will change</p><ul aria-label="Changes" className="mt-1 space-y-0.5 text-[0.95rem]">{changes.map((c) => <li key={c.field}>{c.field}: {c.from} to <strong>{c.to}</strong></li>)}</ul></div>
            )}
          </section>
          {row && !readOnly && changes.length > 0 && <Field label="Reason (optional)" htmlFor="st-reason"><input id="st-reason" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} className={inputClass} placeholder="Why their access is changing" /></Field>}
        </fieldset>
        {failure && <p role="alert" className="mx-5 mb-3 rounded-2xl bg-status-danger-bg px-4 py-3 text-sm font-semibold text-status-danger-fg">{failure}</p>}
        <footer className="sticky bottom-0 flex flex-wrap items-center gap-3 border-t border-clay-line bg-white/95 px-5 py-3 backdrop-blur">
          {readOnly ? <Button3D type="button" variant="white" size="md" onClick={onClose}>Close</Button3D> : (
            <>
              <Button3D type="submit" variant="ember" size="md" disabled={invite.isPending || update.isPending}>{invite.isPending || update.isPending ? "Saving…" : row ? "Save changes" : "Send invitation"}</Button3D>
              <Button3D type="button" variant="white" size="md" onClick={onClose}>Cancel</Button3D>
              {row && row.status === "invited" && <button type="button" onClick={() => void sendAgain()} className="min-h-[2.75rem] cursor-pointer px-2 text-sm font-semibold underline underline-offset-2">Send the invitation again</button>}
              {row && !self && row.manage.ok && <button type="button" onClick={() => (row.status === "disabled" ? void switchAccount(true) : setSwitching("off"))} className="ml-auto min-h-[2.75rem] cursor-pointer px-2 text-sm font-semibold underline underline-offset-2">{row.status === "disabled" ? "Switch on" : "Switch off account"}</button>}
            </>
          )}
        </footer>
      </form>
      <Sheet open={switching === "off"} onClose={() => setSwitching(null)} label="Switch off this account" kind="confirm">
        <div className="space-y-3 p-5">
          <h2 className="text-xl font-bold">Switch off {row?.name}?</h2>
          <p>They can no longer sign in. Everything they did stays in the records and the audit log.{row && row.clients > 0 ? ` They train ${row.clients} ${row.clients === 1 ? "member" : "members"}, who keep this assignment until you move them to another trainer.` : ""} You can switch the account back on at any time.</p>
          <Field label="Reason" htmlFor="st-why" hint="Kept in the audit log."><input id="st-why" value={why} onChange={(e) => setWhy(e.target.value)} className={inputClass} placeholder="Left the gym, on long leave…" data-autofocus /></Field>
          {failure && <p role="alert" className="rounded-2xl bg-status-danger-bg px-4 py-3 text-sm font-semibold text-status-danger-fg">{failure}</p>}
          <div className="flex flex-wrap gap-3"><Button3D variant="ember" size="md" onClick={() => void switchAccount(false)} disabled={status.isPending}>Switch off</Button3D><Button3D variant="white" size="md" onClick={() => { setSwitching(null); setFailure(undefined); }}>Keep it on</Button3D></div>
        </div>
      </Sheet>
    </>
  );
}
