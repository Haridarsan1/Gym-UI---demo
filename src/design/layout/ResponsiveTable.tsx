import type { ReactNode } from "react";
import { cn } from "@/lib/format";

export interface Column<T> {
  key: string;
  header: string;
  cell: (row: T) => ReactNode;
  /** The card’s title on phones. Exactly one column should be primary. */
  primary?: boolean;
  /** Hide on phones: the card keeps only the key fields. */
  hideOnPhone?: boolean;
  align?: "left" | "right";
}

/**
 * Staff tables (desk, finance, owner, admin). From 640 px a dense table; on phones a list of cards with the key fields.
 * Filters go in a Sheet on phones, and primary actions in a StickyActions bar. Pair it with the screen’s own loading
 * skeleton, empty state and error state (see design/States).
 */
export function ResponsiveTable<T>({ rows, columns, rowKey, onRowClick, caption }: { rows: T[]; columns: Column<T>[]; rowKey: (row: T) => string; onRowClick?: (row: T) => void; caption: string }) {
  const primary = columns.find((c) => c.primary) ?? columns[0]!;
  const rest = columns.filter((c) => c !== primary && !c.hideOnPhone);
  return (
    <>
      <div className="clay-flat hidden overflow-x-auto sm:block">
        <table className="w-full text-left text-sm">
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr className="border-b border-clay-line text-clay-muted">
              {columns.map((c) => (
                <th key={c.key} scope="col" className={cn("px-4 py-3 font-semibold", c.align === "right" && "text-right")}>
                  {c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={rowKey(r)} onClick={onRowClick ? () => onRowClick(r) : undefined} className={cn("border-b border-clay-line last:border-0", onRowClick && "cursor-pointer hover:bg-clay-canvas")}>
                {columns.map((c) => (
                  <td key={c.key} className={cn("min-h-[2.75rem] px-4 py-3", c.align === "right" && "text-right tabular-nums")}>
                    {c.cell(r)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul aria-label={caption} className="grid gap-3 sm:hidden">
        {rows.map((r) => (
          <li key={rowKey(r)} className="clay-flat p-4">
            <button type="button" disabled={!onRowClick} onClick={onRowClick ? () => onRowClick(r) : undefined} className="block min-h-[2.75rem] w-full text-left">
              <div className="font-semibold">{primary.cell(r)}</div>
              <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
                {rest.map((c) => (
                  <div key={c.key} className="contents">
                    <dt className="text-clay-muted">{c.header}</dt>
                    <dd className="text-right">{c.cell(r)}</dd>
                  </div>
                ))}
              </dl>
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}

/** Primary actions stay in reach on phones; from 640 px the bar is an ordinary row. */
export function StickyActions({ children }: { children: ReactNode }) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-40 flex gap-3 border-t border-clay-line bg-clay-canvas/95 px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))] pt-3 backdrop-blur sm:static sm:z-auto sm:justify-end sm:border-0 sm:bg-transparent sm:p-0 sm:backdrop-blur-none">
      {children}
    </div>
  );
}
