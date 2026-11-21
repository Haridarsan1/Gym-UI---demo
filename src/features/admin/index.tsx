import { lazy } from "react";
import { AreaRoutes } from "@/app/AreaRoutes";
import { registerScreens } from "@/app/screens";
import { adminScreens } from "@/app/screens/admin";
import { StaffShell } from "@/design/shells/StaffShell";

registerScreens("admin", adminScreens);

/** Admin area. Each screen is a separate file, loaded when it is opened. Keys are screen ids from src/app/screens/admin.ts. */
const implemented = {
  tenants: lazy(() => import("@/features/admin/Tenants")),
  tenant: lazy(() => import("@/features/admin/TenantDetail")),
  support: lazy(() => import("@/features/admin/Support")),
  "saas-plans": lazy(() => import("@/features/admin/SaasPlans")),
};

export default function AdminArea() {
  return <AreaRoutes area="admin" shell={<StaffShell area="admin" />} implemented={implemented} />;
}
