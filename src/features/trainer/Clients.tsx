import { Link, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ArrowLeft, UserRound } from "lucide-react";
import { useClient } from "@/api/hooks";
import { QueryBoundary } from "@/design/QueryBoundary";
import { SkeletonCard } from "@/design/Skeleton";
import { ThreeZone } from "@/design/layout/ThreeZone";
import { useSplit } from "@/design/useMediaQuery";
import { ClientList } from "@/features/trainer/clients/ClientList";
import { ClientProfileView } from "@/features/trainer/clients/ClientProfileView";
import { Glance } from "@/features/trainer/clients/Glance";
import type { ClientFlag } from "@/api/clients";

/**
 * Clients (T01) and the client profile (T02, T05, T06, A02), one screen on two addresses: `/t/clients` and
 * `/t/clients/:memberId`. The search and filter live in the address too, so a refresh or a shared link shows the same list.
 *
 * - Phone: the list, and picking a client opens their profile with a Back link.
 * - From 768 px: the list on the left, the client beside it.
 * - From 1280 px: a third zone with the client at a glance.
 */
export default function Clients() {
  const { memberId } = useParams();
  const split = useSplit();
  const [params, setParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const search = params.get("q") ?? "";
  const flagParam = params.get("f") as ClientFlag | null;
  const filter = flagParam && ["review", "missed", "plan", "credits", "frozen"].includes(flagParam) ? flagParam : "all";
  // The list’s own settings are carried to a client and back, so Back returns to the same list.
  const keep = new URLSearchParams();
  if (search) keep.set("q", search);
  if (filter !== "all") keep.set("f", filter);
  const suffix = keep.toString() ? `?${keep}` : "";
  const setList = (next: { q?: string; f?: string }) => {
    const q = new URLSearchParams(params);
    for (const [k, v] of Object.entries(next)) (v ? q.set(k, v) : q.delete(k));
    if (memberId) navigate({ pathname: location.pathname, search: q.toString() ? `?${q}` : "" }, { replace: true });
    else setParams(q, { replace: true });
  };
  const list = <ClientList selectedId={memberId} search={search} filter={filter} onSearch={(q) => setList({ q })} onFilter={(f) => setList({ f: f === "all" ? "" : f })} linkSuffix={suffix} />;

  if (!split) {
    if (!memberId) return <div className="space-y-4"><h1 className="text-[1.7rem] font-bold tracking-tight">Clients</h1>{list}</div>;
    return (
      <div>
        <Link to={`/t/clients${suffix}`} className="mb-3 inline-flex min-h-[2.75rem] items-center gap-1.5 rounded-xl pr-3 font-semibold text-clay-muted hover:text-clay-ink">
          <ArrowLeft className="h-5 w-5" aria-hidden="true" />
          Clients
        </Link>
        <ClientProfileView memberId={memberId} />
      </div>
    );
  }
  return (
    <div className="space-y-4">
      {!memberId && <h1 className="text-[1.7rem] font-bold tracking-tight lg:text-4xl">Clients</h1>}
      <ThreeZone
        listWidth="minmax(16rem,20rem)"
        list={list}
        detail={memberId ? <ClientProfileView memberId={memberId} /> : <Placeholder>Pick a client to see how they are doing.</Placeholder>}
        context={memberId ? <ContextFor memberId={memberId} /> : <Placeholder>Their membership, review and notes show here.</Placeholder>}
      />
    </div>
  );
}

function Placeholder({ children }: { children: string }) {
  return (
    <div className="clay grid place-items-center px-6 py-14 text-center text-clay-muted">
      <div>
        <UserRound className="mx-auto h-8 w-8" aria-hidden="true" />
        <p className="mt-2 max-w-[16rem]">{children}</p>
      </div>
    </div>
  );
}

function ContextFor({ memberId }: { memberId: string }) {
  const query = useClient(memberId);
  return (
    <QueryBoundary query={query} skeleton={<SkeletonCard label="Loading client" />} errorTitle="">
      {(p) => <Glance p={p} />}
    </QueryBoundary>
  );
}
