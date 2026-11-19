import { AreaRoutes } from "@/app/AreaRoutes";
import { registerScreens } from "@/app/screens";
import { ownerScreens } from "@/app/screens/owner";
import { StaffShell } from "@/design/shells/StaffShell";

registerScreens("owner", ownerScreens);

/** Owner area. Screens built in this area’s milestone are added to `implemented`, keyed by screen id. */
export default function OwnerArea() {
  return <AreaRoutes area="owner" shell={<StaffShell area="owner" />} />;
}
