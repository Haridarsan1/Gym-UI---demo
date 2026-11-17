import { lazy } from "react";
import { AreaRoutes } from "@/app/AreaRoutes";
import { MemberShell } from "@/features/member/MemberShell";

/** Member area. Each screen is a separate file, loaded when the member opens it. Keys are screen ids from src/app/screens.ts. */
const implemented = {
  today: lazy(() => import("@/features/member/Today")),
  program: lazy(() => import("@/features/member/Program")),
  workout: lazy(() => import("@/features/member/Workout")),
  bookings: lazy(() => import("@/features/member/Bookings")),
  progress: lazy(() => import("@/features/member/Progress")),
  reviews: lazy(() => import("@/features/member/Reviews")),
  "workout-complete": lazy(() => import("@/features/member/WorkoutComplete")),
};

export default function MemberArea() {
  return <AreaRoutes area="member" shell={<MemberShell />} implemented={implemented} />;
}
