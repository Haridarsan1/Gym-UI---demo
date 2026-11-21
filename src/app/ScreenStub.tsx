import { Hammer } from "lucide-react";
import { EmptyState } from "@/design/States";
import { SubNav } from "@/app/SubNav";
import type { ScreenDef } from "@/app/screens";
import type { Area } from "@/domain/roles";

/** Stands in for a screen that is not in the demo yet. Says what the screen will do, in words for the person using it. */
export function ScreenStub({ area, screen }: { area: Area; screen: ScreenDef }) {
  return (
    <div>
      <SubNav area={area} screen={screen} />
      <h1 className="text-2xl font-bold tracking-tight">{screen.title}</h1>
      <div className="mt-6">
        <EmptyState icon={Hammer} title={`${screen.title} isn’t in this demo yet`}>
          {screen.summary}
        </EmptyState>
      </div>
    </div>
  );
}
