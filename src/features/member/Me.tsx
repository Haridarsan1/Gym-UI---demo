import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { useProfile } from "@/api";
import type { ProfileData } from "@/api";
import { Avatar } from "@/design/Avatar";
import { setHapticsEnabled } from "@/design/haptics";
import { QueryBoundary } from "@/design/QueryBoundary";
import { SkeletonCard, SkeletonRows } from "@/design/Skeleton";
import { ConsentCard } from "@/features/member/me/ConsentCard";
import { DataRequests } from "@/features/member/me/DataRequests";
import { PreferencesCard } from "@/features/member/me/PreferencesCard";
import { formatDate } from "@/lib/when";

/** Me (S04, O04): your details, what you have agreed to, which emails you get, and requests for your data. */
export default function Me() {
  const query = useProfile();
  return (
    <div className="space-y-5">
      <header>
        <p className="text-sm text-clay-muted">Your details and choices</p>
        <h1 className="text-[1.7rem] font-bold leading-tight tracking-tight">Me</h1>
      </header>
      <QueryBoundary query={query} errorTitle="We couldn’t load your details" skeleton={<MeSkeleton />}>
        {(p) => <MeContent p={p} />}
      </QueryBoundary>
    </div>
  );
}

function MeContent({ p }: { p: ProfileData }) {
  const { hash } = useLocation();
  // The device keeps a copy of the vibration choice so a buzz doesn’t have to ask the database.
  useEffect(() => setHapticsEnabled(p.hapticsOn), [p.hapticsOn]);
  // Links such as /m/me#consent land on that section once it has loaded.
  useEffect(() => {
    if (hash) document.getElementById(hash.slice(1))?.scrollIntoView({ block: "start" });
  }, [hash]);

  return (
    <div className="grid items-start gap-5 lg:grid-cols-2 lg:gap-8">
      <div className="min-w-0 space-y-5">
      <section aria-labelledby="profile-title" className="clay p-5">
        <div className="flex items-center gap-4">
          <Avatar name={p.name} className="h-14 w-14 shrink-0" />
          <div className="min-w-0">
            <h2 id="profile-title" className="truncate text-xl font-bold">{p.name}</h2>
            <p className="text-sm text-clay-muted">Member since {formatDate(p.joinedOn)}</p>
          </div>
        </div>
        <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-[0.95rem]">
          <Detail label="Mobile" value={p.phone} />
          <Detail label="Email" value={p.email ?? "None on file"} />
          <Detail label="Home branch" value={p.branchName} />
          <Detail label="Your trainer" value={p.trainerName ?? "Not assigned yet"} />
        </dl>
        <p className="mt-3 text-sm text-clay-muted">To change your details, ask the front desk.</p>
      </section>
      <ConsentCard consents={p.consents} />
      </div>
      <div className="min-w-0 space-y-5">
      <PreferencesCard p={p} />
      <DataRequests p={p} />
      </div>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-sm text-clay-muted">{label}</dt>
      <dd className="truncate font-semibold">{value}</dd>
    </div>
  );
}

function MeSkeleton() {
  return (
    <div className="space-y-5" role="status" aria-label="Loading your details">
      <SkeletonCard />
      <SkeletonRows rows={4} />
    </div>
  );
}
