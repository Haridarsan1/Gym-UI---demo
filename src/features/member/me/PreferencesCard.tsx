import { isApiError, useSaveSettings } from "@/api";
import type { ProfileData } from "@/api";
import { setHapticsEnabled } from "@/design/haptics";
import { Switch } from "@/design/Switch";
import { useToast } from "@/design/Toast";

const MESSAGES = [
  { key: "bookingReminders" as const, label: "Booking confirmations and reminders", description: "A confirmation when you book, move or cancel a session, and a reminder before it." },
  { key: "workoutUpdates" as const, label: "Workout updates", description: "When your trainer publishes or changes your plan, or shares a review with you." },
  { key: "renewalReminders" as const, label: "Renewal and payment reminders", description: "Before your membership ends, and when a payment is due." },
  { key: "inactivityPrompts" as const, label: "A nudge after a quiet spell", description: "A short note if you haven’t trained for a while." },
];

/** Which emails the member gets (O04), and whether their phone buzzes. Each choice saves at once. */
export function PreferencesCard({ p }: { p: ProfileData }) {
  const save = useSaveSettings();
  const toast = useToast();
  const apply = async (input: Parameters<typeof save.mutateAsync>[0], done: string) => {
    try {
      await save.mutateAsync(input);
      toast({ title: done, tone: "success" });
    } catch (e) {
      toast({ title: "We couldn’t save that", description: isApiError(e) ? e.message : "Check your connection and try again.", tone: "error" });
    }
  };
  return (
    <>
      <section aria-labelledby="messages-title" className="clay-flat space-y-5 p-5">
        <div>
          <h2 id="messages-title" className="text-lg font-bold">Emails we send you</h2>
          <p className="text-[0.95rem] text-clay-muted">
            {p.email ? `We only contact you by email, at ${p.email}.` : "We only contact you by email, and there is no email address on your account. Ask the front desk to add one."}
          </p>
        </div>
        <ul className="space-y-5">
          {MESSAGES.map((m) => (
            <li key={m.key}>
              <Switch id={`msg-${m.key}`} checked={p.messages[m.key]} disabled={save.isPending} onChange={(next) => void apply({ messages: { [m.key]: next } }, `${m.label}: ${next ? "on" : "off"}`)} label={m.label} description={m.description} />
            </li>
          ))}
        </ul>
        <p className="text-sm text-clay-muted">Receipts and payment confirmations always come to you, because they are your records. Offers and news are under Consent.</p>
      </section>

      <section aria-labelledby="device-title" className="clay-flat space-y-3 p-5">
        <h2 id="device-title" className="text-lg font-bold">On this phone</h2>
        <Switch
          id="haptics"
          checked={p.hapticsOn}
          disabled={save.isPending}
          onChange={(next) => {
            setHapticsEnabled(next);
            void apply({ hapticsOn: next }, `Vibration: ${next ? "on" : "off"}`);
          }}
          label="Vibration"
          description="A short buzz when you log a set, set a record or check in. It works on Android phones."
        />
      </section>
    </>
  );
}
