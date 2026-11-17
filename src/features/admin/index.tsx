import { AreaRoutes } from "@/app/AreaRoutes";

/** Admin area. Screens built in this area’s milestone are added to `implemented`, keyed by screen id. */
export default function AdminArea() {
  return <AreaRoutes area="admin" />;
}
