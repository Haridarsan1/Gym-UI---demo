import { Link, useSearchParams } from "react-router-dom";
import { useClients, useProgramSource } from "@/api/trainerHooks";
import { Avatar } from "@/design/Avatar";
import { QueryBoundary } from "@/design/QueryBoundary";
import { SkeletonCard, SkeletonRows } from "@/design/Skeleton";
import { LibraryTabs } from "@/features/trainer/LibraryTabs";
import { ProgramEditor } from "@/features/trainer/program/ProgramEditor";

/**
 * The program builder (`/t/library/programs?member=…`): build or revise a client’s program, preview it as they will see it,
 * and publish it as a new version. Without a client it asks who the program is for.
 */
export default function Builder() {
  const [params] = useSearchParams();
  const memberId = params.get("member") ?? undefined;
  return memberId ? <ForClient memberId={memberId} /> : <ChooseClient />;
}

function ForClient({ memberId }: { memberId: string }) {
  const query = useProgramSource(memberId);
  return (
    <QueryBoundary query={query} errorTitle="We couldn’t open the builder" skeleton={<SkeletonCard label="Loading program" />}>
      {(source) => <ProgramEditor key={source.memberId} kind="member" source={source} />}
    </QueryBoundary>
  );
}

function ChooseClient() {
  const query = useClients({ flag: undefined });
  return (
    <div className="space-y-4">
      <LibraryTabs />
      <header>
        <h1 className="text-[1.7rem] font-bold leading-tight tracking-tight lg:text-4xl">Program builder</h1>
        <p className="text-clay-muted">Choose the client you are building a program for. Templates have their own tab.</p>
      </header>
      <QueryBoundary query={query} errorTitle="We couldn’t load your clients" skeleton={<SkeletonRows rows={6} label="Loading clients" />}>
        {(rows) => (
          <ul aria-label="Choose a client" className="clay space-y-1 p-2">
            {rows.map((r) => (
              <li key={r.memberId}>
                <Link to={`/t/library/programs?member=${r.memberId}`} className="flex min-h-[3.5rem] items-center gap-3 rounded-2xl px-3 py-2 hover:bg-clay-canvas">
                  <Avatar name={r.name} />
                  <span className="min-w-0 flex-1"><span className="block truncate font-semibold">{r.name}</span><span className="block truncate text-sm text-clay-muted">{r.programName ?? "No plan yet"}</span></span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </QueryBoundary>
    </div>
  );
}
