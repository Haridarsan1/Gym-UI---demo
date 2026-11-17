import {
  Activity, BarChart3, BookOpen, Building2, CalendarDays, CalendarPlus, ClipboardCheck, ClipboardList, Dumbbell, FileSpreadsheet, FileText, Flag, Gauge, HandCoins,
  History, Home, LayoutDashboard, LifeBuoy, ListChecks, Map as MapIcon, MessageSquare, QrCode, ReceiptText, RefreshCcw, Scale, Settings, ShieldCheck, Sparkles,
  Star, Tags, Trophy, UserCog, UserPlus, Users, Wallet, type LucideIcon,
} from "lucide-react";
import type { Action } from "@/domain/permissions";
import type { Area } from "@/domain/roles";

/**
 * Every screen in docs/PLAN.md section 4, with where it lives and who may open it. The routes, the navigation and the
 * command palette all read this list, and a test checks it against PLAN.md so the two cannot drift apart.
 *
 * Titles match PLAN.md exactly. `label` is the shorter word used in tab bars and menus.
 */
export type Place =
  /** A tab in the bottom bar (member and trainer apps). */
  | "tab"
  /** In the avatar menu (member and trainer apps). */
  | "menu"
  /** In the sidebar, and in the bottom bar or More sheet on phones (staff consoles). */
  | "side"
  /** Reached from another screen: a sub-tab, a row, or a button. */
  | "sub"
  /** A flow started by a button, not by navigation. */
  | "flow";

export interface ScreenDef {
  id: string;
  title: string;
  label?: string;
  /** Path inside the area. "" is the area home. */
  path: string;
  /** Requirement IDs from docs/REQUIREMENTS.md. */
  req: string[];
  summary: string;
  /** Who may open it. Omit for any signed-in person in the area. */
  action?: Action;
  icon: LucideIcon;
  place: Place;
  /** Sidebar group heading for staff consoles. */
  group?: string;
  /** For sub screens: the id of the screen they belong to. */
  parent?: string;
  /** Order in the phone bottom bar for staff consoles. Lower comes first. Screens without one follow in list order. */
  mobile?: number;
}

export const MILESTONE: Record<Area, string> = { member: "M1", trainer: "M2", desk: "M3", owner: "M4", admin: "M5" };

const member: ScreenDef[] = [
  { id: "today", title: "Today", path: "", req: ["T07"], summary: "Today’s workout, your next booking, your weekly ring, streak, sessions left and renewal date.", action: "membership.read", icon: Home, place: "tab" },
  { id: "program", title: "Program path", label: "Program", path: "program", req: ["T03", "T06"], summary: "Your current plan as a path of workouts. Tap one to preview it, and look back at past weeks.", action: "workoutplan.read", icon: MapIcon, place: "tab" },
  { id: "workout", title: "Workout session", path: "workout/:dayId", req: ["W03", "T05", "W01"], summary: "Go through the exercises one by one: see the instructions, log each set against its target, swap an exercise, skip a set, and time your rest.", action: "workoutlog.write", icon: Dumbbell, place: "flow" },
  { id: "workout-complete", title: "Workout complete", path: "workout/:dayId/complete", req: ["W03", "P02", "P04"], summary: "A summary of what you finished, your volume, any personal records, and how it felt.", action: "workoutlog.write", icon: Trophy, place: "flow" },
  { id: "progress", title: "Progress", path: "progress", req: ["P01", "P02", "P03", "P04"], summary: "Charts for weight, measurements, strength, volume, attendance and completion, with your personal records and goals.", action: "progress.read", icon: Activity, place: "tab" },
  { id: "bookings", title: "Bookings", path: "bookings", req: ["T04", "O01", "M06"], summary: "Book training sessions against your trainer’s availability and your credits. See upcoming and past sessions.", action: "booking.read", icon: CalendarDays, place: "tab" },
  { id: "membership", title: "Membership", label: "Membership and receipts", path: "membership", req: ["M01", "M02", "M03", "M04"], summary: "Your plan, status and validity, visits left, freeze details, renewal, invoices, receipts and payments.", action: "membership.read", icon: Wallet, place: "menu" },
  { id: "pass", title: "Check-in pass", label: "Check-in pass", path: "pass", req: ["M05"], summary: "Your personal QR code for the front desk, and your last check-ins.", action: "checkin.read", icon: QrCode, place: "menu" },
  { id: "reviews", title: "Reviews and check-ins", label: "Reviews and check-ins", path: "reviews", req: ["P04", "T06"], summary: "Reviews your trainer shared with you, and a short form to tell them about effort, recovery and anything in the way.", action: "review.read", icon: Star, place: "menu" },
  { id: "me", title: "Me", label: "Profile, consent and preferences", path: "me", req: ["S04", "O04"], summary: "Your profile, what you have agreed to (photos, assessments, marketing), how we contact you, and a request for your data.", action: "member.read", icon: UserCog, place: "menu" },
];

const trainer: ScreenDef[] = [
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

const desk: ScreenDef[] = [
  { id: "checkin", title: "Check-in", path: "", req: ["M05", "A04"], summary: "Search for a member or scan their QR code, see whether they can enter, and record the visit. A repeat scan never uses a second visit.", action: "checkin.record", icon: QrCode, place: "side", group: "Front desk", mobile: 1 },
  { id: "new-member", title: "New member", path: "new", req: ["T01", "M01", "M03", "O03"], summary: "Register a member in a few steps: details, consent, plan, trainer, invoice and payment.", action: "member.create", icon: UserPlus, place: "side", group: "Front desk" },
  { id: "members", title: "Members", path: "members", req: ["M02"], summary: "Find any member at your branch and open their profile.", action: "member.list", icon: Users, place: "side", group: "Front desk", mobile: 2 },
  { id: "member", title: "Member profile", path: "members/:memberId", req: ["M02", "M03", "M04", "M05", "M06", "T01"], summary: "Membership, invoices and dues, payments, training credits, bookings, check-ins, trainer and messages for one member.", action: "member.read", icon: Users, place: "sub", parent: "members" },
  { id: "collect", title: "Collect payment", path: "payments/new", req: ["M03"], summary: "Take cash, UPI, card or transfer against an invoice, with a receipt by email or print.", action: "payment.record", icon: HandCoins, place: "side", group: "Front desk" },
  { id: "desk-bookings", title: "Bookings", path: "bookings", req: ["T04", "O01", "A03"], summary: "A day and week calendar by trainer and room. Book against availability and credits without double-booking.", action: "booking.manage", icon: CalendarPlus, place: "side", group: "Front desk", mobile: 3 },
  { id: "dues", title: "Dues", path: "dues", req: ["M03", "O04"], summary: "Unpaid and failed invoices, with a reminder you can send.", action: "dues.read", icon: ReceiptText, place: "side", group: "Front desk", mobile: 4 },
  { id: "invoices", title: "Invoices and payments", path: "finance/invoices", req: ["M03", "O07"], summary: "Search invoices and payments by status and branch, with billed and collected shown separately.", action: "report.view", icon: FileText, place: "side", group: "Finance" },
  { id: "refunds", title: "Refunds", path: "finance/refunds", req: ["M04", "M06"], summary: "Refund part or all of a payment, see what happens to unused credits, and review the history.", action: "refund.create", icon: RefreshCcw, place: "side", group: "Finance" },
  { id: "reconciliation", title: "Reconciliation", path: "finance/reconciliation", req: ["M03", "M04"], summary: "Match collections to gateway settlements and cash records, and review anything flagged, such as repeated gateway events.", action: "reconciliation.manage", icon: Scale, place: "side", group: "Finance" },
  { id: "exports", title: "Exports", path: "finance/exports", req: ["O06", "S03"], summary: "Download CSV reports for the branches you can see.", action: "report.export", icon: FileSpreadsheet, place: "side", group: "Finance" },
];

const owner: ScreenDef[] = [
  { id: "dashboard", title: "Dashboard", path: "", req: ["O06", "O07"], summary: "Collections against billed, dues, active and expiring memberships, renewals, check-in heat map, trainer utilisation and alerts.", action: "dashboard.view", icon: LayoutDashboard, place: "side", group: "Overview" },
  { id: "reports", title: "Reports", path: "reports", req: ["O06", "O07"], summary: "Memberships, renewals, leads, check-ins, classes, trainer utilisation, training credits, invoices, collections, dues and refunds, by branch and date, with CSV download.", action: "report.view", icon: BarChart3, place: "side", group: "Overview" },
  { id: "members", title: "Members", path: "members", req: ["M02"], summary: "Every member with filters and bulk actions.", action: "member.list", icon: Users, place: "side", group: "Overview" },
  { id: "plans", title: "Plans and pricing", path: "plans", req: ["M01", "M03"], summary: "Trial, time-based and visit-based plans: prices, dates, branches, visits, class entitlements, training credits, taxes and discounts.", action: "plan.read", icon: Tags, place: "side", group: "Set up" },
  { id: "staff", title: "Staff and roles", path: "staff", req: ["R02", "S03"], summary: "Invite staff, assign roles and branches, and set what each person may do.", action: "staff.manage", icon: UserCog, place: "side", group: "Set up" },
  { id: "branches", title: "Branches", path: "branches", req: ["O01"], summary: "Opening hours, rooms, capacity and local settings for each branch.", action: "branch.manage", icon: Building2, place: "side", group: "Set up" },
  { id: "policies", title: "Policies", path: "policies", req: ["M02", "M05", "T04", "O02"], summary: "Check-in window, freeze rules, grace periods, cancellation cutoffs, no-shows, proration and partial payments.", action: "policy.manage", icon: ShieldCheck, place: "side", group: "Set up" },
  { id: "communications", title: "Communications", path: "communications", req: ["O04"], summary: "Email templates, the delivery log with retry status, and sending that respects consent.", action: "communication.manage", icon: MessageSquare, place: "side", group: "Set up" },
  { id: "import", title: "Import members", path: "import", req: ["S01"], summary: "Upload a CSV, preview it with row-level errors, and import safely. Retrying never creates duplicates.", action: "import.run", icon: FileSpreadsheet, place: "side", group: "Set up" },
  { id: "subscription", title: "Subscription", path: "subscription", req: ["S02"], summary: "Your Ember plan, how much of each limit you use, your features, billing dates and software invoices. Separate from member billing.", action: "subscription.view", icon: Gauge, place: "side", group: "Account" },
  { id: "audit", title: "Audit log", path: "audit", req: ["S05"], summary: "Who changed memberships, refunds, credits, permissions and sensitive records, and when.", action: "audit.read", icon: History, place: "side", group: "Account" },
  { id: "settings", title: "Settings", path: "settings", req: ["R02"], summary: "Gym profile, logo, GSTIN, currency and time zone.", action: "settings.manage", icon: Settings, place: "side", group: "Account" },
];

const admin: ScreenDef[] = [
  { id: "tenants", title: "Tenants", path: "", req: ["S02", "S06"], summary: "Every gym with its health, subscription state and usage against limits.", action: "tenant.read", icon: Building2, place: "side", group: "Platform" },
  { id: "tenant", title: "Tenant detail", path: "tenants/:tenantId", req: ["S01", "S02"], summary: "One gym’s plan, limits, features, billing and onboarding progress.", action: "tenant.read", icon: Building2, place: "sub", parent: "tenants" },
  { id: "support", title: "Support access", path: "support", req: ["R01", "S05"], summary: "Ask for time-limited access to a gym with a reason. A banner shows while it is active, it ends on its own, and every action is audited.", action: "support.request", icon: LifeBuoy, place: "side", group: "Platform" },
  { id: "saas-plans", title: "SaaS plans", path: "plans", req: ["S02"], summary: "Ember plans and their limits on branches, staff and active members.", action: "saasplan.manage", icon: Flag, place: "side", group: "Platform" },
];

export const SCREENS: Record<Area, ScreenDef[]> = { member, trainer, desk, owner, admin };

/** Screens in the order they appear in navigation. */
export const screensIn = (area: Area, place: Place): ScreenDef[] => SCREENS[area].filter((s) => s.place === place);
