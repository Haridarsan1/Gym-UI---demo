/** Badges reflect real effort. They are earned once and never taken away. Nothing can be bought. */
export const BADGES = {
  first_workout: { label: "First workout", description: "Finished your first workout." },
  workouts_10: { label: "10 workouts", description: "Finished 10 workouts." },
  workouts_50: { label: "50 workouts", description: "Finished 50 workouts." },
  workouts_100: { label: "100 workouts", description: "Finished 100 workouts." },
  first_pr: { label: "First personal record", description: "Lifted more than you ever have." },
  streak_4: { label: "4-week streak", description: "Hit your plan four weeks in a row." },
  goal_achieved: { label: "Goal achieved", description: "Reached a goal you set with your trainer." },
  checkins_50: { label: "50 check-ins", description: "Walked through the door 50 times." },
} as const;

export type BadgeKey = keyof typeof BADGES;
export const BADGE_KEYS = Object.keys(BADGES) as BadgeKey[];

export interface BadgeFacts {
  /** Workouts with status completed. */
  completedWorkouts: number;
  personalRecords: number;
  streakWeeks: number;
  goalsAchieved: number;
  checkIns: number;
}

export function earnedBadges(f: BadgeFacts): BadgeKey[] {
  const out: BadgeKey[] = [];
  if (f.completedWorkouts >= 1) out.push("first_workout");
  if (f.completedWorkouts >= 10) out.push("workouts_10");
  if (f.completedWorkouts >= 50) out.push("workouts_50");
  if (f.completedWorkouts >= 100) out.push("workouts_100");
  if (f.personalRecords >= 1) out.push("first_pr");
  if (f.streakWeeks >= 4) out.push("streak_4");
  if (f.goalsAchieved >= 1) out.push("goal_achieved");
  if (f.checkIns >= 50) out.push("checkins_50");
  return out;
}

/** Badges the member qualifies for and has not been awarded yet. */
export const newBadges = (alreadyAwarded: BadgeKey[], facts: BadgeFacts): BadgeKey[] => earnedBadges(facts).filter((b) => !alreadyAwarded.includes(b));
