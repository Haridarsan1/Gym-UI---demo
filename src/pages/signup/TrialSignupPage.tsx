import { useEffect, useId, useRef, useState, type FormEvent, type InputHTMLAttributes, type ReactNode } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowLeft, Check, Eye, EyeOff, Loader2 } from "lucide-react";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Dumbbell, Kettlebell } from "@/components/gym/Equipment";
import { Logo } from "@/components/ui/Logo";
import { brand } from "@/config/brand";
import { branchOptions, cities, memberOptions, pricingTiers } from "@/data/content";
import { createTrialAccount, type BranchRange, type MemberRange, type TrialSignupResult } from "@/lib/api";
import { cn } from "@/lib/format";

type Step = 0 | 1 | 2;
const stepNames = ["About you", "Your gym", "Gym size"] as const;

interface FormState {
  fullName: string;
  email: string;
  mobile: string;
  password: string;
  gymName: string;
  city: string;
  branches: BranchRange | "";
  members: MemberRange | "";
  terms: boolean;
}

type Errors = Partial<Record<keyof FormState, string>>;

const planToMembers: Record<string, MemberRange> = {
  starter: "under-250",
  growth: "250-500",
  pro: "500-1000",
};

function validate(step: Step, f: FormState): Errors {
  const e: Errors = {};
  if (step === 0) {
    if (f.fullName.trim().length < 2) e.fullName = "Enter your full name.";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(f.email.trim())) e.email = "Enter a valid email, like name@yourgym.in.";
    if (!/^[6-9]\d{9}$/.test(f.mobile.replace(/\s/g, ""))) e.mobile = "Enter a 10-digit Indian mobile number.";
    if (f.password.length < 8 || !/[A-Za-z]/.test(f.password) || !/\d/.test(f.password))
      e.password = "Use at least 8 characters, with a letter and a number.";
  }
  if (step === 1) {
    if (f.gymName.trim().length < 2) e.gymName = "Enter your gym’s name.";
    if (!f.city) e.city = "Choose the city of your main branch.";
  }
  if (step === 2) {
    if (!f.branches) e.branches = "Choose how many branches you run.";
    if (!f.members) e.members = "Choose roughly how many active members you have.";
    if (!f.terms) e.terms = "Accept the terms to create your account.";
  }
  return e;
}

export default function TrialSignupPage() {
  const [params] = useSearchParams();
  const [step, setStep] = useState<Step>(0);
  const [form, setForm] = useState<FormState>(() => ({
    fullName: "",
    email: "",
    mobile: "",
    password: "",
    gymName: "",
    city: "",
    branches: "",
    members: planToMembers[params.get("plan") ?? ""] ?? "",
    terms: false,
  }));
  const [errors, setErrors] = useState<Errors>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [result, setResult] = useState<TrialSignupResult | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    document.title = `Start your free trial · ${brand.name}`;
  }, []);

  useEffect(() => {
    headingRef.current?.focus();
  }, [step]);

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    if (errors[key]) setErrors((e) => ({ ...e, [key]: undefined }));
  };

  const focusFirstError = (errs: Errors) => {
    const first = Object.keys(errs)[0];
    if (!first) return;
    const el = formRef.current?.querySelector<HTMLElement>(`[name="${first}"]`);
    el?.focus();
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const errs = validate(step, form);
    setErrors(errs);
    if (Object.keys(errs).length) {
      focusFirstError(errs);
      return;
    }
    if (step < 2) {
      setStep((s) => (s + 1) as Step);
      return;
    }
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await createTrialAccount({
        fullName: form.fullName.trim(),
        email: form.email.trim(),
        mobile: form.mobile.replace(/\s/g, ""),
        password: form.password,
        gymName: form.gymName.trim(),
        city: form.city,
        branches: form.branches as BranchRange,
        members: form.members as MemberRange,
      });
      setResult(res);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Your account couldn’t be created. Try again in a moment.");
    } finally {
      setSubmitting(false);
    }
  };

  const recommended = memberOptions.find((m) => m.value === form.members);
  const recommendedTier = pricingTiers.find((t) => t.id === recommended?.tier);

  return (
    <div className="min-h-screen bg-clay-canvas text-clay-ink lg:grid lg:grid-cols-[1.1fr_0.9fr]">
      <div className="flex min-h-screen flex-col px-5 pb-10 pt-[calc(1.5rem+env(safe-area-inset-top,0px))] sm:px-10 lg:px-16">
        <header className="flex items-center justify-between gap-4">
          <Link to="/" aria-label={`${brand.name} home`}>
            <Logo />
          </Link>
          <p className="text-sm text-clay-muted">
            Have an account?{" "}
            <Link to="/login" className="font-semibold text-clay-ink underline decoration-ember-500/70 decoration-2 underline-offset-4">
              Log in
            </Link>
          </p>
        </header>

        <main className="mx-auto flex w-full max-w-[30rem] flex-1 flex-col justify-center py-12">
          {result ? (
            <Success gymName={form.gymName.trim()} trialEndsAt={result.trialEndsAt} />
          ) : (
            <>
              <StepIndicator step={step} />
              <h1 ref={headingRef} tabIndex={-1} className="mt-8 text-h3 font-bold outline-none">
                {step === 0 && "Start your free trial"}
                {step === 1 && "Tell us about your gym"}
                {step === 2 && "How big is your gym?"}
              </h1>
              <p className="mt-3 text-clay-muted">
                {step === 0 && `${brand.trialDays} days with every Growth feature. No card required.`}
                {step === 1 && "We’ll set up your first branch with this. You can add more later."}
                {step === 2 && "This helps us suggest a plan. You won’t be charged during the trial."}
              </p>

              <form ref={formRef} onSubmit={onSubmit} noValidate className="mt-8 space-y-5">
                {step === 0 && (
                  <>
                    <Field
                      label="Full name"
                      name="fullName"
                      autoComplete="name"
                      value={form.fullName}
                      onChange={(v) => update("fullName", v)}
                      error={errors.fullName}
                      placeholder="Neha Kulkarni"
                    />
                    <Field
                      label="Work email"
                      name="email"
                      type="email"
                      autoComplete="email"
                      inputMode="email"
                      value={form.email}
                      onChange={(v) => update("email", v)}
                      error={errors.email}
                      placeholder="neha@pulsestudio.in"
                    />
                    <Field
                      label="Mobile number"
                      name="mobile"
                      type="tel"
                      autoComplete="tel-national"
                      inputMode="numeric"
                      maxLength={11}
                      value={form.mobile}
                      onChange={(v) => update("mobile", v.replace(/[^\d\s]/g, ""))}
                      error={errors.mobile}
                      placeholder="98765 43210"
                      prefix="+91"
                    />
                    <PasswordField value={form.password} onChange={(v) => update("password", v)} error={errors.password} />
                  </>
                )}

                {step === 1 && (
                  <>
                    <Field
                      label="Gym name"
                      name="gymName"
                      autoComplete="organization"
                      value={form.gymName}
                      onChange={(v) => update("gymName", v)}
                      error={errors.gymName}
                      placeholder="Pulse Studio"
                      hint="Members see this in their app and on receipts."
                    />
                    <SelectField
                      label="City"
                      name="city"
                      value={form.city}
                      onChange={(v) => update("city", v)}
                      error={errors.city}
                      options={cities}
                    />
                  </>
                )}

                {step === 2 && (
                  <>
                    <ChoiceGroup
                      legend="Branches"
                      name="branches"
                      options={branchOptions}
                      value={form.branches}
                      onChange={(v) => update("branches", v as BranchRange)}
                      error={errors.branches}
                    />
                    <ChoiceGroup
                      legend="Active members"
                      name="members"
                      options={memberOptions}
                      value={form.members}
                      onChange={(v) => update("members", v as MemberRange)}
                      error={errors.members}
                    />
                    {recommendedTier && (
                      <p className="clay-flat px-4 py-3 text-[0.95rem]" aria-live="polite">
                        <span className="font-semibold">{recommendedTier.name}</span> fits a gym your size.{" "}
                        <span className="text-clay-muted">You’ll choose a plan when the trial ends.</span>
                      </p>
                    )}
                    <div>
                      <label className="flex items-start gap-3 text-[0.9375rem] leading-relaxed">
                        <input
                          type="checkbox"
                          name="terms"
                          checked={form.terms}
                          onChange={(e) => update("terms", e.target.checked)}
                          aria-invalid={!!errors.terms}
                          aria-describedby={errors.terms ? "terms-error" : undefined}
                          className="mt-1 h-4 w-4 shrink-0 accent-ember-500"
                        />
                        <span>
                          I agree to the{" "}
                          <a href="/terms" className="underline underline-offset-4">
                            terms of service
                          </a>{" "}
                          and{" "}
                          <a href="/privacy" className="underline underline-offset-4">
                            privacy policy
                          </a>
                          .
                        </span>
                      </label>
                      {errors.terms && <ErrorText id="terms-error">{errors.terms}</ErrorText>}
                    </div>
                  </>
                )}

                {submitError && (
                  <p role="alert" className="rounded-2xl bg-status-danger-bg px-4 py-3 text-[0.95rem] text-status-danger-fg">
                    {submitError}
                  </p>
                )}

                <div className="flex items-center gap-3 pt-3">
                  {step > 0 && (
                    <Button
                      type="button"
                      variant="clay"
                      size="lg"
                      onClick={() => setStep((s) => (s - 1) as Step)}
                      aria-label="Back to previous step"
                    >
                      <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Back
                    </Button>
                  )}
                  <Button type="submit" variant={step === 2 ? "primary" : "ink"} size="lg" className="flex-1" disabled={submitting}>
                    {submitting ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Creating your gym…
                      </>
                    ) : step === 2 ? (
                      "Create my gym"
                    ) : (
                      "Continue"
                    )}
                  </Button>
                </div>
              </form>
            </>
          )}
        </main>
      </div>

      <SidePanel />
    </div>
  );
}

function StepIndicator({ step }: { step: Step }) {
  return (
    <div>
      <p className="text-sm text-clay-muted">
        Step {step + 1} of 3: <span className="font-semibold text-fg">{stepNames[step]}</span>
      </p>
      <ol className="mt-3 grid grid-cols-3 gap-2" aria-hidden="true">
        {stepNames.map((n, i) => (
          <li key={n} className={cn("h-1.5 rounded-full transition-colors duration-500", i <= step ? "bg-ember-500" : "bg-clay-line")} />
        ))}
      </ol>
    </div>
  );
}

function ErrorText({ id, children }: { id: string; children: ReactNode }) {
  return (
    <p id={id} className="mt-1.5 text-sm text-status-danger-fg">
      {children}
    </p>
  );
}

const inputBase =
  "clay-well h-[3.25rem] w-full !rounded-2xl border-2 px-4 text-base text-clay-ink placeholder:text-clay-subtle transition-colors focus:outline-none focus:ring-2 focus:ring-ember-400";

interface FieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "onChange" | "prefix"> {
  label: string;
  name: string;
  value: string;
  onChange: (v: string) => void;
  error?: string;
  hint?: string;
  prefix?: string;
}

function Field({ label, name, value, onChange, error, hint, prefix, ...rest }: FieldProps) {
  const id = useId();
  const describedBy = [error && `${id}-error`, hint && `${id}-hint`].filter(Boolean).join(" ") || undefined;
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-semibold">
        {label}
      </label>
      <div className="relative">
        {prefix && (
          <span className="pointer-events-none absolute inset-y-0 left-3.5 flex items-center text-[0.9375rem] text-clay-muted">
            {prefix}
          </span>
        )}
        <input
          id={id}
          name={name}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-invalid={!!error}
          aria-describedby={describedBy}
          className={cn(inputBase, prefix && "pl-12", error ? "border-[#E0574B]" : "border-transparent")}
          {...rest}
        />
      </div>
      {hint && !error && (
        <p id={`${id}-hint`} className="mt-1.5 text-sm text-clay-subtle">
          {hint}
        </p>
      )}
      {error && <ErrorText id={`${id}-error`}>{error}</ErrorText>}
    </div>
  );
}

function PasswordField({ value, onChange, error }: { value: string; onChange: (v: string) => void; error?: string }) {
  const id = useId();
  const [show, setShow] = useState(false);
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-semibold">
        Password
      </label>
      <div className="relative">
        <input
          id={id}
          name="password"
          type={show ? "text" : "password"}
          autoComplete="new-password"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-invalid={!!error}
          aria-describedby={error ? `${id}-error` : `${id}-hint`}
          className={cn(inputBase, "pr-12", error ? "border-[#E0574B]" : "border-transparent")}
        />
        <button
          type="button"
          onClick={() => setShow((s) => !s)}
          className="absolute inset-y-0 right-1.5 my-auto grid h-9 w-9 place-items-center rounded-md text-clay-muted hover:text-fg"
          aria-label={show ? "Hide password" : "Show password"}
        >
          {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
      {error ? (
        <ErrorText id={`${id}-error`}>{error}</ErrorText>
      ) : (
        <p id={`${id}-hint`} className="mt-1.5 text-sm text-clay-subtle">
          At least 8 characters, with a letter and a number.
        </p>
      )}
    </div>
  );
}

function SelectField({
  label,
  name,
  value,
  onChange,
  error,
  options,
}: {
  label: string;
  name: string;
  value: string;
  onChange: (v: string) => void;
  error?: string;
  options: string[];
}) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-semibold">
        {label}
      </label>
      <select
        id={id}
        name={name}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={!!error}
        aria-describedby={error ? `${id}-error` : undefined}
        className={cn(inputBase, "appearance-none", !value && "text-clay-subtle", error ? "border-[#E0574B]" : "border-transparent")}
      >
        <option value="" disabled>
          Choose a city
        </option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
      {error && <ErrorText id={`${id}-error`}>{error}</ErrorText>}
    </div>
  );
}

function ChoiceGroup({
  legend,
  name,
  options,
  value,
  onChange,
  error,
}: {
  legend: string;
  name: string;
  options: Array<{ value: string; label: string }>;
  value: string;
  onChange: (v: string) => void;
  error?: string;
}) {
  const id = useId();
  return (
    <fieldset aria-describedby={error ? `${id}-error` : undefined}>
      <legend className="mb-2 text-sm font-semibold">{legend}</legend>
      <div className="grid grid-cols-2 gap-2">
        {options.map((o) => (
          <label
            key={o.value}
            className={cn(
              "press flex h-14 cursor-pointer items-center justify-center !rounded-2xl border px-3 text-[0.95rem] font-semibold has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ember-500",
              value === o.value ? "clay-ember border-transparent" : "clay-flat border-transparent",
            )}
          >
            <input
              type="radio"
              name={name}
              value={o.value}
              checked={value === o.value}
              onChange={() => onChange(o.value)}
              className="sr-only"
            />
            {o.label}
          </label>
        ))}
      </div>
      {error && <ErrorText id={`${id}-error`}>{error}</ErrorText>}
    </fieldset>
  );
}

function Success({ gymName, trialEndsAt }: { gymName: string; trialEndsAt: string }) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => headingRef.current?.focus(), []);
  const ends = new Date(trialEndsAt).toLocaleDateString("en-IN", { day: "numeric", month: "long" });
  const tasks = [
    { label: "Create your account", done: true },
    { label: "Add your branch hours and GST details", done: false },
    { label: "Create membership plans", done: false },
    { label: "Import your members", done: false },
    { label: "Invite your front desk and trainers", done: false },
    { label: "Upload your logo", done: false },
  ];
  return (
    <div>
      <span className="clay-ember grid h-14 w-14 place-items-center rounded-full" aria-hidden="true">
        <Check className="h-6 w-6" />
      </span>
      <h1 ref={headingRef} tabIndex={-1} className="mt-6 text-h3 font-bold outline-none">
        {gymName} is ready.
      </h1>
      <p className="mt-3 text-clay-muted">Your free trial runs until {ends}. Here’s what to set up next.</p>
      <ol className="clay mt-8 divide-y divide-clay-line">
        {tasks.map((t, i) => (
          <li key={t.label} className="flex items-center gap-3 px-4 py-3.5 text-[0.9375rem]">
            <span
              className={cn(
                "grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs font-bold",
                t.done ? "bg-mint-500 text-white" : "border-2 border-clay-line text-clay-subtle",
              )}
            >
              {t.done ? <Check className="h-3.5 w-3.5" aria-label="Done" /> : i + 1}
            </span>
            <span className={cn(t.done && "text-clay-subtle line-through")}>{t.label}</span>
          </li>
        ))}
      </ol>
      <ButtonLink to="/app" variant="primary" size="lg" className="mt-8 w-full">
        Open your dashboard
      </ButtonLink>
    </div>
  );
}

function SidePanel() {
  return (
    <aside className="relative hidden overflow-hidden bg-[linear-gradient(160deg,#FFF1E7_0%,#FFE0CC_50%,#F4F0FF_100%)] lg:flex lg:flex-col lg:justify-center">
      <div aria-hidden="true" className="absolute -right-10 top-16 w-56 rotate-12">
        <Dumbbell className="w-full" />
      </div>
      <div aria-hidden="true" className="absolute bottom-12 right-16 w-32">
        <Kettlebell className="w-full" />
      </div>
      <div className="relative max-w-md p-14">
        <p className="text-[2.75rem] font-bold leading-[1.05] tracking-[-0.03em]">Sign them up. Train them. Track progress. Renew.</p>
        <p className="mt-8 font-semibold">During your trial you can:</p>
        <ul className="mt-4 space-y-3.5 text-clay-muted">
          {["Import your members and their remaining plan balances", "Send GST invoices and take UPI payments", "Give trainers and members their own app, with your logo"].map((t) => (
            <li key={t} className="flex items-start gap-3">
              <span className="clay-ember mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full">
                <Check className="h-3.5 w-3.5" aria-hidden="true" />
              </span>
              {t}
            </li>
          ))}
        </ul>
      </div>
    </aside>
  );
}
