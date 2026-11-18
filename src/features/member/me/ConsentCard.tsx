import { isApiError, useSetConsent } from "@/api";
import type { ConsentView } from "@/api";
import { Switch } from "@/design/Switch";
import { useToast } from "@/design/Toast";
import { formatDate } from "@/lib/when";

interface Copy {
  title: string;
  allows: string;
  withdraw: string;
}

/** What each consent allows and what turning it off does, in plain words (S04). */
const COPY: Record<ConsentView["scope"], Copy> = {
  photos: {
    title: "Progress photos",
    allows: "Lets you add progress photos in Progress. Only you and your trainer can see them. The front desk and finance never can. A gym manager can open them only if the gym has switched that on for them, and each time is recorded.",
    withdraw: "Turning this off hides your photos from you and your trainer. They stay saved until you turn it on again or ask for your data to be deleted.",
  },
  assessments: {
    title: "Assessments",
    allows: "Lets your trainer record your starting assessment: training history, what you told them about injuries and limits, measurements and goals. They use it to plan your workouts. The front desk and finance never see it.",
    withdraw: "Turning this off stops your trainer recording or opening your assessment. What is already saved stays saved until you ask for deletion.",
  },
  marketing: {
    title: "Offers and news",
    allows: "Lets the gym email you about offers, events and news. It never changes the messages you need, such as booking confirmations and receipts.",
    withdraw: "Turning this off stops offers and news straight away. You still get what you need to use your membership.",
  },
  data_processing: {
    title: "Using your details to run your membership",
    allows: "The gym stores your details, visits, payments and training records so it can run your membership. This is needed while you are a member.",
    withdraw: "It can’t be turned off here. To have your data removed, ask for deletion under Your data below.",
  },
};

function when(k: ConsentView): string {
  if (k.granted) return k.since ? `Agreed on ${formatDate(k.since)}` : "Agreed";
  if (k.withdrawn && k.since) return `Withdrawn on ${formatDate(k.since)}`;
  return "Not agreed";
}

/** The consents, each a switch with what it allows and what turning it off does. Each change saves at once and is recorded. */
export function ConsentCard({ consents }: { consents: ConsentView[] }) {
  const set = useSetConsent();
  const toast = useToast();
  const change = async (k: ConsentView, granted: boolean) => {
    try {
      await set.mutateAsync({ scope: k.scope as "photos" | "assessments" | "marketing", granted });
      toast({ title: granted ? `${COPY[k.scope].title}: agreed` : `${COPY[k.scope].title}: turned off`, description: "Your choice is saved and recorded.", tone: granted ? "success" : "info" });
    } catch (e) {
      toast({ title: "We couldn’t save that choice", description: isApiError(e) ? e.message : "Check your connection and try again.", tone: "error" });
    }
  };
  return (
    <section id="consent" aria-labelledby="consent-title" className="clay scroll-mt-20 space-y-5 p-5">
      <div>
        <h2 id="consent-title" className="text-lg font-bold">Consent</h2>
        <p className="text-[0.95rem] text-clay-muted">You choose what the gym may do with your photos, assessments and contact. You can change any of it whenever you like.</p>
      </div>
      <ul className="space-y-5">
        {consents.map((k) => (
          <li key={k.scope} className="border-t border-clay-line pt-5 first:border-0 first:pt-0">
            <Switch
              id={`consent-${k.scope}`}
              checked={k.granted}
              disabled={k.required || set.isPending}
              onChange={(next) => void change(k, next)}
              label={COPY[k.scope].title}
              description={COPY[k.scope].allows}
            />
            <p className="mt-2 text-sm font-semibold">{k.required ? "Required. " : ""}{when(k)}</p>
            <p className="text-sm text-clay-muted">{COPY[k.scope].withdraw}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
