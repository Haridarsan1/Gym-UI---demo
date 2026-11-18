import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { useSplit } from "@/design/useMediaQuery";

/**
 * A list with the selected item’s detail beside it.
 *
 * - From 768 px both show at once. With nothing selected the detail side shows `placeholder`.
 * - On phones the list is a screen, and picking an item opens the detail as a new screen with a Back link.
 *
 * The selection lives in the address (a route parameter or a query string), so a refresh, the back button and a pasted
 * link all land on the same item. The caller passes `selected` (true when an item is chosen) and `backTo` (the address
 * with the selection removed).
 */
export function ListDetail({ list, detail, selected, backTo, backLabel = "Back", placeholder, listWidth = "minmax(18rem,24rem)" }: { list: ReactNode; detail: ReactNode; selected: boolean; backTo: string; backLabel?: string; placeholder?: ReactNode; listWidth?: string }) {
  const split = useSplit();
  if (!split) {
    return selected ? (
      <div>
        <Link to={backTo} className="mb-3 inline-flex min-h-[2.75rem] items-center gap-1.5 rounded-xl pr-3 font-semibold text-clay-muted hover:text-clay-ink">
          <ArrowLeft className="h-5 w-5" aria-hidden="true" />
          {backLabel}
        </Link>
        {detail}
      </div>
    ) : (
      <>{list}</>
    );
  }
  return (
    <div className="grid items-start gap-6" style={{ gridTemplateColumns: `${listWidth} minmax(0,1fr)` }}>
      <div className="min-w-0">{list}</div>
      <div className="min-w-0 lg:sticky lg:top-6">{selected ? detail : (placeholder ?? null)}</div>
    </div>
  );
}
