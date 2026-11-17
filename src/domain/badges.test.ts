import { describe, expect, it } from "vitest";
import { BADGES, earnedBadges, newBadges, type BadgeFacts } from "@/domain/badges";

const none: BadgeFacts = { completedWorkouts: 0, personalRecords: 0, streakWeeks: 0, goalsAchieved: 0, checkIns: 0 };

describe("badges", () => {
  it("has the badges from the plan and nothing that can be bought", () => {
    expect(Object.keys(BADGES)).toEqual(["first_workout", "workouts_10", "workouts_50", "workouts_100", "first_pr", "streak_4", "goal_achieved", "checkins_50"]);
  });
  it("earns nothing at the start", () => {
    expect(earnedBadges(none)).toEqual([]);
  });
  it("earns workout milestones at 1, 10, 50 and 100", () => {
    expect(earnedBadges({ ...none, completedWorkouts: 1 })).toEqual(["first_workout"]);
    expect(earnedBadges({ ...none, completedWorkouts: 9 })).toEqual(["first_workout"]);
    expect(earnedBadges({ ...none, completedWorkouts: 10 })).toEqual(["first_workout", "workouts_10"]);
    expect(earnedBadges({ ...none, completedWorkouts: 100 })).toEqual(["first_workout", "workouts_10", "workouts_50", "workouts_100"]);
  });
  it("earns the others from records, streak, goals and check-ins", () => {
    expect(earnedBadges({ ...none, personalRecords: 1, streakWeeks: 4, goalsAchieved: 1, checkIns: 50 })).toEqual(["first_pr", "streak_4", "goal_achieved", "checkins_50"]);
    expect(earnedBadges({ ...none, streakWeeks: 3, checkIns: 49 })).toEqual([]);
  });
  it("reports only badges not already awarded", () => {
    expect(newBadges(["first_workout"], { ...none, completedWorkouts: 10, personalRecords: 1 })).toEqual(["workouts_10", "first_pr"]);
    expect(newBadges(["first_workout", "workouts_10", "first_pr"], { ...none, completedWorkouts: 10, personalRecords: 3 })).toEqual([]);
  });
});
