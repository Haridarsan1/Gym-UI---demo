/** The wizard’s draft. It is kept in the browser tab, so a reload or an accidental back doesn’t lose what was typed, and cleared when the member is registered. */
export interface Draft {
  step: number;
  /** One key for this registration, so a double tap or a retry makes one member. */
  key: string;
  details: { name: string; phone: string; email: string; dateOfBirth: string; gender: string; leadSource: string; emergencyName: string; emergencyPhone: string };
  notADuplicate: boolean;
  /** Members who already have this phone number or email, when the desk said it is a different person sharing it. */
  sharesWith: string[];
  consents: { photos: boolean; assessments: boolean; marketing: boolean };
  planId: string;
  startsOn: string;
  trainerId: string;
  trainerOn: string;
  discount: string;
  payNow: boolean;
  method: "cash" | "upi" | "card" | "transfer";
  amount: string;
  reference: string;
}

export const newKey = () => `reg-${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}${Math.random().toString(36).slice(2)}`}`;

export const emptyDraft = (today: string): Draft => ({
  step: 0, key: newKey(), details: { name: "", phone: "", email: "", dateOfBirth: "", gender: "", leadSource: "", emergencyName: "", emergencyPhone: "" }, notADuplicate: false, sharesWith: [],
  consents: { photos: false, assessments: false, marketing: false }, planId: "", startsOn: today, trainerId: "", trainerOn: today, discount: "", payNow: true, method: "cash", amount: "", reference: "",
});

const storeKey = (userId: string) => `ember.newmember.${userId}`;

export function readDraft(userId: string, today: string): Draft {
  try {
    const raw = sessionStorage.getItem(storeKey(userId));
    if (raw) return { ...emptyDraft(today), ...(JSON.parse(raw) as Draft) };
  } catch {
    /* Not remembered. */
  }
  return emptyDraft(today);
}

export function saveDraft(userId: string, d: Draft): void {
  try {
    sessionStorage.setItem(storeKey(userId), JSON.stringify(d));
  } catch {
    /* Not remembered. */
  }
}

export function clearDraft(userId: string): void {
  try {
    sessionStorage.removeItem(storeKey(userId));
  } catch {
    /* Nothing to clear. */
  }
}

export const STEPS = ["Details", "Consent", "Plan", "Trainer", "Payment"] as const;

/** Rupees typed by a person (“2,950”, “2950.50”) as paise, or undefined when it isn’t a number. */
export function rupeesToPaise(s: string): number | undefined {
  const t = s.replace(/[,\s₹]/g, "");
  if (t === "") return 0;
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return undefined;
  return Math.round(Number(t) * 100);
}
