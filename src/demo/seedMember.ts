import { BRANCH, TENANT_ID } from "@/app/demoAccounts";
import { invoiceTotals, placeOfSupplyFor } from "@/domain/billing";
import { addDays, istDateTime } from "@/domain/dates";
import type { Booking, Branch, CheckIn, CreditLedgerEntry, Invoice, Member, Membership, MembershipPlan, Payment } from "@/domain/types";
import { PERSONAS } from "@/demo/personas";
import type { Rng } from "@/demo/rng";
import { personaMemberships, personaOutline } from "@/demo/seedPlans";

/**
 * Billing and activity for the four sample members: check-ins, invoices, payments and Arjun’s personal-training pack. Everything is relative to today, so the sample
 * gym always looks current. Their workouts, goals, reviews and the like are `seedTraining.ts`, loaded only by the member and trainer apps.
 */

export interface MemberSeedInput {
  today: string;
  r: Rng;
  branches: Pick<Branch, "id" | "stateCode">[];
  members: Member[];
  memberships: Membership[];
  membershipPlans: MembershipPlan[];
  deskFor: (branchId: string) => string;
}

export interface MemberSeed {
  bookings: Booking[];
  checkIns: CheckIn[];
  invoices: Invoice[];
  payments: Payment[];
  creditLedger: CreditLedgerEntry[];
}

export function buildMemberData(input: MemberSeedInput): MemberSeed {
  const { today, r, branches, memberships, membershipPlans, deskFor } = input;
  const at = (date: string, time: string) => istDateTime(date, time);
  const branchStates = new Map(branches.map((b) => [b.id, b.stateCode]));
  const planName = new Map(membershipPlans.map((p) => [p.id, p.name]));
  const out: MemberSeed = { bookings: [], checkIns: [], invoices: [], payments: [], creditLedger: [] };
  let invoiceNo = 1;

  for (const persona of PERSONAS) {
    const { mine, current } = personaMemberships(persona, memberships);
    const memberUser = persona.userId;
    const desk = deskFor(persona.branchId);
    const outline = personaOutline(persona, memberships, today);

    // ── Check-ins ───────────────────────────────────────────────────────────────────────────────────
    const coverFor = (date: string) => mine.find((m) => m.startsOn <= date && (m.endsOn ?? date) >= date) ?? current;
    const checkInDates = persona.memberId === "mem_sneha" ? [-30, -27, -22, -18, -9, -4].map((d) => addDays(today, d)) : outline.filter((o) => o.status !== "skipped").map((o) => o.date);
    for (const date of checkInDates) {
      const log = outline.find((o) => o.date === date);
      const m = coverFor(date);
      out.checkIns.push({
        id: `ci_${persona.memberId}_${date}`, tenantId: TENANT_ID, memberId: persona.memberId, branchId: persona.branchId, membershipId: m.id,
        at: log ? new Date(Date.parse(at(date, log.evening ? "18:30" : "06:45")) - 8 * 60_000).toISOString() : at(date, "07:00"), method: "qr", result: "allowed", visitDebited: persona.memberId === "mem_sneha", recordedBy: desk,
      });
    }


    // ── Invoices and payments: one per membership, paid, plus a few specials ────────────────────────
    const invoiceFor = (m: Membership | null, description: string, unitPaise: number, quantity: number, issuedOn: string, dueOn: string, opts: { place?: string; method?: Payment["method"]; paid?: boolean; purpose?: Invoice["purpose"] } = {}) => {
      const lines = [{ description, quantity, unitPaise, taxRateBp: 1800 }];
      const totals = invoiceTotals(lines);
      const n = invoiceNo++;
      const inv: Invoice = {
        id: `inv_${String(n).padStart(4, "0")}`, tenantId: TENANT_ID, number: `INV-2026-${String(n).padStart(4, "0")}`, memberId: persona.memberId, membershipId: m?.id, branchId: persona.branchId,
        placeOfSupply: placeOfSupplyFor(branchStates.get(persona.branchId)!), issuedOn, dueOn, lines, ...totals, status: opts.paid === false ? "open" : "paid", ...(opts.purpose ? { purpose: opts.purpose } : {}), createdAt: at(issuedOn, "10:00"),
      };
      out.invoices.push(inv);
      if (opts.paid !== false) {
        const method = opts.method ?? "upi";
        out.payments.push({
          id: `pay_${String(n).padStart(4, "0")}`, tenantId: TENANT_ID, invoiceId: inv.id, memberId: persona.memberId, branchId: persona.branchId, method, amountPaise: totals.totalPaise, status: "succeeded",
          receivedAt: at(issuedOn, "10:15"), receivedBy: method === "upi" || method === "online" ? undefined : desk, receiptNumber: `RCP-2026-${String(n).padStart(4, "0")}`,
          reference: method === "upi" ? `UPI${r.int(100000000000, 999999999999)}` : undefined, gatewayEventId: method === "upi" ? `gw_evt_${persona.memberId}_${n}` : undefined,
          idempotencyKey: `seed-pay-${persona.memberId}-${n}`, reconciliation: { status: "matched" },
        });
      }
      return inv;
    };
    for (const m of mine) {
      invoiceFor(m, `${planName.get(m.planId)} membership`, m.terms.pricePaise, 1, m.startsOn, addDays(m.startsOn, 3), { method: persona.memberId === "mem_priya" && m !== current ? "cash" : "upi" });
    }
    if (persona.memberId === "mem_priya") {
      // The next month’s invoice has been sent and its due date has passed: ₹2,950 overdue by four days.
      invoiceFor(null, "Monthly membership renewal", 250_000, 1, addDays(today, -14), addDays(today, -4), { paid: false, purpose: { kind: "renewal", planId: persona.planId } });
    }

    // ── Training credits and bookings (Arjun’s personal-training pack) ──────────────────────────────
    if (persona.memberId === "mem_arjun") {
      invoiceFor(current, "Personal training: 8 sessions", 80_000, 8, addDays(today, -35), addDays(today, -32), { method: "cash" });
      const entry = (id: string, kind: CreditLedgerEntry["kind"], date: string, extra: Partial<CreditLedgerEntry> = {}): void => {
        out.creditLedger.push({ id: `cr_arjun_${id}`, tenantId: TENANT_ID, memberId: "mem_arjun", membershipId: current.id, kind, credits: 1, createdBy: kind === "purchase" ? desk : memberUser, createdAt: at(date, "09:00"), idempotencyKey: `seed-credit-arjun-${id}`, ...extra });
      };
      out.creditLedger.push({ id: "cr_arjun_purchase", tenantId: TENANT_ID, memberId: "mem_arjun", membershipId: current.id, kind: "purchase", credits: 8, expiresOn: addDays(today, 150), createdBy: desk, createdAt: at(addDays(today, -35), "10:20"), idempotencyKey: "seed-credit-arjun-purchase" });
      const booking = (id: string, date: string, start: string, end: string, status: Booking["status"]): void => {
        const reservation = `cr_arjun_res_${id}`;
        out.bookings.push({
          id: `bk_arjun_${id}`, tenantId: TENANT_ID, memberId: "mem_arjun", branchId: BRANCH.andheri, kind: "pt_session", trainerId: "u_trainer_meera", startsAt: at(date, start), endsAt: at(date, end), status,
          creditEntryId: reservation, createdBy: memberUser, createdAt: at(addDays(date, -3), "09:00"), idempotencyKey: `seed-booking-arjun-${id}`,
          // A canceled booking gives its slot back, so it has no slot key.
          ...(status === "canceled" ? { canceledAt: at(addDays(date, -1), "09:00"), cancelReason: "Canceled by member" } : { slotKey: `u_trainer_meera|${date}T${start}` }),
        });
        entry(`res_${id}`, "reservation", addDays(date, -3), { bookingId: `bk_arjun_${id}` });
        // Attended and no-show sessions both use the credit. A cancellation in time gives it back.
        if (status === "attended" || status === "no_show") entry(`con_${id}`, "consumption", date, { bookingId: `bk_arjun_${id}`, refEntryId: reservation, createdBy: "u_trainer_meera" });
        if (status === "canceled") entry(`rel_${id}`, "release", addDays(date, -1), { bookingId: `bk_arjun_${id}`, refEntryId: reservation, createdBy: memberUser });
      };
      booking("1", addDays(today, -20), "07:00", "08:00", "attended");
      booking("4", addDays(today, -10), "07:00", "08:00", "canceled");
      booking("2", addDays(today, -6), "18:00", "19:00", "no_show");
      booking("3", addDays(today, 2), "18:00", "19:00", "booked");
    }
    if (persona.memberId === "mem_sneha") invoiceFor(current, "10-visit pass", 300_000, 1, current.startsOn, addDays(current.startsOn, 3), { method: "upi" });
  }
  return out;
}
