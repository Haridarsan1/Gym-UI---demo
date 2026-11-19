import { AreaRoutes } from "@/app/AreaRoutes";
import { registerScreens } from "@/app/screens";
import { adminScreens } from "@/app/screens/admin";
import { StaffShell } from "@/design/shells/StaffShell";

registerScreens("admin", adminScreens);

/** Admin area. Screens built in this area’s milestone are added to `implemented`, keyed by screen id. */
export default function AdminArea() {
  return <AreaRoutes area="admin" shell={<StaffShell area="admin" />} />;
}
