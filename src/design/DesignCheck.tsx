import { Button3D } from "@/design/Button3D";
import { Skeleton, SkeletonCard, SkeletonRows } from "@/design/Skeleton";
import { EmptyState, ErrorState } from "@/design/States";
import { BookingStatusPill, InvoiceStatusPill, MembershipStatusPill, WorkoutStatusPill } from "@/design/StatusPills";
import { ToastProvider, useToast } from "@/design/Toast";
import { ApiError } from "@/api/errors";
import { Button } from "@/components/ui/Button";
import { Users } from "lucide-react";

/** Development-only gallery of the app’s design pieces, at /dev/design. It is not part of the production build. */
function Gallery() {
  const toast = useToast();
  const section = "clay mt-6 p-6";
  return (
    <main className="mx-auto max-w-3xl bg-clay-canvas px-4 py-10 text-clay-ink">
      <h1 className="text-3xl font-bold tracking-tight">Design check</h1>
      <p className="mt-1 text-clay-muted">Development only. Press the buttons, resize the window, and turn on reduced motion in your system settings.</p>

      <section className={section} aria-labelledby="d-btn">
        <h2 id="d-btn" className="text-lg font-bold">Button3D</h2>
        <div className="mt-4 flex flex-wrap gap-4">
          {(["ember", "mint", "lilac", "ink", "white"] as const).map((v) => (
            <Button3D key={v} variant={v}>
              {v}
            </Button3D>
          ))}
          <Button3D size="lg" haptic>Log set</Button3D>
          <Button3D disabled>Disabled</Button3D>
        </div>
      </section>

      <section className={section} aria-labelledby="d-pill">
        <h2 id="d-pill" className="text-lg font-bold">Status pills</h2>
        <p className="mt-3 text-sm text-clay-muted">Membership (filled)</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {(["pending", "scheduled", "active", "frozen", "expired", "canceled"] as const).map((s) => (
            <MembershipStatusPill key={s} status={s} />
          ))}
        </div>
        <p className="mt-4 text-sm text-clay-muted">Invoice (outlined)</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {(["draft", "open", "partially_paid", "paid", "void", "overdue"] as const).map((s) => (
            <InvoiceStatusPill key={s} status={s} />
          ))}
        </div>
        <p className="mt-4 text-sm text-clay-muted">Workout (skipped is never red)</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {(["scheduled", "draft", "completed", "partial", "skipped"] as const).map((s) => (
            <WorkoutStatusPill key={s} status={s} />
          ))}
        </div>
        <p className="mt-4 text-sm text-clay-muted">Booking</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {(["booked", "canceled", "attended", "no_show"] as const).map((s) => (
            <BookingStatusPill key={s} status={s} />
          ))}
        </div>
      </section>

      <section className={section} aria-labelledby="d-toast">
        <h2 id="d-toast" className="text-lg font-bold">Toasts</h2>
        <div className="mt-4 flex flex-wrap gap-3">
          <Button onClick={() => toast({ title: "Payment recorded", description: "Receipt sent to priya@example.in.", tone: "success" })}>Success</Button>
          <Button onClick={() => toast({ title: "Booking canceled", action: { label: "Undo", onAction: () => toast({ title: "Booking restored", tone: "success" }) } })}>With undo</Button>
          <Button onClick={() => toast({ title: "Payment failed", description: "Check the card details and try again.", tone: "error" })}>Error</Button>
          <Button onClick={() => toast({ title: "New version available", action: { label: "Reload", onAction: () => window.location.reload() }, duration: null })}>Stays until closed</Button>
        </div>
      </section>

      <section className={section} aria-labelledby="d-load">
        <h2 id="d-load" className="text-lg font-bold">Loading</h2>
        <div className="mt-4 space-y-4">
          <SkeletonCard />
          <SkeletonRows rows={3} />
          <Skeleton className="h-6 w-1/2" />
        </div>
      </section>

      <section className="mt-6 space-y-4" aria-label="Empty and error states">
        <EmptyState icon={Users} title="No members match" action={<Button variant="ink">Clear filters</Button>}>
          Try a different name or phone number, or clear the filters to see everyone at this branch.
        </EmptyState>
        <ErrorState error={new ApiError("network", "We couldn’t reach the server. Check your connection and try again.")} onRetry={() => toast({ title: "Trying again" })} />
      </section>
    </main>
  );
}

export default function DesignCheck() {
  return (
    <ToastProvider>
      <Gallery />
    </ToastProvider>
  );
}
