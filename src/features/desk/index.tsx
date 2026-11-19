import { lazy } from "react";
import { AreaRoutes } from "@/app/AreaRoutes";
import { registerScreens } from "@/app/screens";
import { deskScreens } from "@/app/screens/desk";
import { StaffShell } from "@/design/shells/StaffShell";

registerScreens("desk", deskScreens);

/** Desk area. Each screen is a separate file, loaded when it is opened. Keys are screen ids from src/app/screens/desk.ts. */
const implemented = {
  checkin: lazy(() => import("@/features/desk/CheckIn")),
  members: lazy(() => import("@/features/desk/Members")),
  member: lazy(() => import("@/features/desk/MemberProfile")),
  collect: lazy(() => import("@/features/desk/CollectPayment")),
  dues: lazy(() => import("@/features/desk/Dues")),
  "desk-receipt": lazy(() => import("@/features/desk/DeskReceipt")),
  refunds: lazy(() => import("@/features/desk/Refunds")),
  "desk-bookings": lazy(() => import("@/features/desk/Bookings")),
  "new-member": lazy(() => import("@/features/desk/NewMember")),
};

export default function DeskArea() {
  return <AreaRoutes area="desk" shell={<StaffShell area="desk" />} implemented={implemented} />;
}
