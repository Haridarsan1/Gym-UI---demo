import { AreaRoutes } from "@/app/AreaRoutes";

/** Owner area. Screens built in this area’s milestone are added to `implemented`, keyed by screen id. */
export default function OwnerArea() {
  return <AreaRoutes area="owner" />;
}
