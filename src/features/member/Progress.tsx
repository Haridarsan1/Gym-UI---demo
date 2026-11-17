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
import { RANGES, measurementInfo, rangeStart, type MemberMeasurementKind, type RangeKey } from "@/domain/progress";
import { AttendanceCard, CompletionCard, MeasurementsCard, StrengthCard, VolumeCard, WeightCard, type Range } from "@/features/member/progress/Charts";
import { Goals } from "@/features/member/progress/Goals";
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
      <div className="space-y-3">
        <Chips label="Date range" value={key} options={RANGES.map((r) => ({ value: r.key, label: r.label }))} onChange={setKey} />
        <Button3D variant="white" className="w-full" onClick={() => open("weight")}>
          <Scale className="h-5 w-5" aria-hidden="true" />
          Log your weight or a measurement
        </Button3D>
      </div>
      <WeightCard data={data} range={range} onLog={() => open("weight")} />
      <MeasurementsCard data={data} range={range} onLog={() => open("waist")} />
      <StrengthCard data={data} range={range} />
      <VolumeCard data={data} range={range} />
      <AttendanceCard data={data} range={range} />
      <CompletionCard data={data} range={range} />
      <RecordsShelf data={data} />
      <Goals goals={data.goals} />
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
