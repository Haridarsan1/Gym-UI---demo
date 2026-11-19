import { AreaRoutes } from "@/app/AreaRoutes";
import { registerScreens } from "@/app/screens";
import { deskScreens } from "@/app/screens/desk";
import { StaffShell } from "@/design/shells/StaffShell";

registerScreens("desk", deskScreens);

/** Desk area. Screens built in this area’s milestone are added to `implemented`, keyed by screen id. */
export default function DeskArea() {
  return <AreaRoutes area="desk" shell={<StaffShell area="desk" />} />;
}
