import { db } from "@/demo/db";
import { financialYear, formatNumber, prefixFor, seriesKey, type SeriesKind } from "@/domain/numbering";
import type { Branch } from "@/domain/types";

/**
 * The next GST document number for a branch, taken from its series counter. Call it inside the same `db.transaction` that stores the
 * document (the transaction must include `numberSeries`, which `db.tables` does): IndexedDB runs such transactions one after another,
 * so two documents made at once can never get the same number, and a transaction that fails gives its number back, so there are no gaps.
 */
export async function allocateNumber(tenantId: string, kind: SeriesKind, branch: Pick<Branch, "invoicePrefix">, date: string): Promise<string> {
  const prefix = prefixFor(kind, branch.invoicePrefix);
  const fy = financialYear(date);
  const id = seriesKey(tenantId, prefix, fy);
  const row = await db.numberSeries.get(id);
  const sequence = (row?.last ?? 0) + 1;
  const number = formatNumber(prefix, fy, sequence);
  await db.numberSeries.put({ id, tenantId, prefix, financialYear: fy, last: sequence });
  return number;
}
