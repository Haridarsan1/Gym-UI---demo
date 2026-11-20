import { describe, expect, it } from "vitest";
import { describeValue, policyChanges, POLICY_DEFAULTS, POLICY_DEFS, POLICY_GROUPS, validatePolicies, withDefaults, type PolicyKey, type PolicyValues } from "@/domain/policies";

const ctx = { today: "2026-11-17" };
const def = (k: PolicyKey) => POLICY_DEFS.find((d) => d.key === k)!;
const say = (k: PolicyKey, over: Partial<PolicyValues> = {}) => def(k).example({ ...POLICY_DEFAULTS, ...over }, ctx);

describe("every setting has what it needs", () => {
  it("covers every value the gym stores, once, in a group, with an explanation and a live example", () => {
    expect(POLICY_DEFS.map((d) => d.key).sort()).toEqual(Object.keys(POLICY_DEFAULTS).sort());
    expect(new Set(POLICY_DEFS.map((d) => d.key)).size).toBe(POLICY_DEFS.length);
    for (const d of POLICY_DEFS) {
      expect(POLICY_GROUPS.map((g) => g.id), d.key).toContain(d.group);
      expect(d.explain.length, d.key).toBeGreaterThan(30);
      expect(d.example(POLICY_DEFAULTS, ctx).length, d.key).toBeGreaterThan(30);
      expect(d.label, d.key).not.toMatch(/[!]/);
    }
    for (const g of POLICY_GROUPS) expect(POLICY_DEFS.some((d) => d.group === g.id), g.id).toBe(true);
  });

  it("the defaults are valid", () => { expect(validatePolicies(POLICY_DEFAULTS)).toEqual({}); });

  it("an example never says undefined, NaN or an empty date, whatever the numbers", () => {
    for (const d of POLICY_DEFS) {
      for (const v of [POLICY_DEFAULTS, ...(d.input.kind === "number" ? [{ ...POLICY_DEFAULTS, [d.key]: d.input.min }, { ...POLICY_DEFAULTS, [d.key]: d.input.max }] : d.input.kind === "toggle" ? [{ ...POLICY_DEFAULTS, [d.key]: !POLICY_DEFAULTS[d.key] }] : [{ ...POLICY_DEFAULTS, [d.key]: 0 }, { ...POLICY_DEFAULTS, [d.key]: d.input.max }])]) {
        expect(d.example(v as PolicyValues, ctx), `${d.key} ${JSON.stringify((v as PolicyValues)[d.key])}`).not.toMatch(/undefined|NaN|Invalid|null/);
      }
    }
  });
});

describe("the examples are made by the rules the app runs", () => {
  it("booking and sessions", () => {
    expect(say("bookingHorizonDays")).toBe("Today is Tue 17 Nov. Members can book up to Tue 1 Dec.");
    expect(say("bookingHorizonDays", { bookingHorizonDays: 30 })).toBe("Today is Tue 17 Nov. Members can book up to Thu 17 Dec.");
    expect(say("sessionMinutes", { sessionMinutes: 45 })).toBe("A session that starts at 6:00 pm ends at 6:45 pm.");
    expect(say("membersMayChooseTrainer", { membersMayChooseTrainer: true })).toMatch(/choose any trainer/);
  });

  it("free cancellation and what a late cancel does to the credit follow the cutoff", () => {
    expect(say("cancellationCutoffHours")).toBe("A session at 6:00 pm on Fri 20 Nov can be canceled free until 6:00 am Fri 20 Nov. After that it is a late cancel.");
    expect(say("cancellationCutoffHours", { cancellationCutoffHours: 24 })).toMatch(/free until 6:00 pm Thu 19 Nov/);
    expect(say("cancellationCutoffHours", { cancellationCutoffHours: 0 })).toMatch(/right up to the moment it starts/);
    expect(say("lateCancelConsumesCredit")).toBe("A member who cancels the 6:00 pm session at 7:00 am Fri 20 Nov, after the cutoff, uses 1 session credit.");
    expect(say("lateCancelConsumesCredit", { lateCancelConsumesCredit: false })).toMatch(/gets the credit back/);
    expect(say("lateCancelConsumesCredit", { cancellationCutoffHours: 1 })).toMatch(/at 5:59 pm Fri 20 Nov, after the cutoff, uses 1 session credit/);
    expect(say("lateCancelConsumesCredit", { cancellationCutoffHours: 0 })).toMatch(/no late cancel/);
  });

  it("no-shows use the words the trainer is shown", () => {
    expect(say("noShowConsumesCredit")).toMatch(/told “Uses 1 session credit” first/);
    expect(say("noShowConsumesCredit", { noShowConsumesCredit: false })).toMatch(/told “Gives the credit back” first, so a member who doesn’t turn up gets the credit back/);
    expect(say("noShowAfterMinutes", { noShowAfterMinutes: 30 })).toMatch(/No-show from 6:30 pm/);
    expect(say("markWindowHours", { markWindowHours: 24 })).toMatch(/until 6:00 pm Sat 21 Nov/);
  });

  it("streaks: the threshold is rounded up the way the member’s week card does", () => {
    expect(say("streakThresholdPercent")).toBe("With 4 workouts planned in a week, finishing 3 keeps the streak; finishing 2 does not.");
    expect(say("streakThresholdPercent", { streakThresholdPercent: 100 })).toMatch(/finishing 4 keeps the streak; finishing 3 does not/);
    expect(say("streakThresholdPercent", { streakThresholdPercent: 20 })).toBe("With 4 workouts planned in a week, finishing 1 keeps the streak.");
  });

  it("reviews, missed workouts and expiring credits", () => {
    expect(say("reviewCadenceDays")).toMatch(/last reviewed on 7 Nov 2026 is due for the next review on 5 Dec 2026/);
    expect(say("reviewCadenceDays", { reviewCadenceDays: 7 })).toMatch(/already due, since 14 Nov 2026/);
    expect(say("missedWorkoutsWindowDays", { missedWorkoutsWindowDays: 14 })).toBe("Today is 17 Nov, so missed workouts from 3 Nov to 16 Nov are counted.");
    expect(say("creditExpiryWarningDays", { creditExpiryWarningDays: 7 })).toBe("A pack ending on 24 Nov 2026 is listed as expiring today. One ending a day later is not listed yet.");
  });

  it("freezes: the end date moves by the days frozen, and numbers that contradict each other are said so", () => {
    expect(say("freezeMinDays")).toBe("The shortest freeze, 7 days, from today moves a membership that ends on 17 Dec 2026 to 24 Dec 2026.");
    expect(say("freezeMaxDays", { freezeMaxDays: 14 })).toBe("The longest freeze, 14 days, from today moves a membership that ends on 17 Dec 2026 to 31 Dec 2026.");
    expect(say("freezeMinDays", { freezeMinDays: 40 })).toMatch(/isn’t allowed with these numbers: a freeze is at most 30 days/);
    expect(say("maxFreezesPerMembership", { maxFreezesPerMembership: 1 })).toBe("A membership can be frozen once. After that the desk sees “This membership has used its 1 freeze.”");
    expect(say("maxFreezesPerMembership", { maxFreezesPerMembership: 0 })).toBe("Freezing is off: the desk can’t freeze a membership.");
    expect(say("freezeMinDays", { maxFreezesPerMembership: 0 })).toBe("Freezing is off, so no freeze is possible.");
  });

  it("grace: with none the next day is turned away, with days the member is let in to the last of them", () => {
    expect(say("graceDays")).toMatch(/stops letting the member in the next day/);
    expect(say("graceDays", { graceDays: 3 })).toBe("A membership that ends on Thu 17 Dec still lets the member in until Sun 20 Dec. The desk sees “Checked in, membership ended”.");
  });

  it("the cancellation fee comes off what the unused days are worth, never below zero", () => {
    expect(say("cancellationFeePaise")).toMatch(/20 of 30 days left is worth ₹1,966.66 for the unused days, less the ₹500 fee: ₹1,466.66 may be offered back/);
    expect(say("cancellationFeePaise", { cancellationFeePaise: 0 })).toMatch(/less the ₹0 fee: ₹1,966.66/);
    expect(say("cancellationFeePaise", { cancellationFeePaise: 5_000_000 })).toMatch(/less the ₹1,966.66 fee: ₹0 may be offered back/);
  });

  it("payments: part payments on or off, and the next reminder date", () => {
    expect(say("partialPaymentsEnabled")).toBe("On a ₹2,950 invoice the desk takes the full ₹2,950 at once, or the member pays later.");
    expect(say("partialPaymentsEnabled", { partialPaymentsEnabled: true })).toBe("On a ₹2,950 invoice the desk can take ₹1,000 now. It shows Partly paid, with ₹1,950 due.");
    expect(say("reminderGapDays", { reminderGapDays: 7 })).toMatch(/can be sent again from Tue 24 Nov/);
  });

  it("the repeat-scan window: inside it is a repeat, at its edge a new visit", () => {
    expect(say("repeatScanWindowMinutes")).toBe("A member scans in at 6:30 am. A scan at 6:39 am is a repeat and uses no visit; at 6:40 am it is a new visit.");
    expect(say("repeatScanWindowMinutes", { repeatScanWindowMinutes: 30 })).toMatch(/A scan at 6:59 am is a repeat.*at 7:00 am it is a new visit/);
    expect(say("repeatScanWindowMinutes", { repeatScanWindowMinutes: 1 })).toMatch(/A scan at 6:30 am is a repeat/);
  });
});

describe("checking values", () => {
  it("names the setting’s own range", () => {
    expect(validatePolicies({ ...POLICY_DEFAULTS, bookingHorizonDays: 0 }).bookingHorizonDays).toBe("Enter 1 to 60 days.");
    expect(validatePolicies({ ...POLICY_DEFAULTS, repeatScanWindowMinutes: 61 }).repeatScanWindowMinutes).toBe("Enter 1 to 60 minutes.");
    expect(validatePolicies({ ...POLICY_DEFAULTS, graceDays: 1.5 }).graceDays).toBe("Enter a whole number of days.");
    expect(validatePolicies({ ...POLICY_DEFAULTS, cancellationFeePaise: -1 }).cancellationFeePaise).toBe("Enter an amount from ₹0 to ₹50,000.");
    expect(validatePolicies({ ...POLICY_DEFAULTS, freezeMinDays: 40 }).freezeMinDays).toBe("The shortest freeze can’t be longer than the longest. Lower this or raise the longest freeze.");
    expect(validatePolicies({ ...POLICY_DEFAULTS, freezeMinDays: 30, freezeMaxDays: 30 })).toEqual({});
  });

  it("says a change as it was and as it becomes, and nothing for what is unchanged", () => {
    const after = { ...POLICY_DEFAULTS, cancellationCutoffHours: 24, noShowConsumesCredit: false, cancellationFeePaise: 100_000, streakThresholdPercent: 80, sessionMinutes: 1 + 59 };
    expect(policyChanges(POLICY_DEFAULTS, after)).toEqual([
      { key: "cancellationCutoffHours", label: "Free cancellation until", from: "12 hours", to: "24 hours" },
      { key: "noShowConsumesCredit", label: "A no-show uses the credit", from: "Uses the credit", to: "Gives it back" },
      { key: "streakThresholdPercent", label: "A week counts toward the streak at", from: "75%", to: "80%" },
      { key: "cancellationFeePaise", label: "Cancellation fee", from: "₹500", to: "₹1,000" },
    ]);
    expect(policyChanges(POLICY_DEFAULTS, POLICY_DEFAULTS)).toEqual([]);
    expect(describeValue(def("graceDays"), 1)).toBe("1 day");
    expect(describeValue(def("maxFreezesPerMembership"), 1)).toBe("1 freeze");
  });

  it("fills a stored row that predates a setting with the gym’s starting value", () => {
    expect(withDefaults({ cancellationCutoffHours: 6 })).toEqual({ ...POLICY_DEFAULTS, cancellationCutoffHours: 6 });
    expect(withDefaults(undefined)).toEqual(POLICY_DEFAULTS);
  });
});
