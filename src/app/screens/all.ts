/** Every area’s screens, registered. For tests and tools; the app loads one area at a time. */
import { registerScreens } from "@/app/screens";
import { memberScreens } from "@/app/screens/member";
import { trainerScreens } from "@/app/screens/trainer";
import { deskScreens } from "@/app/screens/desk";
import { ownerScreens } from "@/app/screens/owner";
import { adminScreens } from "@/app/screens/admin";

registerScreens("member", memberScreens);
registerScreens("trainer", trainerScreens);
registerScreens("desk", deskScreens);
registerScreens("owner", ownerScreens);
registerScreens("admin", adminScreens);
