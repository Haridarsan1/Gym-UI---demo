/** The trainer area’s screens (docs/PLAN.md section 4). Loaded with the trainer area only. */
import { BookOpen, CalendarDays, ClipboardCheck, ClipboardList, FileText, Home, ListChecks, Sparkles, UserCog, Users } from "lucide-react";
import type { ScreenDef } from "@/app/screens";

export const trainerScreens: ScreenDef[] = [
  { id: "today", title: "Today", path: "", req: ["T07"], summary: "Your clients, today’s sessions, overdue reviews, recent missed workouts, credits about to expire, and members waiting for a plan.", action: "member.list", icon: Home, place: "tab" },
  { id: "clients", title: "Clients", path: "clients", req: ["T01", "S03"], summary: "Search and filter the members you train, with how well each is sticking to their plan.", action: "member.list", icon: Users, place: "tab" },
  { id: "client", title: "Client profile", path: "clients/:memberId", req: ["T02", "T05", "T06", "P01", "P02", "P03", "P04", "A02"], summary: "One client: current plan, logs and who entered them, progress, assessments, goals, notes, and history from earlier trainers.", action: "member.read", icon: Users, place: "sub", parent: "clients" },
  { id: "assessment", title: "Assessment", path: "clients/:memberId/assessment", req: ["T02", "P01"], summary: "Training experience, availability, preferences, restrictions the member reported, baseline measurements and goals with target dates.", action: "assessment.read", icon: ClipboardList, place: "sub", parent: "clients" },
  { id: "review", title: "Review", path: "clients/:memberId/review", req: ["T06", "P04"], summary: "Adherence, trends and the client’s feedback. Write shared feedback or a private note, and schedule a follow-up.", action: "review.write", icon: ClipboardCheck, place: "sub", parent: "clients" },
  { id: "log", title: "Log for a client", label: "Log session", path: "log", req: ["T05"], summary: "Log a coached session for a client. Entries show that you entered them.", action: "workoutlog.write", icon: ListChecks, place: "flow" },
  { id: "schedule", title: "Schedule", path: "schedule", req: ["O01", "O02", "T04", "M06"], summary: "Your availability, shifts and leave, your booked sessions, and marking each as attended or a no-show.", action: "schedule.manage", icon: CalendarDays, place: "tab" },
  { id: "exercises", title: "Exercise library", label: "Exercises", path: "library", req: ["W01"], summary: "Browse and search exercises by muscle and equipment, add your gym’s own, and archive ones you no longer use.", action: "exercise.read", icon: BookOpen, place: "tab" },
  { id: "templates", title: "Templates", path: "library/templates", req: ["W02"], summary: "Your own program templates and the ones shared across the gym.", action: "template.manage", icon: FileText, place: "sub", parent: "exercises" },
  { id: "builder", title: "Program builder", label: "Programs", path: "library/programs", req: ["W02", "T03", "T06"], summary: "Build a program by week and day, set sets, reps, load and rest, preview it as the member sees it, and publish a new version.", action: "workoutplan.write", icon: Sparkles, place: "sub", parent: "exercises" },
  { id: "me", title: "Me", label: "Profile and preferences", path: "me", req: ["S04"], summary: "Your profile and notification preferences.", icon: UserCog, place: "menu" },
];
