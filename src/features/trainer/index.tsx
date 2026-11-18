import { lazy } from "react";
import { AreaRoutes } from "@/app/AreaRoutes";

/** Trainer area. Each screen is a separate file, loaded when the trainer opens it. Keys are screen ids from src/app/screens.ts. */
const implemented = {
  today: lazy(() => import("@/features/trainer/Today")),
  clients: lazy(() => import("@/features/trainer/Clients")),
  client: lazy(() => import("@/features/trainer/Clients")),
  assessment: lazy(() => import("@/features/trainer/Assessment")),
  exercises: lazy(() => import("@/features/trainer/Library")),
  builder: lazy(() => import("@/features/trainer/Builder")),
  templates: lazy(() => import("@/features/trainer/Templates")),
};

export default function TrainerArea() {
  return <AreaRoutes area="trainer" implemented={implemented} />;
}
