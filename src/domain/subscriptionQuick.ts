import type { SubscriptionFacts } from "@/domain/subscriptionStatus";

/**
 * The common case, answered without the wording of the other cases: a paid gym, or a trial that has not run out, has full access and nothing to say. Every other case returns null and is answered by
 * `subscriptionStatus` (which a gym that is paid up never downloads). A test holds the two to the same answer.
 */
export function quickStatus(sub: SubscriptionFacts, today: string): { effective: "paid" | "trial"; access: "full" } | null {
  if (sub.state === "paid") return { effective: "paid", access: "full" };
  if (sub.state === "trial" && !(sub.trialEndsAt && sub.trialEndsAt.slice(0, 10) < today)) return { effective: "trial", access: "full" };
  return null;
}
