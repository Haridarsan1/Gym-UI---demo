import { db } from "@/demo/db";

/** The next receipt number: RCP, the year and four digits, the highest in use plus one. Call it inside the transaction that stores the payment. */
export async function nextReceiptNumber(tenantId: string, today: string): Promise<string> {
  const head = `RCP-${today.slice(0, 4)}-`;
  const payments = await db.payments.where("tenantId").equals(tenantId).toArray();
  const top = payments.reduce((n, p) => (p.receiptNumber?.startsWith(head) ? Math.max(n, Number(p.receiptNumber.slice(head.length)) || 0) : n), 0);
  return `${head}${String(top + 1).padStart(4, "0")}`;
}
