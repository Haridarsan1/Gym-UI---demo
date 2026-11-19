import { lazy } from "react";
import { AreaRoutes } from "@/app/AreaRoutes";
import { registerScreens } from "@/app/screens";
import { ownerScreens } from "@/app/screens/owner";
import { StaffShell } from "@/design/shells/StaffShell";

registerScreens("owner", ownerScreens);

/** Owner area. Each screen is a separate file, loaded when it is opened. Keys are screen ids from src/app/screens/owner.ts. */
const implemented = {
  dashboard: lazy(() => import("@/features/owner/Dashboard")),
};

export default function OwnerArea() {
  return <AreaRoutes area="owner" shell={<StaffShell area="owner" />} implemented={implemented} />;
}
