import { useParams } from "react-router-dom";
import { Hammer } from "lucide-react";
import { EmptyState } from "@/design/States";
import { SubNav } from "@/app/SubNav";
import { MILESTONE, type ScreenDef } from "@/app/screens";
import type { Area } from "@/domain/roles";

/** Stands in for a screen that is built in a later milestone. Says what the screen will do and when. */
export function ScreenStub({ area, screen }: { area: Area; screen: ScreenDef }) {
  const params = useParams();
  const idPart = Object.values(params).filter((v) => v && v !== "*")[0];
  return (
    <div>
      <SubNav area={area} screen={screen} />
      <h1 className="text-2xl font-bold tracking-tight">{screen.title}</h1>
      <p className="mt-1 text-sm text-clay-muted">Requirements {screen.req.join(", ")}</p>
      <div className="mt-6">
        <EmptyState icon={Hammer} title={`${screen.title} is built in milestone ${MILESTONE[area]}`}>
          {screen.summary}
          {idPart ? ` (Opened for ${idPart}.)` : ""}
        </EmptyState>
      </div>
    </div>
  );
}
