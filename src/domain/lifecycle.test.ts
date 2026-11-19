import { describe, expect, it } from "vitest";
import { applyFreeze, applyUnfreeze, cancelProblem, effectiveStatus, freezeDays, freezeProblem, LIFECYCLE_DEFAULTS as RULES, quoteChange, refundEligibility, unusedCredit } from "@/domain/lifecycle";

const TODAY = "2026-11-17";
// A 30-day Monthly plan that started 10 days ago: 20 days are left.
const monthly = { status: "active" as const, startsOn: "2026-11-07", endsOn: "2026-12-07", freezes: [] as Array<{ from: string; to?: string; reason: string }>, canceledEffectiveOn: undefined as string | undefined, terms: { kind: "time" as const, durationDays: 30, pricePaise: 250_000, taxRateBp: 1800, name: "Monthly", branchIds: [] as string[] } };

describe("freezing", () => {
  it("a freeze is the first to the last day, both counted, and pushes the end date back by that many days", () => {
    expect(freezeDays("2026-11-17", "2026-11-23")).toBe(7);
    const r = applyFreeze(monthly, { from: TODAY, to: "2026-11-23", reason: "Travel" });
    expect(r).toMatchObject({ status: "frozen", endsOn: "2026-12-14", freezes: [{ from: TODAY, to: "2026-11-23", reason: "Travel" }] });
  });

  it("an active membership can be frozen from today for the gym’s days, and nothing else can", () => {
    expect(freezeProblem(monthly, { from: TODAY, to: "2026-11-23" }, TODAY, RULES)).toBeUndefined();
    expect(freezeProblem(monthly, { from: TODAY, to: "2026-11-22" }, TODAY, RULES)).toMatch(/at least 7 days/);
    expect(freezeProblem(monthly, { from: TODAY, to: "2026-12-30" }, TODAY, RULES)).toMatch(/at most 30 days/);
    expect(freezeProblem(monthly, { from: "2026-11-20", to: "2026-11-30" }, TODAY, RULES)).toMatch(/starts today/);
    expect(freezeProblem(monthly, { from: TODAY, to: "2026-11-16" }, TODAY, RULES)).toMatch(/before the first/);
    expect(freezeProblem({ ...monthly, status: "scheduled" }, { from: TODAY, to: "2026-11-30" }, TODAY, RULES)).toMatch(/Only an active/);
    expect(freezeProblem({ ...monthly, status: "expired" }, { from: TODAY, to: "2026-11-30" }, TODAY, RULES)).toMatch(/Only an active/);
  });

  it("a membership already frozen, one being canceled, and one that used its freezes are refused", () => {
    const frozen = { ...monthly, status: "frozen" as const, freezes: [{ from: TODAY, to: "2026-11-30", reason: "x" }] };
    expect(freezeProblem(frozen, { from: TODAY, to: "2026-12-10" }, TODAY, RULES)).toMatch(/already frozen/);
    expect(freezeProblem({ ...monthly, canceledEffectiveOn: "2026-11-30" }, { from: TODAY, to: "2026-11-30" }, TODAY, RULES)).toMatch(/being canceled/);
    const used = { ...monthly, freezes: [{ from: "2026-10-01", to: "2026-10-10", reason: "a" }, { from: "2026-10-20", to: "2026-10-30", reason: "b" }] };
    expect(freezeProblem(used, { from: TODAY, to: "2026-11-30" }, TODAY, RULES)).toMatch(/used its 2 freezes/);
  });

  it("a freeze whose last day has passed has ended; one still running has not", () => {
    const done = { ...monthly, status: "frozen" as const, freezes: [{ from: "2026-11-01", to: "2026-11-10", reason: "x" }] };
    expect(effectiveStatus(done, TODAY)).toBe("active");
    expect(effectiveStatus({ ...done, freezes: [{ from: "2026-11-10", to: "2026-11-20", reason: "x" }] }, TODAY)).toBe("frozen");
    expect(effectiveStatus({ ...done, endsOn: "2026-11-12" }, TODAY)).toBe("expired");
  });

  it("unfreezing early ends the freeze yesterday and gives the unused days back", () => {
    const f = applyFreeze(monthly, { from: "2026-11-17", to: "2026-11-30", reason: "Travel" });
    const r = applyUnfreeze({ freezes: f.freezes, endsOn: f.endsOn }, "2026-11-21");
    expect(r).toMatchObject({ status: "active", unusedDays: 10, endsOn: "2026-12-11" });
    expect(r.freezes[0]).toMatchObject({ from: "2026-11-17", to: "2026-11-20" });
  });
});

describe("proration", () => {
  it("credits the unused days pro rata on the pre-tax price paid, with GST on the credit", () => {
    const c = unusedCredit(monthly, 250_000, TODAY);
    expect(c).toMatchObject({ unusedDays: 20, totalDays: 30, subtotalPaise: 166_666, taxPaise: 30_000, totalPaise: 196_666 });
  });

  it("uses what was actually paid, so a discount is not credited back", () => {
    expect(unusedCredit(monthly, 225_000, TODAY).subtotalPaise).toBe(150_000);
  });

  it("a membership that has just started credits every day, and one that has ended credits none", () => {
    expect(unusedCredit({ ...monthly, startsOn: TODAY, endsOn: "2026-12-17" }, 250_000, TODAY).unusedDays).toBe(30);
    expect(unusedCredit({ ...monthly, endsOn: "2026-11-10" }, 250_000, TODAY)).toMatchObject({ unusedDays: 0, totalPaise: 0 });
  });
});

describe("changing plan", () => {
  const plus = { pricePaise: 350_000, taxRateBp: 1800, kind: "time" as const };

  it("a dearer plan is an upgrade now: its full price, a credit note for the unused days, and the difference to pay", () => {
    const q = quoteChange(monthly, 250_000, plus, TODAY);
    expect(q).toMatchObject({ kind: "upgrade", startsOn: TODAY, duePaise: 413_000 - 196_666 });
    expect(q.newPlan.totalPaise).toBe(413_000);
    expect(q.credit!.totalPaise).toBe(196_666);
  });

  it("a cheaper plan starts when the period ends, with nothing credited or refunded", () => {
    const q = quoteChange({ ...monthly, terms: { ...monthly.terms, pricePaise: 350_000 } }, 350_000, { pricePaise: 250_000, taxRateBp: 1800, kind: "time" }, TODAY);
    expect(q).toMatchObject({ kind: "at_period_end", startsOn: "2026-12-08", duePaise: 295_000 });
    expect(q.credit).toBeUndefined();
    expect(q.reason).toMatch(/cheaper plan starts when this period ends/);
  });

  it("when the credit would cover the new plan, it is not refunded: the plan starts at the period end", () => {
    const q = quoteChange({ ...monthly, startsOn: TODAY, endsOn: "2026-12-17" }, 1_900_000, { pricePaise: 1_950_000, taxRateBp: 1800, kind: "time" }, TODAY);
    expect(q.kind).toBe("upgrade");
    const covers = quoteChange({ ...monthly, terms: { ...monthly.terms, pricePaise: 100_000 }, startsOn: TODAY, endsOn: "2026-12-17" }, 5_000_000, { pricePaise: 300_000, taxRateBp: 1800, kind: "time" }, TODAY);
    expect(covers).toMatchObject({ kind: "at_period_end" });
    expect(covers.reason).toMatch(/covers the new plan/);
  });

  it("a visit pass has no days to credit", () => {
    expect(quoteChange({ ...monthly, terms: { ...monthly.terms, kind: "visit" as never } }, 300_000, plus, TODAY).kind).toBe("at_period_end");
  });
});

describe("cancelling", () => {
  it("a refund ceiling: the unused days pro rata on what was paid with GST, less the fee, never below zero", () => {
    const e = refundEligibility(monthly, 295_000, TODAY, RULES);
    expect(e).toMatchObject({ unusedDays: 20, totalDays: 30, gross: 196_666, fee: 50_000, amountPaise: 146_666 });
    expect(e.explanation).toBe("20 of 30 days unused, less the cancellation fee.");
    expect(refundEligibility(monthly, 295_000, "2026-12-07", RULES).amountPaise).toBe(0);
    expect(refundEligibility(monthly, 0, TODAY, RULES).explanation).toMatch(/Nothing was paid/);
    expect(refundEligibility({ ...monthly, terms: { ...monthly.terms, kind: "visit" as never } }, 300_000, TODAY, RULES)).toMatchObject({ amountPaise: 0 });
    expect(refundEligibility(monthly, 295_000, TODAY, { cancellationFeePaise: 9_000_000 }).amountPaise).toBe(0);
  });

  it("the later the effective date, the less is eligible", () => {
    expect(refundEligibility(monthly, 295_000, "2026-11-27", RULES).amountPaise).toBeLessThan(refundEligibility(monthly, 295_000, TODAY, RULES).amountPaise);
  });

  it("the date must be today or later while the membership runs, with a reason", () => {
    expect(cancelProblem(monthly, "2026-11-30", TODAY, "Moving city")).toBeUndefined();
    expect(cancelProblem(monthly, "2026-11-16", TODAY, "Moving city")).toMatch(/in the past/);
    expect(cancelProblem(monthly, "2027-01-01", TODAY, "Moving city")).toMatch(/after the membership ends/);
    expect(cancelProblem(monthly, "2026-11-30", TODAY, " ")).toMatch(/Say why/);
    expect(cancelProblem({ ...monthly, status: "canceled" }, TODAY, TODAY, "x y z")).toMatch(/already canceled/);
    expect(cancelProblem({ ...monthly, status: "expired" }, TODAY, TODAY, "x y z")).toMatch(/already ended/);
  });

  it("a cancellation takes effect on its date, and access follows the date, not the stored status", () => {
    expect(effectiveStatus({ ...monthly, canceledEffectiveOn: "2026-11-30" }, TODAY)).toBe("active");
    expect(effectiveStatus({ ...monthly, canceledEffectiveOn: "2026-11-30" }, "2026-11-30")).toBe("canceled");
    expect(effectiveStatus({ ...monthly, status: "scheduled", canceledEffectiveOn: "2026-11-01" }, TODAY)).toBe("scheduled");
  });
});
