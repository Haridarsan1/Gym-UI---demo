const inr = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });

/** ₹2,48,600 — Indian digit grouping. */
export function formatINR(value: number): string {
  return `₹${inr.format(Math.round(value))}`;
}

/** 2,48,600 without the symbol. */
export function formatIndian(value: number): string {
  return inr.format(Math.round(value));
}

export function cn(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
}
