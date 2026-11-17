import { useEffect, useId, useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Logo } from "@/components/ui/Logo";
import { Button } from "@/components/ui/Button";
import { Kettlebell } from "@/components/gym/Equipment";
import { brand } from "@/config/brand";
import { findAccountByEmail, findAccountByPhone } from "@/app/demoAccounts";
import { FEATURED_ACCOUNTS, signInDemo } from "@/app/demoSignIn";
import { readSession, writeSession } from "@/app/session";
import { AREA_PATH, ROLE_LABEL, areaFor, homePathFor, type Role } from "@/domain/roles";
import { cn } from "@/lib/format";

type Method = "email" | "phone";

const input =
  "clay-well h-[3.25rem] w-full !rounded-2xl px-4 text-base text-clay-ink placeholder:text-clay-subtle focus:outline-none focus:ring-2 focus:ring-ember-400";

/**
 * Demo login. Members can use a phone number and a code, or an email and a password. Staff use an email and a password.
 * Any password and any 6-digit code are accepted, but the email or phone number must belong to someone in the demo gym.
 * This page is part of the marketing bundle: no React Query, Dexie or Zod here.
 */
export default function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const emailId = useId();
  const passId = useId();
  const phoneId = useId();
  const otpId = useId();
  const [method, setMethod] = useState<Method>("email");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [otpSentTo, setOtpSentTo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const existing = readSession();

  useEffect(() => {
    document.title = `Log in · ${brand.name}`;
  }, []);

  /** Back to the page they were trying to open, if their role may use it. Otherwise their own home. */
  const enter = (userId: string, role: Role) => {
    if (!signInDemo(userId)) return setError("We couldn’t sign you in. Try again.");
    const from = (location.state as { from?: string } | null)?.from;
    const area = AREA_PATH[areaFor(role)];
    navigate(from && (from === area || from.startsWith(`${area}/`)) ? from : homePathFor(role), { replace: true });
  };

  const onEmailSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim())) return setError("Enter the email you signed up with.");
    if (password.length < 1) return setError("Enter your password.");
    const account = findAccountByEmail(email);
    if (!account) return setError("We couldn’t find an account with this email. In this demo, use one of the people under “Try the demo as”.");
    setError(null);
    enter(account.userId, account.role);
  };

  const onPhoneSubmit = (e: FormEvent) => {
    e.preventDefault();
    const digits = phone.replace(/\s/g, "");
    if (!otpSentTo) {
      if (!/^[6-9]\d{9}$/.test(digits)) return setError("Enter a 10-digit mobile number.");
      const account = findAccountByPhone(digits);
      if (!account) return setError("We couldn’t find a member with this number. Check it, or ask your front desk.");
      if (account.role !== "member") return setError("Staff log in with email and password.");
      setError(null);
      setOtp("");
      return setOtpSentTo(digits);
    }
    if (!/^\d{6}$/.test(otp)) return setError("Enter the 6-digit code.");
    const account = findAccountByPhone(otpSentTo);
    if (!account) return setError("We couldn’t sign you in. Go back and enter your number again.");
    setError(null);
    enter(account.userId, account.role);
  };

  const switchMethod = (m: Method) => {
    setMethod(m);
    setError(null);
    setOtpSentTo(null);
  };

  const pretty = (d: string) => `+91 ${d.slice(0, 5)} ${d.slice(5)}`;

  return (
    <main className="relative min-h-screen overflow-hidden bg-[linear-gradient(180deg,#FFF6EF,#FBF8F4)] px-5 py-10 text-clay-ink">
      <div aria-hidden="true" className="absolute bottom-10 right-10 hidden w-32 lg:block">
        <Kettlebell className="w-full" />
      </div>
      <div className="relative mx-auto w-full max-w-lg">
        <Link to="/" aria-label={`${brand.name} home`} className="mx-auto block w-fit">
          <Logo />
        </Link>

        {existing && (
          <p className="clay-flat mt-6 flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm">
            <span>You’re signed in as {existing.name}.</span>
            <span className="flex gap-4 font-semibold">
              <Link to={homePathFor(existing.role)} className="underline decoration-ember-500/70 decoration-2 underline-offset-4">
                Open your dashboard
              </Link>
              <button type="button" onClick={() => { writeSession(null); navigate(0); }} className="underline decoration-ember-500/70 decoration-2 underline-offset-4">
                Sign out
              </button>
            </span>
          </p>
        )}

        <div className="clay mt-6 p-7">
          <h1 className="text-2xl font-bold tracking-tight">Log in to your gym</h1>
          <p className="mt-1 text-sm text-clay-muted">Owners, staff, trainers and members all log in here.</p>

          <div role="group" aria-label="Log in with" className="clay-well mt-6 grid grid-cols-2 gap-1 !rounded-full p-1">
            {([["email", "Email and password"], ["phone", "Phone and code"]] as const).map(([m, label]) => (
              <button
                key={m}
                type="button"
                aria-pressed={method === m}
                onClick={() => switchMethod(m)}
                className={cn("h-11 rounded-full px-3 text-sm font-semibold transition-colors", method === m ? "clay-flat !rounded-full text-clay-ink" : "text-clay-muted hover:text-clay-ink")}
              >
                {label}
              </button>
            ))}
          </div>

          {method === "email" ? (
            <form onSubmit={onEmailSubmit} noValidate>
              <label htmlFor={emailId} className="mt-5 block text-sm font-semibold">Email</label>
              <input id={emailId} type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="neha@pulsefitness.in" className={`${input} mt-1.5`} />
              <label htmlFor={passId} className="mt-4 block text-sm font-semibold">Password</label>
              <input id={passId} type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} className={`${input} mt-1.5`} />
              {error && <p role="alert" className="mt-3 text-sm text-status-danger-fg">{error}</p>}
              <Button type="submit" variant="ink" size="lg" className="mt-6 w-full">Log in</Button>
            </form>
          ) : (
            <form onSubmit={onPhoneSubmit} noValidate>
              <p className="mt-5 text-sm text-clay-muted">For members. Staff log in with email and password.</p>
              <label htmlFor={phoneId} className="mt-4 block text-sm font-semibold">Mobile number</label>
              <div className="relative mt-1.5">
                <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-4 flex items-center text-clay-muted">+91</span>
                <input id={phoneId} type="tel" inputMode="numeric" autoComplete="tel-national" maxLength={11} disabled={!!otpSentTo} value={phone} onChange={(e) => setPhone(e.target.value.replace(/[^\d\s]/g, ""))} placeholder="98765 43210" className={`${input} pl-14 disabled:opacity-70`} />
              </div>
              {otpSentTo && (
                <>
                  <p className="mt-3 text-sm text-clay-muted" aria-live="polite">
                    We sent a code to {pretty(otpSentTo)}. In this demo, any 6 digits work.
                  </p>
                  <label htmlFor={otpId} className="mt-4 block text-sm font-semibold">6-digit code</label>
                  <input id={otpId} autoFocus type="text" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))} className={`${input} mt-1.5 tracking-[0.4em]`} />
                </>
              )}
              {error && <p role="alert" className="mt-3 text-sm text-status-danger-fg">{error}</p>}
              <Button type="submit" variant="ink" size="lg" className="mt-6 w-full">{otpSentTo ? "Log in" : "Send code"}</Button>
              {otpSentTo && (
                <button type="button" onClick={() => { setOtpSentTo(null); setError(null); }} className="mt-4 min-h-[2.75rem] w-full text-center text-sm font-semibold text-clay-muted underline decoration-ember-500/70 decoration-2 underline-offset-4">
                  Use a different number
                </button>
              )}
            </form>
          )}

          <p className="mt-5 text-center text-sm text-clay-muted">
            New here? <Link to="/signup" className="font-semibold text-clay-ink underline decoration-ember-500/70 decoration-2 underline-offset-4">Start a free trial</Link>
          </p>
        </div>

        <section aria-labelledby="try-as" className="mt-8">
          <h2 id="try-as" className="text-sm font-semibold text-clay-muted">Try the demo as</h2>
          <p className="mt-1 text-sm text-clay-muted">One tap signs you in to Pulse Fitness, a sample gym with 3 branches.</p>
          <ul className="mt-3 grid gap-3 sm:grid-cols-2">
            {FEATURED_ACCOUNTS.map((a) => (
              <li key={a.userId}>
                <button type="button" onClick={() => enter(a.userId, a.role)} className="press clay-flat flex min-h-[4.25rem] w-full flex-col items-start justify-center !rounded-2xl px-4 py-3 text-left">
                  <span className="font-semibold">{ROLE_LABEL[a.role]}</span>
                  <span className="text-sm text-clay-muted">{a.name}</span>
                  <span className="text-xs text-clay-subtle">{a.blurb}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </main>
  );
}
