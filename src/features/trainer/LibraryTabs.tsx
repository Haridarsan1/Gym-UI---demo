import { SubNav } from "@/app/SubNav";
import { SCREENS } from "@/app/screens";

/** The Library’s tabs: Exercises, Templates and Programs (the registry’s sub screens). */
export function LibraryTabs() {
  const screen = SCREENS.trainer.find((s) => s.id === "exercises")!;
  return <SubNav area="trainer" screen={screen} />;
}
