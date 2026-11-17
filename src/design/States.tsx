import type { ReactNode } from "react";
import { AlertCircle, Inbox, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { isApiError } from "@/api/errors";

/** What a list shows when it has nothing: say what the screen is for and what to do next. */
export function EmptyState({ icon: Icon = Inbox, title, children, action }: { icon?: LucideIcon; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="clay-well grid place-items-center !rounded-3xl px-6 py-12 text-center">
      <div>
        <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-white text-clay-muted shadow-sm">
          <Icon className="h-6 w-6" aria-hidden="true" />
        </span>
        <h2 className="mt-4 text-lg font-bold">{title}</h2>
        {children && <p className="mx-auto mt-1 max-w-sm text-[0.95rem] text-clay-muted">{children}</p>}
        {action && <div className="mt-5 flex justify-center">{action}</div>}
      </div>
    </div>
  );
}

/** What a list shows when loading fails: what went wrong, and a way to try again. */
export function ErrorState({ error, onRetry, title = "We couldn’t load this" }: { error?: unknown; onRetry?: () => void; title?: string }) {
  const message = isApiError(error) ? error.message : "Something went wrong on our side. Try again in a moment.";
  return (
    <div role="alert" className="clay-flat px-6 py-10 text-center">
      <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-status-danger-bg text-status-danger-fg">
        <AlertCircle className="h-6 w-6" aria-hidden="true" />
      </span>
      <h2 className="mt-4 text-lg font-bold">{title}</h2>
      <p className="mx-auto mt-1 max-w-sm text-[0.95rem] text-clay-muted">{message}</p>
      {onRetry && (
        <Button variant="ink" className="mt-5" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}
