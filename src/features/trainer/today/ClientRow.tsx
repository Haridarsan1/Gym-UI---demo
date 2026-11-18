import { Link } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import { Avatar } from "@/design/Avatar";
import { cn } from "@/lib/format";
import type { Row } from "@/features/trainer/today/categories";

const TONE: Record<Row["tone"], string> = {
  plain: "text-clay-muted",
  quiet: "text-clay-subtle",
  now: "rounded-full bg-status-active-bg px-2.5 py-0.5 font-semibold text-status-active-fg",
  next: "rounded-full bg-lilac-100 px-2.5 py-0.5 font-semibold text-lilac-700",
};

const body = (row: Row, side: boolean) => (
  <>
    <Avatar name={row.name} />
    <span className="min-w-0 flex-1">
      <span className="block truncate font-semibold">{row.name}</span>
      <span className="block text-sm text-clay-muted">{row.detail}</span>
      {/* Unless there is room beside the name, the note goes under the line so the name keeps its room. */}
      {row.trailing && !side && <span className={cn("mt-0.5 inline-block text-sm", TONE[row.tone])}>{row.trailing}</span>}
    </span>
    {row.trailing && side && <span className={cn("shrink-0 text-right text-sm", TONE[row.tone])}>{row.trailing}</span>}
  </>
);

const base = "flex min-h-[3.5rem] w-full items-center gap-3 rounded-2xl px-3 py-2 text-left transition-colors";

/**
 * One client in a list. Where there is a context panel (1280 px and up) it selects the client for that panel; elsewhere it
 * opens the client’s page. `side` puts the note beside the name instead of under it, for when there is room.
 */
export function ClientRow({ row, selectable, selected, onSelect, side = false }: { row: Row; selectable: boolean; selected: boolean; onSelect: (memberId: string) => void; side?: boolean }) {
  if (selectable) {
    return (
      <button type="button" aria-pressed={selected} onClick={() => onSelect(row.memberId)} className={cn(base, "cursor-pointer", selected ? "bg-ember-50 ring-2 ring-ember-200" : "hover:bg-clay-canvas")}>
        {body(row, side)}
      </button>
    );
  }
  return (
    <Link to={`/t/clients/${row.memberId}`} className={cn(base, "hover:bg-clay-canvas")}>
      {body(row, side)}
      <ChevronRight className="h-5 w-5 shrink-0 text-clay-subtle" aria-hidden="true" />
    </Link>
  );
}
