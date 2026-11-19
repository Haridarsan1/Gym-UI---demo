/** CSV for the finance exports (O06). Quotes what needs quoting, and defuses cells a spreadsheet would run as a formula. */

const needsQuote = /[",\r\n]/;

export function csvCell(value: string | number | null | undefined): string {
  let s = value === null || value === undefined ? "" : String(value);
  if (typeof value === "string" && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return needsQuote.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export const toCsv = (header: string[], rows: Array<Array<string | number | null | undefined>>): string => [header, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";

/** Rupees with two decimals and no symbol or grouping, which spreadsheets read as a number. */
export const rupeesCell = (paise: number): string => (paise / 100).toFixed(2);
