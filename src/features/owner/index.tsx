import { lazy } from "react";
import { AreaRoutes } from "@/app/AreaRoutes";
import { registerScreens } from "@/app/screens";
import { ownerScreens } from "@/app/screens/owner";
import { StaffShell } from "@/design/shells/StaffShell";

registerScreens("owner", ownerScreens);

/** Owner area. Each screen is a separate file, loaded when it is opened. Keys are screen ids from src/app/screens/owner.ts. */
const implemented = {
  dashboard: lazy(() => import("@/features/owner/Dashboard")),
  reports: lazy(() => import("@/features/owner/Reports")),
  plans: lazy(() => import("@/features/owner/Plans")),
  policies: lazy(() => import("@/features/owner/Policies")),
  staff: lazy(() => import("@/features/owner/Staff")),
  branches: lazy(() => import("@/features/owner/Branches")),
};

export default function OwnerArea() {
  return <AreaRoutes area="owner" shell={<StaffShell area="owner" />} implemented={implemented} />;
}
