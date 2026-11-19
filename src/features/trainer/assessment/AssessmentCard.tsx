import { useState } from "react";
import { ShieldAlert } from "lucide-react";
import type { AssessmentRecord, AssessmentView } from "@/api/assessments";
import { useSaveAssessment } from "@/api/trainerHooks";
import { isApiError } from "@/api/errors";
import { Button3D } from "@/design/Button3D";
import { useToast } from "@/design/Toast";
import { EXPERIENCE_LABEL, TIME_LABEL, WEEKDAYS } from "@/domain/goals";
import { formatDate } from "@/lib/when";
import { Field, NumberInput, ToggleChips, inputClass } from "@/features/trainer/assessment/fields";

/** The assessment form (T02), or why there isn’t one: the member has not agreed, or has withdrawn their consent. */
export function AssessmentCard({ v }: { v: AssessmentView }) {
  if (v.state === "consent_withdrawn") {
    return (
      <section aria-labelledby="as-title" className="clay p-4">
        <h2 id="as-title" className="text-lg font-bold">Assessment</h2>
        <div role="status" className="mt-3 flex gap-3 rounded-2xl bg-status-pending-bg p-4 text-status-pending-fg">
          <ShieldAlert className="h-6 w-6 shrink-0" aria-hidden="true" />
          <div>
            <p className="font-bold">Assessment consent withdrawn</p>
            <p className="mt-1 text-[0.95rem]">
              {v.firstName} turned off assessments{v.consentChangedOn ? ` on ${formatDate(v.consentChangedOn)}` : ""}. Earlier assessments are hidden from everyone at the gym, you included, and a new one can’t be recorded. The records are kept until the retention period ends or {v.firstName} asks for them to be deleted. Goals are not part of this and stay as they are.
            </p>
          </div>
        </div>
      </section>
    );
  }
  if (v.state === "no_consent") {
    return (
      <section aria-labelledby="as-title" className="clay p-4">
        <h2 id="as-title" className="text-lg font-bold">Assessment</h2>
        <p role="status" className="mt-3 rounded-2xl bg-clay-lavender p-4 text-[0.95rem]">
          <span className="font-bold">{v.firstName} hasn’t agreed to assessments.</span> Ask them to turn it on under Profile, in their app, or ask the front desk to record it. Until then no assessment can be recorded or read.
        </p>
      </section>
    );
  }
  return <Form v={v} />;
}

function Form({ v }: { v: AssessmentView }) {
  const latest: AssessmentRecord | undefined = v.assessments[0];
  const save = useSaveAssessment();
  const toast = useToast();
  const [experience, setExperience] = useState<keyof typeof EXPERIENCE_LABEL>(latest?.experience ?? "new");
  const [years, setYears] = useState<number | undefined>(latest?.yearsTraining);
  const [days, setDays] = useState<number[]>(latest?.availability.days ?? []);
  const [time, setTime] = useState<keyof typeof TIME_LABEL>(latest?.availability.time ?? "any");
  const [preferences, setPreferences] = useState(latest?.preferences ?? "");
  const [restrictions, setRestrictions] = useState(latest?.restrictions ?? "");
  const [weight, setWeight] = useState(latest?.baseline.weightKg);
  const [fat, setFat] = useState(latest?.baseline.bodyFatPct);
  const [waist, setWaist] = useState(latest?.baseline.waistCm);
  const [hr, setHr] = useState(latest?.baseline.restingHr);
  const [error, setError] = useState<string>();

  const submit = () => {
    setError(undefined);
    save.mutate(
      { memberId: v.memberId, experience, yearsTraining: years, availability: { days, time }, preferences, restrictions, baseline: { weightKg: weight, bodyFatPct: fat, waistCm: waist, restingHr: hr } },
      {
        onSuccess: () => toast({ title: "Assessment recorded", description: `${v.firstName}’s earlier assessments are kept.`, tone: "success" }),
        onError: (e) => setError(isApiError(e) ? e.message : "We couldn’t save that. Check your connection and try again."),
      },
    );
  };
  return (
    <section aria-labelledby="as-title" className="clay p-4">
      <h2 id="as-title" className="text-lg font-bold">{latest ? "Record a new assessment" : "Record the first assessment"}</h2>
      <p className="text-sm text-clay-muted">
        {latest ? `Starts from the one on ${formatDate(latest.recordedOn)}. Saving adds a new record and keeps the old ones.` : "Training background, availability and a baseline. Everything here is optional except the days."} Only you and {v.firstName} can read it.
      </p>
      <form
        className="mt-4 space-y-5"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <Field label="Training experience">
          <ToggleChips label="Training experience" options={(Object.keys(EXPERIENCE_LABEL) as Array<keyof typeof EXPERIENCE_LABEL>).map((k) => ({ value: k, label: EXPERIENCE_LABEL[k] }))} value={[experience]} onChange={([x]) => x && setExperience(x)} />
        </Field>
        {experience !== "new" && (
          <Field label="Years of training" htmlFor="as-years">
            <NumberInput id="as-years" value={years} onChange={setYears} step={0.5} min={0} max={80} suffix="years" />
          </Field>
        )}
        <Field label="Days they can train" hint="Pick every day that works.">
          <ToggleChips label="Days they can train" multiple options={WEEKDAYS.map((d) => ({ value: d.n, label: d.label }))} value={days} onChange={setDays} />
        </Field>
        <Field label="Time of day">
          <ToggleChips label="Time of day" options={(Object.keys(TIME_LABEL) as Array<keyof typeof TIME_LABEL>).map((k) => ({ value: k, label: TIME_LABEL[k] }))} value={[time]} onChange={([x]) => x && setTime(x)} />
        </Field>
        <Field label="Preferences" htmlFor="as-pref" hint="What they enjoy, what they avoid, the equipment they like.">
          <textarea id="as-pref" rows={2} value={preferences} onChange={(e) => setPreferences(e.target.value)} className={inputClass + " py-2"} />
        </Field>
        <Field label="Restrictions the client reported" htmlFor="as-rest" hint="Injuries or conditions to work around, in their words. Sensitive: leave empty if there are none.">
          <textarea id="as-rest" rows={2} value={restrictions} onChange={(e) => setRestrictions(e.target.value)} className={inputClass + " py-2"} />
        </Field>
        <fieldset>
          <legend className="text-sm font-semibold">Baseline measurements</legend>
          <div className="mt-1 grid gap-3 sm:grid-cols-2">
            <Field label="Weight" htmlFor="as-w"><NumberInput id="as-w" value={weight} onChange={setWeight} suffix="kg" /></Field>
            <Field label="Body fat" htmlFor="as-f"><NumberInput id="as-f" value={fat} onChange={setFat} suffix="%" /></Field>
            <Field label="Waist" htmlFor="as-wa"><NumberInput id="as-wa" value={waist} onChange={setWaist} suffix="cm" /></Field>
            <Field label="Resting heart rate" htmlFor="as-h"><NumberInput id="as-h" value={hr} onChange={setHr} step={1} suffix="bpm" /></Field>
          </div>
        </fieldset>
        {error && <p role="alert" className="rounded-2xl bg-status-danger-bg p-3 text-sm font-semibold text-status-danger-fg">{error}</p>}
        <Button3D type="submit" size="lg" className="w-full sm:w-auto" disabled={save.isPending}>
          {save.isPending ? "Saving…" : "Record assessment"}
        </Button3D>
      </form>
    </section>
  );
}

/** Earlier assessments, newest first, each with who recorded it. */
export function HistoryCard({ v }: { v: AssessmentView }) {
  return (
    <section aria-labelledby="hs-title" className="clay p-4">
      <h2 id="hs-title" className="text-lg font-bold">Assessment history</h2>
      {v.state !== "recorded" ? (
        <p className="mt-2 text-[0.95rem] text-clay-muted">{v.state === "none" ? "Nothing recorded yet." : "Hidden while consent is off."}</p>
      ) : (
        <ol aria-label="Assessments" className="mt-2 space-y-2">
          {v.assessments.map((a, i) => (
            <li key={a.id} className="rounded-2xl bg-clay-canvas px-3 py-2.5 text-[0.95rem]">
              <p className="font-semibold">{formatDate(a.recordedOn)}{i === 0 ? " (current)" : ""}</p>
              <p className="text-sm text-clay-muted">By {a.recordedByName}. {EXPERIENCE_LABEL[a.experience]}{a.yearsTraining ? `, ${a.yearsTraining} years` : ""}.</p>
              <p className="text-sm text-clay-muted">
                {[a.baseline.weightKg && `${a.baseline.weightKg} kg`, a.baseline.bodyFatPct && `${a.baseline.bodyFatPct}% body fat`, a.baseline.waistCm && `${a.baseline.waistCm} cm waist`, a.baseline.restingHr && `${a.baseline.restingHr} bpm`].filter(Boolean).join(", ") || "No baseline recorded"}
              </p>
              {a.restrictions && <p className="mt-1 text-sm">Restrictions: {a.restrictions}</p>}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
