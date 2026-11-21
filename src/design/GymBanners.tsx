import { lazy, Suspense } from "react";
import { useSupportBanner } from "@/api/supportBannerHook";
import { useMe } from "@/api/hooks";

const View = lazy(() => import("@/design/GymBannersView"));

/**
 * Sits at the top of every screen in a gym. It costs almost nothing: the banners (their icons, links and wording) are downloaded only when Ember support has access to the gym, or,
 * for staff, when the subscription has something to say. A gym with nothing to say never downloads them.
 */
export function GymBanners({ staff }: { staff: boolean }) {
  const support = useSupportBanner();
  const me = useMe();
  const show = (support.data?.sessions.length ?? 0) > 0 || (staff && !!me.data?.subscription?.banner);
  if (!show) return null;
  return <Suspense fallback={null}><View staff={staff} /></Suspense>;
}
