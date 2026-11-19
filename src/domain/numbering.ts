/**
 * GST document numbers (M03). A number is consecutive and unique within an Indian financial year (April to March), for each series, and
 * at most 16 characters. A series is a branch’s invoices, or a branch’s credit notes. Gaps are never allowed: a void invoice keeps its number.
 *
 *   invoice      PFAND/26-27/0001    prefix of the branch (up to 5 characters), the financial year, a four-digit sequence = 16 characters
 *   credit note  CNAND/26-27/0001    “CN” followed by the branch part of the prefix, its own series
 *
 * “Invoice numbering format to be confirmed with the gym’s accountant” is in the decisions in docs/PLAN.md.
 */

export const MAX_NUMBER_LENGTH = 16;
export type SeriesKind = "invoice" | "credit_note";

/** “26-27” for any date from 1 April 2026 to 31 March 2027. */
export function financialYear(date: string): string {
  const y = Number(date.slice(0, 4));
  const m = Number(date.slice(5, 7));
  const start = m >= 4 ? y : y - 1;
  const two = (n: number) => String(n % 100).padStart(2, "0");
  return `${two(start)}-${two(start + 1)}`;
}

/** The series prefix for a branch’s documents: its invoice prefix, or “CN” plus the part after the first two letters for credit notes. */
export function prefixFor(kind: SeriesKind, invoicePrefix: string): string {
  return kind === "invoice" ? invoicePrefix : `CN${invoicePrefix.slice(2)}`;
}

/** Is this a prefix we can number with? Capital letters and digits, 3 to 5 characters, so the whole number fits in 16. */
export const validPrefix = (p: string): boolean => /^[A-Z0-9]{3,5}$/.test(p);

export function formatNumber(prefix: string, fy: string, sequence: number): string {
  if (!validPrefix(prefix)) throw new Error(`“${prefix}” can’t be used as a document prefix. Use 3 to 5 capital letters or digits.`);
  if (!Number.isInteger(sequence) || sequence < 1 || sequence > 9999) throw new Error("A series holds 9,999 documents a year. Ask for a longer series.");
  const n = `${prefix}/${fy}/${String(sequence).padStart(4, "0")}`;
  if (n.length > MAX_NUMBER_LENGTH) throw new Error(`${n} is longer than ${MAX_NUMBER_LENGTH} characters.`);
  return n;
}

/** The key of a series’ counter: gym, prefix and financial year. */
export const seriesKey = (tenantId: string, prefix: string, fy: string): string => `${tenantId}|${prefix}|${fy}`;
