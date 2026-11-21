import { describe, expect, it } from "vitest";
import { quickStatus } from "@/domain/subscriptionQuick";
import { subscriptionStatus, type SubscriptionFacts } from "@/domain/subscriptionStatus";

describe("the quick answer", () => {
  const today = "2026-11-17";
  const cases: SubscriptionFacts[] = [
    { state: "paid" }, { state: "trial" }, { state: "trial", trialEndsAt: "2026-11-17T10:00:00.000Z" }, { state: "trial", trialEndsAt: "2026-11-22T10:00:00.000Z" }, { state: "trial", trialEndsAt: "2026-11-16T10:00:00.000Z" },
    { state: "past_due", pastDueSince: "2026-11-10" }, { state: "suspended" }, { state: "canceled", canceledOn: "2026-10-01" },
  ];
  it.each(cases)("agrees with the full rules for %j, or leaves it to them", (sub) => {
    const full = subscriptionStatus(sub, "Pulse Fitness", today);
    const quick = quickStatus(sub, today);
    if (quick) expect({ effective: full.effective, access: full.access, banner: full.banner, note: full.note }).toEqual({ effective: quick.effective, access: "full", banner: undefined, note: "" });
    else expect(full.effective === "paid" || full.effective === "trial").toBe(false);
  });
});
