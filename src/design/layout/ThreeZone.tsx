import type { ReactNode } from "react";
import { useSplit, useWide } from "@/design/useMediaQuery";

/**
 * The trainer layout (and any screen that wants it): a list, its detail and a context panel.
 *
 * - Phones: not used. A screen shows one column and decides what to stack (see `useSplit`).
 * - From 768 px: the list on the left, the detail beside it.
 * - From 1280 px: a third zone on the right for context, such as the selected client at a glance.
 *
 * Below 1280 px the context is simply not shown, so it must never carry the only way to do something. A screen puts
 * the same information in the detail or on the page it links to.
 */
export function ThreeZone({ list, detail, context, listWidth = "minmax(14rem,17rem)", contextWidth = "minmax(18rem,22rem)" }: { list: ReactNode; detail: ReactNode; context?: ReactNode; listWidth?: string; contextWidth?: string }) {
  const split = useSplit();
  const wide = useWide();
  const three = wide && context !== undefined;
  if (!split) {
    return (
      <div className="space-y-5">
        {list}
        {detail}
      </div>
    );
  }
  return (
    <div data-zones={three ? 3 : 2} className="grid items-start gap-6" style={{ gridTemplateColumns: three ? `${listWidth} minmax(0,1fr) ${contextWidth}` : `${listWidth} minmax(0,1fr)` }}>
      <div className="min-w-0 lg:sticky lg:top-6">{list}</div>
      <div className="min-w-0">{detail}</div>
      {three && <div className="min-w-0 lg:sticky lg:top-6">{context}</div>}
    </div>
  );
}
