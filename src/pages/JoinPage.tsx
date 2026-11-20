import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import type { InviteView } from "@/api/memberInvites";
import { writeGym } from "@/app/gymCache";
import { signInRegistered } from "@/app/demoSignIn";
import { GymMark } from "@/design/GymMark";
import { OTP_DEMO_CODE, validateJoin, type JoinDraft } from "@/domain/memberInvite";
import { cn } from "@/lib/format";

const input = "min-h-[2.75rem] w-full rounded-xl border border-clay-line bg-white px-3 outline-none focus-visible:ring-2 focus-visible:ring-ember-300";

/**
 * Where an app invitation leads (S01): the member chooses how they sign in, by phone and a six-digit code or by email and a password, and is signed in. In demo mode the code is shown on the
 * page and the password is checked and then forgotten. The API is loaded here, not in the marketing bundle.
 */
export default function JoinPage() {
  const { token = "" } = useParams();
  const [invite, setInvite] = useState<InviteView>();
  const [d, setD] = useState<JoinDraft>({ method: "phone_otp", code: "", password: "", confirm: "" });
  const [tried, setTried] = useState(false);
  const [codeSent, setCodeSent] = useState(false);
  const [failure, setFailure] = useState<string>();
  const [busy, setBusy] = useState(false);
  useEffect(() => { void import("@/api/memberInvites").then((a) => a.getInvite(token)).then(setInvite); }, [token]);
  const errors = validateJoin(d);
  const set = (p: Partial<JoinDraft>) => setD((x) => ({ ...x, ...p }));
  const submit = async () => {
    setTried(true); setFailure(undefined);
    if (Object.keys(errors).length) return;
    setBusy(true);
    try {
      const api = await import("@/api/memberInvites");
      const m = await api.completeJoin({ token, ...d });
      writeGym({ tenantId: m.tenantId, name: invite?.gymName ?? "" });
      signInRegistered({ ...m, role: "member" });
      window.location.assign("/m");
    } catch (e) { setFailure(e instanceof Error ? e.message : "We couldn’t set up your login. Try again."); setBusy(false); }
  };
  return (
    <main className="grid min-h-dvh place-items-center bg-clay-canvas px-4 py-10 text-clay-ink">
      <div className="clay w-full max-w-md space-y-4 p-5 sm:p-6">
        {!invite ? <p role="status" className="text-clay-muted">Opening your invitation…</p> : !invite.valid ? (
          <>
            <h1 className="text-2xl font-bold tracking-tight">This link can’t be used</h1>
            <p className="text-clay-muted">{invite.reason}</p>
            <a href="/login" className="inline-flex min-h-[2.75rem] items-center font-semibold underline underline-offset-4">Go to the login page</a>
          </>
        ) : (
          <form onSubmit={(e) => { e.preventDefault(); void submit(); }} noValidate aria-label="Set up your login" className="space-y-4">
            <div className="flex items-center gap-3"><GymMark name={invite.gymName ?? ""} logoUrl={invite.logoUrl} className="!h-12 !w-12 !rounded-xl" /><p className="font-bold">{invite.gymName}</p></div>
            <h1 className="text-2xl font-bold tracking-tight">Hi {invite.firstName}, set up your login</h1>
            <p className="text-clay-muted">Choose how you will sign in to the {invite.gymName} app.</p>
            <fieldset className="grid gap-2">
              <legend className="sr-only">How you sign in</legend>
              {([["phone_otp", "Phone and a code", `We send a code to the number ending ${invite.phoneEnding}.`], ["email_password", "Email and a password", invite.email ? `Use ${invite.email}.` : "Use your email address."]] as const).map(([v, label, note]) => (
                <label key={v} className={cn("clay-flat relative flex min-h-[2.75rem] cursor-pointer items-center gap-3 px-3 py-2", d.method === v && "ring-2 ring-ember-400")}><input type="radio" name="method" checked={d.method === v} onChange={() => set({ method: v })} className="absolute inset-0 h-full w-full cursor-pointer opacity-0" /><span aria-hidden="true" className={cn("grid h-5 w-5 shrink-0 place-items-center rounded-full border-2", d.method === v ? "border-ember-600 bg-ember-600" : "border-clay-subtle bg-white")}>{d.method === v && <span className="h-2 w-2 rounded-full bg-white" />}</span><span><span className="font-semibold">{label}</span><span className="block text-sm text-clay-muted">{note}</span></span></label>
              ))}
            </fieldset>
            {d.method === "phone_otp" ? (
              <div className="space-y-2">
                {!codeSent ? <button type="button" onClick={() => setCodeSent(true)} className="min-h-[2.75rem] cursor-pointer rounded-xl bg-white px-4 font-semibold shadow-sm">Send me a code</button> : <p role="status" className="rounded-xl bg-clay-canvas p-3 text-[0.95rem]">Code sent. In this demo nothing is texted: your code is <strong className="tabular">{OTP_DEMO_CODE}</strong>.</p>}
                <label className="block"><span className="text-sm font-semibold">Six-digit code</span><input inputMode="numeric" autoComplete="one-time-code" value={d.code} onChange={(e) => set({ code: e.target.value })} className={input} aria-invalid={tried && errors.code ? true : undefined} /></label>
                {tried && errors.code && <p role="alert" className="text-sm font-semibold text-status-danger-fg">{errors.code}</p>}
              </div>
            ) : (
              <div className="space-y-3">
                <label className="block"><span className="text-sm font-semibold">Password</span><input type="password" autoComplete="new-password" value={d.password} onChange={(e) => set({ password: e.target.value })} className={input} aria-invalid={tried && errors.password ? true : undefined} /></label>
                {tried && errors.password && <p role="alert" className="text-sm font-semibold text-status-danger-fg">{errors.password}</p>}
                <label className="block"><span className="text-sm font-semibold">Type it again</span><input type="password" autoComplete="new-password" value={d.confirm} onChange={(e) => set({ confirm: e.target.value })} className={input} aria-invalid={tried && errors.confirm ? true : undefined} /></label>
                {tried && errors.confirm && <p role="alert" className="text-sm font-semibold text-status-danger-fg">{errors.confirm}</p>}
              </div>
            )}
            {failure && <p role="alert" className="rounded-2xl bg-status-danger-bg px-4 py-3 text-sm font-semibold text-status-danger-fg">{failure}</p>}
            <button type="submit" disabled={busy} className="min-h-[3rem] w-full cursor-pointer rounded-2xl bg-ember-600 px-4 font-bold text-white shadow-[0_4px_0_#7A2700] disabled:opacity-60">{busy ? "Setting up…" : "Create my login"}</button>
          </form>
        )}
      </div>
    </main>
  );
}
