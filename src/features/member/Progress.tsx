import { useState } from "react";
import { Scale } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { useProgress } from "@/api";
import type { ProgressData } from "@/api";
import { SubNav } from "@/app/SubNav";
import { SCREENS } from "@/app/screens";
import { Button3D } from "@/design/Button3D";
import { QueryBoundary } from "@/design/QueryBoundary";
import { SkeletonCard } from "@/design/Skeleton";
import { useSession } from "@/app/SessionContext";
import { RANGES, measurementInfo, planCharts, rangeStart, type ChartSlot, type MemberMeasurementKind, type PlannedChart, type RangeKey } from "@/domain/progress";
import { AttendanceCard, CompletionCard, MeasurementsCard, StrengthCard, VolumeCard, WeightCard, type Range } from "@/features/member/progress/Charts";
import { Goals } from "@/features/member/progress/Goals";
import { KeyStats } from "@/features/member/progress/KeyStats";
import { useRememberedFlag } from "@/features/member/progress/useRemembered";
import { LogSheet } from "@/features/member/progress/LogSheet";
import { Chips } from "@/features/member/progress/MetricCard";
import { Photos } from "@/features/member/progress/Photos";
import { RecordsShelf } from "@/features/member/progress/Records";
import { formatWeekdayDate } from "@/lib/when";

/** Progress (P01 to P04, T06): charts with baseline, latest and change, records, goals, logging, photos. Reviews is the next tab. */
export default function Progress() {
  const query = useProgress();
  const screen = SCREENS.member.find((s) => s.id === "progress")!;
  return (
    <div>
      <SubNav area="member" screen={screen} />
      <div className="space-y-5">
        <header>
          <p className="text-sm text-clay-muted">{query.data ? formatWeekdayDate(query.data.today) : "Your progress"}</p>
          <h1 className="text-[1.7rem] font-bold leading-tight tracking-tight">Progress</h1>
        </header>
        <QueryBoundary query={query} errorTitle="We couldn’t load your progress" skeleton={<ProgressSkeleton />}>
          {(data) => <ProgressContent data={data} />}
        </QueryBoundary>
      </div>
    </div>
  );
}

function ProgressContent({ data }: { data: ProgressData }) {
  const [params, setParams] = useSearchParams();
  const asked = params.get("log");
  const [key, setKey] = useState<RangeKey>("12w");
  const [logging, setLogging] = useState<MemberMeasurementKind | null>(asked && measurementInfo(asked) ? (asked as MemberMeasurementKind) : null);
  const [lastKind, setLastKind] = useState<MemberMeasurementKind>("weight");

  const earliest = data.weeks[0] ?? data.today;
  const start = rangeStart(key, data.today, earliest);
  const from = start < earliest ? earliest : start;
  const range: Range = { from, to: data.today, firstWeek: Math.max(0, data.weeks.findIndex((w) => w >= from)) };
  const { session } = useSession();
  const [more, setMore] = useRememberedFlag(`ember.progress.moreCharts.${session?.userId ?? "anonymous"}`);
  const plan = planCharts(data.goals, data.strength.map((x) => x.exerciseId));
  const chart = (c: PlannedChart | { slot: ChartSlot }) => {
    const planned = c as PlannedChart;
    switch (c.slot) {
      case "weight": return <WeightCard key="weight" data={data} range={range} onLog={() => open("weight")} />;
      case "measurements": return <MeasurementsCard key="measurements" data={data} range={range} onLog={() => open("waist")} initialKind={planned.kind} />;
      case "strength": return <StrengthCard key="strength" data={data} range={range} initialExerciseId={planned.exerciseId} />;
      case "volume": return <VolumeCard key="volume" data={data} range={range} />;
      case "attendance": return <AttendanceCard key="attendance" data={data} range={range} />;
    }
  };
  const open = (kind: MemberMeasurementKind) => {
    setLastKind(kind);
    setLogging(kind);
  };
  const close = () => {
    setLogging(null);
    if (params.has("log")) {
      params.delete("log");
      setParams(params, { replace: true });
    }
  };

  return (
    <>
      <div className="space-y-3 md:flex md:items-center md:justify-between md:gap-4 md:space-y-0">
        <Chips label="Date range" value={key} options={RANGES.map((r) => ({ value: r.key, label: r.label }))} onChange={setKey} />
        <Button3D variant="white" className="w-full md:w-auto" onClick={() => open("weight")}>
          <Scale className="h-5 w-5" aria-hidden="true" />
          Log your weight or a measurement
        </Button3D>
      </div>
      <KeyStats data={data} range={range} />
      <div className="grid items-start gap-5 lg:grid-cols-2">
      {plan.linked.map((c) => chart(c))}
      <CompletionCard data={data} range={range} />
      {plan.rest.length > 0 && (
        <details open={more} onToggle={(e) => setMore(e.currentTarget.open)} className="clay-flat px-5 lg:col-span-2">
          <summary className="flex min-h-[3.5rem] cursor-pointer items-center justify-between gap-3 text-lg font-bold">
            More charts
            <span className="text-sm font-semibold text-clay-muted">{plan.rest.length}</span>
          </summary>
          <div className="grid items-start gap-5 pb-5 lg:grid-cols-2">{plan.rest.map((slot) => chart({ slot }))}</div>
        </details>
      )}
      </div>
      <div className="grid items-start gap-5 lg:grid-cols-2">
        <RecordsShelf data={data} />
        <Goals goals={data.goals} />
      </div>
      <Photos />
      <LogSheet open={logging !== null} initialKind={logging ?? lastKind} data={data} onClose={close} />
    </>
  );
}

function ProgressSkeleton() {
  return (
    <div className="space-y-5" role="status" aria-label="Loading your progress">
      <SkeletonCard />
      <SkeletonCard />
      <SkeletonCard />
    </div>
  );
}
