import { useToday } from "@/api/hooks";
import type { TodaysWorkout } from "@/app/navigation";
import { PlayShell } from "@/design/shells/PlayShell";

/**
 * The member app’s shell. It reads Today so the raised button in the middle of the tab bar can start, or carry on, today’s
 * workout, and falls back to the check-in pass on a rest day, with no plan yet, when the membership is not active, or once the workout is done.
 */
export function MemberShell() {
  const today = useToday();
  const plan = today.data?.plan;
  // Only an active membership can train. Frozen, expired and pending members open their pass or their membership instead.
  const active = today.data?.membership?.status === "active";
  const open = active && plan?.state === "workout" && (!plan.logStatus || plan.logStatus === "draft");
  const workout: TodaysWorkout | undefined = open ? { date: plan.date, resume: plan.logStatus === "draft" } : undefined;
  return <PlayShell area="member" todaysWorkout={workout} />;
}
