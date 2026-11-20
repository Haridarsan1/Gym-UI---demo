import { db } from "@/demo/db";
import { amountDuePaise, amountInWords, invoiceLines, isOverdue, paidPaise, stateOfGstin, STATE_NAMES, SAC_FITNESS, taxBreakup } from "@/domain/billing";
import { PAY_METHOD_LABEL } from "@/domain/renewal";
import type { Invoice } from "@/domain/types";

/** The Indian tax receipt for one invoice (M03). Built here so the member’s receipt page and the front desk’s print the same thing. */
export interface ReceiptData {
  /** “Tax invoice and receipt” once paid in full, otherwise “Tax invoice”. */
  title: string;
  supplier: { name: string; legalName: string; logoUrl?: string; address?: string; gstin?: string; stateName: string; stateCode: string };
  invoice: { id: string; number: string; issuedOn: string; dueOn: string; status: Invoice["status"]; overdue: boolean; sac: string };
  billTo: { name: string; phone: string; email?: string; branchName: string };
  placeOfSupply: { code: string; name: string };
  lines: Array<{ description: string; sac: string; quantity: number; unitPaise: number; taxablePaise: number; taxRateBp: number }>;
  totals: { subtotalPaise: number; discountPaise: number; taxablePaise: number; cgstPaise: number; sgstPaise: number; igstPaise: number; taxPaise: number; totalPaise: number };
  /** Half the GST rate for CGST and SGST, or the whole rate for IGST (when every line has the same rate). */
  rateBp?: number;
  amountInWords: string;
  payments: Array<{ id: string; at: string; methodLabel: string; amountPaise: number; receiptNumber?: string; reference?: string }>;
  paidPaise: number;
  duePaise: number;
}


/** The receipt for an invoice the caller has already been allowed to read. */
export async function buildReceipt(invoice: Invoice, today: string): Promise<ReceiptData> {
  const [member, tenant, branch, payments] = await Promise.all([db.members.get(invoice.memberId), db.tenants.get(invoice.tenantId), db.branches.get(invoice.branchId), db.payments.where("invoiceId").equals(invoice.id).toArray()]);
  const supplierState = tenant?.gstin ? stateOfGstin(tenant.gstin) : (branch?.stateCode ?? invoice.placeOfSupply);
  const rows = invoiceLines(invoice.lines, invoice.discountPaise);
  const split = taxBreakup(invoice.taxPaise, supplierState, invoice.placeOfSupply);
  const rates = new Set(invoice.lines.map((l) => l.taxRateBp));
  const paid = paidPaise(payments);
  const due = amountDuePaise(invoice, payments);
  const done = payments.filter((p) => p.status === "succeeded").sort((a, b) => a.receivedAt.localeCompare(b.receivedAt));
  return {
    title: invoice.status === "paid" ? "Tax invoice and receipt" : "Tax invoice",
    supplier: { name: tenant?.name ?? "", logoUrl: tenant?.logoUrl, legalName: tenant?.legalName ?? tenant?.name ?? "", address: tenant?.address, gstin: tenant?.gstin, stateCode: supplierState, stateName: STATE_NAMES[supplierState] ?? supplierState },
    invoice: { id: invoice.id, number: invoice.number, issuedOn: invoice.issuedOn, dueOn: invoice.dueOn, status: invoice.status, overdue: isOverdue(invoice, payments, today), sac: SAC_FITNESS },
    billTo: { name: member?.name ?? "", phone: member?.phone ?? "", email: member?.email, branchName: branch?.name ?? "" },
    placeOfSupply: { code: invoice.placeOfSupply, name: STATE_NAMES[invoice.placeOfSupply] ?? invoice.placeOfSupply },
    lines: invoice.lines.map((l, i) => ({ description: l.description, sac: SAC_FITNESS, quantity: l.quantity, unitPaise: l.unitPaise, taxablePaise: rows[i]!.taxablePaise, taxRateBp: l.taxRateBp })),
    totals: { subtotalPaise: invoice.subtotalPaise, discountPaise: invoice.discountPaise, taxablePaise: invoice.subtotalPaise - invoice.discountPaise, ...split, taxPaise: invoice.taxPaise, totalPaise: invoice.totalPaise },
    rateBp: rates.size === 1 ? (split.igstPaise ? [...rates][0] : [...rates][0]! / 2) : undefined,
    amountInWords: amountInWords(invoice.totalPaise),
    payments: done.map((p) => ({ id: p.id, at: p.receivedAt, methodLabel: PAY_METHOD_LABEL[p.method], amountPaise: p.amountPaise, receiptNumber: p.receiptNumber, reference: p.reference })),
    paidPaise: paid, duePaise: due,
  };
}
