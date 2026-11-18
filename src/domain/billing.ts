import type { Invoice, InvoiceLine, Payment } from "@/domain/types";

/** SAC code for gym and fitness services, shown on tax receipts. */
export const SAC_FITNESS = "999723";

const lineBase = (l: Pick<InvoiceLine, "quantity" | "unitPaise">) => l.quantity * l.unitPaise;

export interface InvoiceTotals {
  subtotalPaise: number;
  discountPaise: number;
  taxPaise: number;
  totalPaise: number;
}

export interface LineBreakdown {
  /** Quantity times unit price, before any discount. */
  basePaise: number;
  discountPaise: number;
  /** What tax is charged on: the base less this line’s share of the discount. */
  taxablePaise: number;
  taxPaise: number;
}

/**
 * Each line’s value, share of the discount, taxable value and tax. The discount is spread over the lines in proportion to
 * their value before tax is worked out, so tax is charged on what the member actually pays. Every figure is whole paise.
 */
export function invoiceLines(lines: Array<Pick<InvoiceLine, "quantity" | "unitPaise" | "taxRateBp">>, discountPaise = 0): LineBreakdown[] {
  const bases = lines.map(lineBase);
  const subtotal = bases.reduce((n, b) => n + b, 0);
  const discount = Math.min(Math.max(discountPaise, 0), subtotal);
  const shares = bases.map((b) => (subtotal ? Math.floor((discount * b) / subtotal) : 0));
  let left = discount - shares.reduce((n, s) => n + s, 0);
  for (let i = 0; left > 0 && i < shares.length; i++, left--) shares[i]! += 1;
  return lines.map((l, i) => {
    const taxable = bases[i]! - shares[i]!;
    return { basePaise: bases[i]!, discountPaise: shares[i]!, taxablePaise: taxable, taxPaise: Math.round((taxable * l.taxRateBp) / 10000) };
  });
}

/** Invoice totals from the lines and a discount. */
export function invoiceTotals(lines: Array<Pick<InvoiceLine, "quantity" | "unitPaise" | "taxRateBp">>, discountPaise = 0): InvoiceTotals {
  const rows = invoiceLines(lines, discountPaise);
  const subtotal = rows.reduce((n, r) => n + r.basePaise, 0);
  const discount = rows.reduce((n, r) => n + r.discountPaise, 0);
  const tax = rows.reduce((n, r) => n + r.taxPaise, 0);
  return { subtotalPaise: subtotal, discountPaise: discount, taxPaise: tax, totalPaise: subtotal - discount + tax };
}

export interface TaxBreakup {
  cgstPaise: number;
  sgstPaise: number;
  igstPaise: number;
}

/**
 * GST split. When the place of supply is in the same state as the gym, the tax is CGST plus SGST in equal halves
 * (any odd paisa goes to SGST). When it is another state it is IGST.
 */
export function taxBreakup(taxPaise: number, supplierState: string, placeOfSupply: string): TaxBreakup {
  if (supplierState !== placeOfSupply) return { cgstPaise: 0, sgstPaise: 0, igstPaise: taxPaise };
  const cgst = Math.floor(taxPaise / 2);
  return { cgstPaise: cgst, sgstPaise: taxPaise - cgst, igstPaise: 0 };
}

/**
 * Place of supply. Fitness services (memberships, PT sessions, classes) are taxed where they are performed, so for
 * in-gym services it is the branch’s state, whatever the member’s address. Only a service delivered elsewhere
 * (for example online coaching) passes `deliveredIn`. GST rules to be confirmed by the gym’s accountant before launch.
 */
export const placeOfSupplyFor = (branchStateCode: string, deliveredIn?: string): string => deliveredIn ?? branchStateCode;

/** The state code in a GSTIN: its first two digits. */
export const stateOfGstin = (gstin: string): string => gstin.slice(0, 2);

export const STATE_NAMES: Record<string, string> = {
  "01": "Jammu and Kashmir", "02": "Himachal Pradesh", "03": "Punjab", "04": "Chandigarh", "05": "Uttarakhand", "06": "Haryana", "07": "Delhi", "08": "Rajasthan",
  "09": "Uttar Pradesh", "10": "Bihar", "11": "Sikkim", "12": "Arunachal Pradesh", "13": "Nagaland", "14": "Manipur", "15": "Mizoram", "16": "Tripura", "17": "Meghalaya",
  "18": "Assam", "19": "West Bengal", "20": "Jharkhand", "21": "Odisha", "22": "Chhattisgarh", "23": "Madhya Pradesh", "24": "Gujarat", "26": "Dadra and Nagar Haveli and Daman and Diu",
  "27": "Maharashtra", "29": "Karnataka", "30": "Goa", "31": "Lakshadweep", "32": "Kerala", "33": "Tamil Nadu", "34": "Puducherry", "35": "Andaman and Nicobar Islands",
  "36": "Telangana", "37": "Andhra Pradesh", "38": "Ladakh",
};

const ONES = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

function below1000(n: number): string {
  const parts: string[] = [];
  if (n >= 100) parts.push(`${ONES[Math.floor(n / 100)]} Hundred`);
  const rest = n % 100;
  if (rest) parts.push(rest < 20 ? ONES[rest]! : `${TENS[Math.floor(rest / 10)]}${rest % 10 ? ` ${ONES[rest % 10]}` : ""}`);
  return parts.join(" ");
}

/** “Rupees Two Thousand Nine Hundred Fifty Only”, using crore, lakh and thousand as in India. */
export function amountInWords(paise: number): string {
  const rupees = Math.floor(paise / 100);
  const ps = paise % 100;
  const parts: string[] = [];
  let n = rupees;
  for (const [unit, label] of [[10_000_000, "Crore"], [100_000, "Lakh"], [1000, "Thousand"]] as const) {
    if (n >= unit) {
      parts.push(`${below1000(Math.floor(n / unit))} ${label}`);
      n %= unit;
    }
  }
  if (n) parts.push(below1000(n));
  const rupeeWords = parts.length ? parts.join(" ") : "Zero";
  return `Rupees ${rupeeWords}${ps ? ` and ${below1000(ps)} Paise` : ""} Only`;
}

/** Money received for an invoice. Failed and pending payments don’t count. */
export const paidPaise = (payments: Array<Pick<Payment, "status" | "amountPaise">>): number => payments.filter((p) => p.status === "succeeded").reduce((n, p) => n + p.amountPaise, 0);

export const amountDuePaise = (invoice: Pick<Invoice, "totalPaise" | "status">, payments: Array<Pick<Payment, "status" | "amountPaise">>): number =>
  invoice.status === "void" || invoice.status === "draft" ? 0 : Math.max(0, invoice.totalPaise - paidPaise(payments));

/** “Overdue” is worked out, not stored (M02): unpaid money and a due date that has passed. */
export const isOverdue = (invoice: Pick<Invoice, "totalPaise" | "status" | "dueOn">, payments: Array<Pick<Payment, "status" | "amountPaise">>, today: string): boolean =>
  invoice.dueOn < today && amountDuePaise(invoice, payments) > 0;
