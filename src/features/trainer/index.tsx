import { lazy } from "react";
import { AreaRoutes } from "@/app/AreaRoutes";
import { registerScreens } from "@/app/screens";
import { trainerScreens } from "@/app/screens/trainer";
import { PlayShell } from "@/design/shells/PlayShell";

registerScreens("trainer", trainerScreens);

/** Trainer area. Each screen is a separate file, loaded when the trainer opens it. Keys are screen ids from src/app/screens.ts. */
const implemented = {
  today: lazy(() => import("@/features/trainer/Today")),
  clients: lazy(() => import("@/features/trainer/Clients")),
  client: lazy(() => import("@/features/trainer/Clients")),
  assessment: lazy(() => import("@/features/trainer/Assessment")),
  exercises: lazy(() => import("@/features/trainer/Library")),
  builder: lazy(() => import("@/features/trainer/Builder")),
  review: lazy(() => import("@/features/trainer/Review")),
  log: lazy(() => import("@/features/trainer/Log")),
  templates: lazy(() => import("@/features/trainer/Templates")),
};

export default function TrainerArea() {
  return <AreaRoutes area="trainer" shell={<PlayShell area="trainer" />} implemented={implemented} />;
}
