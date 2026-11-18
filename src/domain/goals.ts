/** What a goal can be about (T02). The metric decides where its progress is read from: readings, lifts or workouts. */
export const GOAL_METRICS = [
  { key: "weight", label: "Body weight", unit: "kg" },
  { key: "waist", label: "Waist", unit: "cm" },
  { key: "body_fat", label: "Body fat", unit: "%" },
  { key: "bench_press", label: "Bench press", unit: "kg" },
  { key: "squat", label: "Squat", unit: "kg" },
  { key: "deadlift", label: "Deadlift", unit: "kg" },
  { key: "overhead_press", label: "Overhead press", unit: "kg" },
  { key: "sessions_per_week", label: "Workouts a week", unit: "sessions" },
] as const;

export type GoalMetric = (typeof GOAL_METRICS)[number]["key"];
export const metricInfo = (key: string) => GOAL_METRICS.find((m) => m.key === key);

/** The days of the week as the assessment form shows them, Monday first. The number is `Date.getDay()` (0 is Sunday). */
export const WEEKDAYS = [{ n: 1, label: "Mon" }, { n: 2, label: "Tue" }, { n: 3, label: "Wed" }, { n: 4, label: "Thu" }, { n: 5, label: "Fri" }, { n: 6, label: "Sat" }, { n: 0, label: "Sun" }] as const;
export const EXPERIENCE_LABEL = { new: "New to training", some: "Some experience", experienced: "Experienced" } as const;
export const TIME_LABEL = { morning: "Mornings", midday: "Middle of the day", evening: "Evenings", any: "Any time" } as const;
