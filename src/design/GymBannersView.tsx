import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { LifeBuoy, ShieldAlert } from "lucide-react";
import { useSupportBanner } from "@/api/supportBannerHook";
import { useMe } from "@/api/hooks";
import { useCan, useSession } from "@/app/SessionContext";
import { ADMIN_SESSION_KEY, SESSION_KEY } from "@/app/session";
import { cn } from "@/lib/format";
import { formatTime } from "@/lib/when";

/** Puts an administrator back in their own session after support access, and shows them the Support page. */
async function leaveSupport(end: boolean, sessionId: string, session: Parameters<typeof import("@/api/platform").endSupportAccess>[0]) {
  try { if (end) await (await import("@/api/platform")).endSupportAccess(session, { sessionId }); } catch { /* already ended */ }
  try {
    const own = localStorage.getItem(ADMIN_SESSION_KEY);
    if (own) { localStorage.setItem(SESSION_KEY, own); localStorage.removeItem(ADMIN_SESSION_KEY); }
  } catch { /* the page reloads to the login if storage is blocked */ }
  window.location.assign("/admin/support");
}

function SupportBanner() {
  const q = useSupportBanner();
  const { session } = useSession();
  const [, tick] = useState(0);
  const mine = q.data?.sessions.find((s) => s.mine);
  useEffect(() => { const t = setInterval(() => tick((n) => n + 1), 15_000); return () => clearInterval(t); }, []);
  // The session ends on its own: an administrator inside it is put back the moment its time is up.
  useEffect(() => {
    if (!mine || !session) return;
    const ms = Date.parse(mine.expiresAt) - Date.now();
    const t = setTimeout(() => void leaveSupport(false, mine.id, session), Math.max(0, ms) + 500);
    return () => clearTimeout(t);
  }, [mine?.id, mine?.expiresAt, session]);
  const list = q.data?.sessions ?? [];
  if (list.length === 0) return null;
  return (
    <div className="space-y-2">
      {list.map((s) => {
        const left = Math.max(0, Math.ceil((Date.parse(s.expiresAt) - Date.now()) / 60_000));
        return (
          <div key={s.id} role="status" aria-label="Support access" className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-2xl bg-lilac-100 px-4 py-3 text-lilac-700">
            <LifeBuoy className="h-5 w-5 shrink-0" aria-hidden="true" />
            <p className="min-w-0 basis-[14rem] flex-1 text-[0.95rem]">
              <span className="font-bold">{s.mine ? "You are inside this gym under support access, read-only." : "Ember support has read-only access to this gym."}</span> It ends at {formatTime(s.expiresAt)}, in {left} {left === 1 ? "minute" : "minutes"}. Reason: {s.reason}
            </p>
            {s.mine && session && <button type="button" onClick={() => void leaveSupport(true, s.id, session)} className="min-h-[2.75rem] cursor-pointer rounded-full bg-white px-4 text-sm font-bold text-clay-ink shadow-sm">End support access</button>}
          </div>
        );
      })}
    </div>
  );
}

function SubscriptionBanner() {
  const me = useMe();
  const can = useCan();
  const b = me.data?.subscription?.banner;
  if (!b) return null;
  const owner = can("subscription.view");
  return (
    <div role="status" aria-label="Subscription" className={cn("flex flex-wrap items-start gap-3 rounded-2xl px-4 py-3", b.tone === "danger" ? "bg-status-danger-bg text-status-danger-fg" : "bg-status-pending-bg text-status-pending-fg")}>
      <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
      <p className="min-w-0 basis-[14rem] flex-1 text-[0.95rem]"><span className="font-bold">{b.title}.</span> {b.body}{!owner && " Ask the gym’s owner to open Subscription."}</p>
      {owner && <Link to="/owner/subscription" className="inline-flex min-h-[2.75rem] items-center rounded-full bg-white px-4 text-sm font-bold text-clay-ink shadow-sm">Open Subscription</Link>}
    </div>
  );
}

/** The banners themselves, downloaded only when there is one to show (`GymBanners.tsx`). What everyone in a gym is told at the top of every screen: that Ember support has access (everyone), and what the subscription is doing to the gym (staff). */
export default function GymBannersView({ staff }: { staff: boolean }) {
  return (
    <div className="print-hide mb-4 space-y-2 empty:hidden">
      <SupportBanner />
      {staff && <SubscriptionBanner />}
    </div>
  );
}
