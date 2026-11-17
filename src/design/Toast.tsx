import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { CheckCircle2, Info, X, XCircle } from "lucide-react";
import { cn } from "@/lib/format";

export interface ToastOptions {
  title: string;
  description?: string;
  tone?: "info" | "success" | "error";
  /** For undo and similar. The toast closes after the action runs. */
  action?: { label: string; onAction: () => void };
  /** Milliseconds before it closes. `null` keeps it until dismissed (for example “New version available”). */
  duration?: number | null;
}

interface ToastItem extends ToastOptions {
  id: number;
}

const Ctx = createContext<((t: ToastOptions) => number) | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(1);
  const dismiss = useCallback((id: number) => setItems((l) => l.filter((t) => t.id !== id)), []);
  const show = useCallback((t: ToastOptions) => {
    const id = nextId.current++;
    setItems((l) => [...l.slice(-2), { ...t, id }]);
    return id;
  }, []);
  const value = useMemo(() => show, [show]);

  return (
    <Ctx.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-28 z-[60] flex flex-col items-center gap-2 px-4 lg:bottom-6">
        {items.map((t) => (
          <ToastCard key={t.id} item={t} onClose={() => dismiss(t.id)} />
        ))}
      </div>
    </Ctx.Provider>
  );
}

function ToastCard({ item, onClose }: { item: ToastItem; onClose: () => void }) {
  const [paused, setPaused] = useState(false);
  const duration = item.duration === undefined ? 5000 : item.duration;
  useEffect(() => {
    if (duration === null || paused) return;
    const t = window.setTimeout(onClose, duration);
    return () => window.clearTimeout(t);
  }, [duration, paused, onClose]);
  const Icon = item.tone === "error" ? XCircle : item.tone === "success" ? CheckCircle2 : Info;
  return (
    <div
      role={item.tone === "error" ? "alert" : "status"}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      className="clay pointer-events-auto flex w-full max-w-md items-start gap-3 !rounded-2xl p-4"
    >
      <Icon className={cn("mt-0.5 h-5 w-5 shrink-0", item.tone === "error" ? "text-status-danger-fg" : item.tone === "success" ? "text-mint-700" : "text-clay-muted")} aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="font-semibold">{item.title}</p>
        {item.description && <p className="mt-0.5 text-sm text-clay-muted">{item.description}</p>}
        {item.action && (
          <button
            type="button"
            onClick={() => {
              item.action?.onAction();
              onClose();
            }}
            className="mt-2 inline-flex min-h-[2.75rem] items-center text-sm font-semibold text-ember-700 underline underline-offset-4"
          >
            {item.action.label}
          </button>
        )}
      </div>
      <button type="button" onClick={onClose} aria-label="Dismiss" className="-mr-1 -mt-1 grid h-11 w-11 shrink-0 place-items-center rounded-full text-clay-muted hover:bg-clay-canvas">
        <X className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  );
}

/** `const toast = useToast(); toast({ title: "Payment recorded", tone: "success" })` */
export function useToast(): (t: ToastOptions) => number {
  const v = useContext(Ctx);
  if (!v) throw new Error("useToast must be used inside ToastProvider.");
  return v;
}
