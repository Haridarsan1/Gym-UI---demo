import { lazy } from "react";
import { AreaRoutes } from "@/app/AreaRoutes";

/** Trainer area. Each screen is a separate file, loaded when the trainer opens it. Keys are screen ids from src/app/screens.ts. */
const implemented = {
  today: lazy(() => import("@/features/trainer/Today")),
  clients: lazy(() => import("@/features/trainer/Clients")),
  client: lazy(() => import("@/features/trainer/Clients")),
};

export default function TrainerArea() {
  return <AreaRoutes area="trainer" implemented={implemented} />;
}
