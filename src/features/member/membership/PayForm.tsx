import type { PayMethod } from "@/domain/renewal";
import { cn } from "@/lib/format";

const BANKS = ["HDFC Bank", "ICICI Bank", "State Bank of India", "Axis Bank", "Kotak Mahindra Bank"];
const METHODS: Array<{ value: PayMethod; label: string }> = [
  { value: "upi", label: "UPI" },
  { value: "card", label: "Card" },
  { value: "netbanking", label: "Net banking" },
];

const digits = (s: string) => s.replace(/\D/g, "");
/** The Luhn check every real card number passes, so a typo is caught before the gateway sees it. */
function luhn(n: string): boolean {
  let sum = 0;
  [...n].reverse().forEach((c, i) => {
    let d = Number(c);
    if (i % 2 === 1) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  });
  return sum % 10 === 0;
}

export interface PayFields {
  upi: string;
  card: string;
  expiry: string;
  cvv: string;
  bank: string;
}

/** What is wrong with the details for this method, in words that say how to fix it, or undefined when they are fine. */
export function payErrors(method: PayMethod, f: PayFields, today: string): Partial<Record<keyof PayFields, string>> {
  const e: Partial<Record<keyof PayFields, string>> = {};
  if (method === "upi" && !/^[\w.-]{2,}@[a-z]{2,}$/i.test(f.upi.trim())) e.upi = "Enter a valid UPI ID, like name@okbank.";
  if (method === "card") {
    const n = digits(f.card);
    if (n.length !== 16 || !luhn(n)) e.card = "Enter the 16-digit card number printed on your card.";
    const m = /^(\d{2})\s*\/\s*(\d{2})$/.exec(f.expiry.trim());
    const year = today.slice(2, 4);
    const month = today.slice(5, 7);
    if (!m || Number(m[1]) < 1 || Number(m[1]) > 12 || m[2]! < year || (m[2] === year && m[1]! < month)) e.expiry = "Enter the expiry date as MM/YY, for a card that hasn’t expired.";
    if (!/^\d{3}$/.test(f.cvv)) e.cvv = "Enter the 3-digit security code on the back of your card.";
  }
  if (method === "netbanking" && !f.bank) e.bank = "Choose your bank.";
  return e;
}

const field = "mt-1 h-12 w-full rounded-xl border border-clay-line bg-white px-3 text-base";

/** The simulated gateway’s form. Nothing typed here is sent anywhere or kept: only the method reaches the API. */
export function PayForm({ method, onMethod, fields, onFields, errors, showErrors, demo }: { method: PayMethod; onMethod: (m: PayMethod) => void; fields: PayFields; onFields: (f: PayFields) => void; errors: Partial<Record<keyof PayFields, string>>; showErrors: boolean; demo: boolean }) {
  const set = (k: keyof PayFields) => (e: { target: { value: string } }) => onFields({ ...fields, [k]: e.target.value });
  const err = (k: keyof PayFields) => (showErrors ? errors[k] : undefined);
  const Err = ({ k }: { k: keyof PayFields }) => (err(k) ? <span id={`err-${k}`} className="mt-1 block text-sm text-status-pending-fg">{err(k)}</span> : null);
  const a11y = (k: keyof PayFields) => ({ "aria-invalid": err(k) ? true : undefined, "aria-describedby": err(k) ? `err-${k}` : undefined });

  return (
    <div>
      <div role="radiogroup" aria-label="Pay with" className="grid grid-cols-3 gap-2">
        {METHODS.map((m) => (
          <button key={m.value} type="button" role="radio" aria-checked={method === m.value} onClick={() => onMethod(m.value)} className={cn("min-h-[2.75rem] rounded-xl px-2 text-sm font-semibold", method === m.value ? "bg-clay-ink text-white" : "bg-clay-lavender")}>
            {m.label}
          </button>
        ))}
      </div>
      <div className="mt-3 space-y-3">
        {method === "upi" && (
          <label className="block">
            <span className="text-sm font-semibold">UPI ID</span>
            <input value={fields.upi} onChange={set("upi")} inputMode="email" autoComplete="off" autoCapitalize="none" spellCheck={false} placeholder="name@okbank" className={field} {...a11y("upi")} />
            <Err k="upi" />
          </label>
        )}
        {method === "card" && (
          <>
            <label className="block">
              <span className="text-sm font-semibold">Card number</span>
              <input value={fields.card} onChange={set("card")} inputMode="numeric" autoComplete="off" placeholder="1234 5678 9012 3456" maxLength={23} className={field} {...a11y("card")} />
              <Err k="card" />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="text-sm font-semibold">Expiry (MM/YY)</span>
                <input value={fields.expiry} onChange={set("expiry")} inputMode="numeric" autoComplete="off" placeholder="08/29" maxLength={5} className={field} {...a11y("expiry")} />
                <Err k="expiry" />
              </label>
              <label className="block">
                <span className="text-sm font-semibold">Security code</span>
                <input value={fields.cvv} onChange={set("cvv")} inputMode="numeric" type="password" autoComplete="off" placeholder="123" maxLength={3} className={field} {...a11y("cvv")} />
                <Err k="cvv" />
              </label>
            </div>
          </>
        )}
        {method === "netbanking" && (
          <label className="block">
            <span className="text-sm font-semibold">Your bank</span>
            <select value={fields.bank} onChange={set("bank")} className={field} {...a11y("bank")}>
              <option value="">Choose your bank</option>
              {BANKS.map((b) => (
                <option key={b} value={b}>{b}</option>
              ))}
            </select>
            <Err k="bank" />
          </label>
        )}
      </div>
      {demo && <p className="mt-3 text-sm text-clay-muted">Demo gateway: nothing is charged and these details are not stored.</p>}
    </div>
  );
}
