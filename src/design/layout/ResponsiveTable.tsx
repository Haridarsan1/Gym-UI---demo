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
  /** Buttons and links for the row. On phones they sit under the card instead of inside it, so the card can open the row without nesting buttons. */
  action?: boolean;
}

/**
 * Staff tables (desk, finance, owner, admin). From 640 px a dense table; on phones a list of cards with the key fields.
 * Filters go in a Sheet on phones, and primary actions in a StickyActions bar. Pair it with the screen’s own loading
 * skeleton, empty state and error state (see design/States).
 */
export function ResponsiveTable<T>({ rows, columns, rowKey, onRowClick, cardIsLink, caption }: { rows: T[]; columns: Column<T>[]; rowKey: (row: T, index: number) => string; onRowClick?: (row: T) => void; /** The first cell is already a link, so on a phone the card is not also a button (controls must not be nested). */ cardIsLink?: boolean; caption: string }) {
  const primary = columns.find((c) => c.primary) ?? columns[0]!;
  const rest = columns.filter((c) => c !== primary && !c.hideOnPhone && !c.action);
  const actions = columns.filter((c) => c.action);
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
            {rows.map((r, i) => (
              <tr key={rowKey(r, i)} onClick={onRowClick ? () => onRowClick(r) : undefined} className={cn("border-b border-clay-line last:border-0", onRowClick && "cursor-pointer hover:bg-clay-canvas")}>
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
        {rows.map((r, i) => (
          <li key={rowKey(r, i)} className="clay-flat p-4">
            <Card onClick={onRowClick && !cardIsLink ? () => onRowClick(r) : undefined}>
              <div className="font-semibold">{primary.cell(r)}</div>
              <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
                {rest.map((c) => (
                  <div key={c.key} className="contents">
                    <dt className="text-clay-muted">{c.header}</dt>
                    <dd className="text-right">{c.cell(r)}</dd>
                  </div>
                ))}
              </dl>
            </Card>
            {actions.length > 0 && <div className="mt-3 flex flex-wrap gap-2">{actions.map((c) => <span key={c.key} className="contents">{c.cell(r)}</span>)}</div>}
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

/** A row card is a button only when the row opens something; otherwise it is plain content, so the links and buttons inside it are not nested in another control. */
function Card({ onClick, children }: { onClick?: () => void; children: React.ReactNode }) {
  const cls = "block min-h-[2.75rem] w-full text-left";
  return onClick ? <button type="button" onClick={onClick} className={cls}>{children}</button> : <div className={cls}>{children}</div>;
}
