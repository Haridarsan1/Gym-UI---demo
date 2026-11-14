import type { ReactNode } from "react";
import { Lock, Mail } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { CheckInHeatmap } from "@/components/screens/Screens";
import { cn, formatINR } from "@/lib/format";

function Tile({ title, body, children, className, tone = "white" }: { title: string; body: string; children?: ReactNode; className?: string; tone?: "white" | "ember" | "lilac" | "mint" }) {
  const toneCls = { white: "clay", ember: "clay-ember rounded-clay", lilac: "clay-lilac rounded-clay", mint: "clay-mint rounded-clay" }[tone];
  const muted = tone === "white" ? "text-clay-muted" : "opacity-85";
  return (
    <article className={cn("press flex flex-col overflow-hidden p-6 sm:p-7", toneCls, className)}>
      <h3 className="text-xl font-bold">{title}</h3>
      <p className={cn("mt-2 max-w-[32rem] text-[0.98rem] leading-relaxed", muted)}>{body}</p>
      {children && <div className="mt-7 flex flex-1 items-end">{children}</div>}
    </article>
  );
}

function Invoice() {
  const lines = [
    { label: "Monthly Plus, December", amount: 2500 },
    { label: "8 personal training sessions", amount: 9600 },
    { label: "Referral discount", amount: -500 },
  ];
  const sub = lines.reduce((s, l) => s + l.amount, 0);
  const gst = sub * 0.18;
  return (
    <div className="w-full rounded-3xl bg-white/95 p-4 text-[0.82rem] text-clay-ink shadow-[0_14px_30px_-16px_rgba(122,39,0,0.5)]">
      <div className="flex items-center justify-between">
        <span className="font-semibold">INV-2026-0418</span>
        <span className="rounded-full border-[1.5px] border-mint-500 px-2 text-[0.7rem] font-semibold text-mint-700">Paid</span>
      </div>
      <dl className="mt-3 space-y-1.5 text-clay-muted">
        {lines.map((l) => (
          <div key={l.label} className="flex justify-between gap-3">
            <dt>{l.label}</dt>
            <dd className="tabular">{l.amount < 0 ? `−${formatINR(-l.amount)}` : formatINR(l.amount)}</dd>
          </div>
        ))}
        <div className="flex justify-between">
          <dt>CGST 9% and SGST 9%</dt>
          <dd className="tabular">{formatINR(gst)}</dd>
        </div>
      </dl>
      <div className="mt-3 flex items-end justify-between border-t border-clay-line pt-3">
        <span className="text-clay-muted">Paid by UPI</span>
        <span className="font-display text-3xl font-extrabold tabular text-ember-600">{formatINR(sub + gst)}</span>
      </div>
    </div>
  );
}

function Versions() {
  const v = [
    { n: 3, when: "4 Nov", note: "Heavier pulls, deload week 4", current: true },
    { n: 2, when: "7 Oct", note: "Added Saturday conditioning" },
    { n: 1, when: "9 Sep", note: "Baseline block" },
  ];
  return (
    <ol className="w-full space-y-2">
      {v.map((x) => (
        <li key={x.n} className={cn("flex items-center gap-3 rounded-2xl px-3.5 py-2.5 text-[0.85rem]", x.current ? "bg-white text-lilac-700 shadow-[0_10px_20px_-12px_rgba(43,22,120,0.6)]" : "bg-white/20")}>
          <span className="font-display text-xl font-extrabold">v{x.n}</span>
          <span className="flex-1">{x.note}</span>
          <span className="opacity-70">{x.when}</span>
        </li>
      ))}
    </ol>
  );
}

function Ledger() {
  return (
    <div className="w-full">
      <div className="flex gap-1.5" aria-hidden="true">
        {Array.from({ length: 8 }, (_, i) => (
          <span
            key={i}
            className={cn(
              "h-11 flex-1 rounded-xl",
              i < 2 && "bg-clay-line",
              i === 2 && "border-2 border-dashed border-ember-400 bg-ember-50",
              i > 2 && "clay-ember !rounded-xl",
            )}
          />
        ))}
      </div>
      <div className="mt-3 flex justify-between text-[0.82rem] text-clay-muted">
        <span>2 used</span>
        <span className="text-ember-600">1 reserved for tomorrow</span>
        <span className="font-semibold text-clay-ink">5 left</span>
      </div>
    </div>
  );
}

export function Features() {
  return (
    <section id="features" aria-labelledby="features-title" className="bg-[#F4F0FF] py-24 lg:py-32">
      <Container>
        <SectionHeader
          id="features-title"
          title="What’s included"
          intro="The tools your owners, front desk and trainers will use every day, set up for Indian gyms: GST invoices, UPI payments and prices in rupees."
        />
        <div className="mt-14 grid gap-5 md:grid-cols-6">
          <Tile className="md:col-span-4" title="Check-in report" body="See which days and hours are busiest, so you can plan staff shifts and quiet-hour offers.">
            <div className="w-full overflow-x-auto no-scrollbar">
              <div className="min-w-[30rem]">
                <CheckInHeatmap />
              </div>
            </div>
          </Tile>
          <Tile tone="ember" className="md:col-span-2" title="GST invoices and payments" body="Taxes and discounts are added automatically. Record UPI, card, cash or bank transfer, and part payments if you allow them.">
            <Invoice />
          </Tile>
          <Tile tone="lilac" className="md:col-span-2" title="Workout plans" body="When a trainer changes a plan, it’s saved as a new version. Past workouts keep their original targets.">
            <Versions />
          </Tile>
          <Tile className="md:col-span-2" title="Personal training credits" body="Purchases, bookings, cancellations, no-shows and refunds all update the member’s session balance.">
            <Ledger />
          </Tile>
          <Tile tone="mint" className="md:col-span-2" title="Email reminders" body="Members get emails about renewals, payments due, bookings and new workouts.">
            <div className="w-full rounded-3xl bg-white/95 p-4 text-[0.82rem] text-clay-ink shadow-[0_14px_30px_-16px_rgba(11,74,51,0.45)]">
              <p className="flex items-center gap-2 text-clay-subtle">
                <Mail className="h-4 w-4" aria-hidden="true" /> To priya.sharma@gmail.com
              </p>
              <p className="mt-2 font-semibold">Your membership renews on 2 December</p>
              <p className="mt-1 text-clay-muted">Renew now to keep your 7 am slot with Coach Meera.</p>
            </div>
          </Tile>
          <Tile
            className="md:col-span-6"
            title="Access control and data security"
            body="Front desk staff can take payments but can’t see assessments. Trainers only see their own clients. Progress photos are stored only with the member’s consent. Refunds, overrides and permission changes are logged with who made them and why."
          >
            <div className="flex w-full flex-wrap gap-2.5">
              {["Separate data for every gym", "Branch-level permissions", "Photo consent", "Audit log", "Encrypted, with daily backups"].map((t) => (
                <span key={t} className="clay-flat inline-flex items-center gap-2 !rounded-full px-4 py-2 text-sm font-medium">
                  <Lock className="h-3.5 w-3.5 text-ember-500" aria-hidden="true" /> {t}
                </span>
              ))}
            </div>
          </Tile>
        </div>
      </Container>
    </section>
  );
}
