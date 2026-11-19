/** The owner area’s screens (docs/PLAN.md section 4). Loaded with the owner area only. */
import { BarChart3, Building2, FileSpreadsheet, Gauge, History, LayoutDashboard, MessageSquare, Settings, ShieldCheck, Tags, UserCog, Users } from "lucide-react";
import type { ScreenDef } from "@/app/screens";

export const ownerScreens: ScreenDef[] = [
  { id: "dashboard", title: "Dashboard", path: "", req: ["O06", "O07"], summary: "Collections against billed, dues, active and expiring memberships, renewals, check-in heat map, trainer utilisation and alerts.", action: "dashboard.view", icon: LayoutDashboard, place: "side", group: "Overview" },
  { id: "reports", title: "Reports", path: "reports", req: ["O06", "O07"], summary: "Memberships, renewals, leads, check-ins, classes, trainer utilisation, training credits, invoices, collections, dues and refunds, by branch and date, with CSV download.", action: "report.view", icon: BarChart3, place: "side", group: "Overview" },
  { id: "members", title: "Members", path: "members", req: ["M02"], summary: "Every member with filters and bulk actions.", action: "member.list", icon: Users, place: "side", group: "Overview" },
  { id: "plans", title: "Plans and pricing", path: "plans", req: ["M01", "M03"], summary: "Trial, time-based and visit-based plans: prices, dates, branches, visits, class entitlements, training credits, taxes and discounts.", action: "plan.read", icon: Tags, place: "side", group: "Set up" },
  { id: "staff", title: "Staff and roles", path: "staff", req: ["R02", "S03"], summary: "Invite staff, assign roles and branches, and set what each person may do.", action: "staff.read", icon: UserCog, place: "side", group: "Set up" },
  { id: "branches", title: "Branches", path: "branches", req: ["O01"], summary: "Opening hours, rooms, capacity and local settings for each branch.", action: "branch.manage", icon: Building2, place: "side", group: "Set up" },
  { id: "policies", title: "Policies", path: "policies", req: ["M02", "M05", "T04", "O02"], summary: "Check-in window, freeze rules, grace periods, cancellation cutoffs, no-shows, proration and partial payments.", action: "policy.read", icon: ShieldCheck, place: "side", group: "Set up" },
  { id: "communications", title: "Communications", path: "communications", req: ["O04"], summary: "Email templates, the delivery log with retry status, and sending that respects consent.", action: "communication.manage", icon: MessageSquare, place: "side", group: "Set up" },
  { id: "import", title: "Import members", path: "import", req: ["S01"], summary: "Upload a CSV, preview it with row-level errors, and import safely. Retrying never creates duplicates.", action: "import.run", icon: FileSpreadsheet, place: "side", group: "Set up" },
  { id: "subscription", title: "Subscription", path: "subscription", req: ["S02"], summary: "Your Ember plan, how much of each limit you use, your features, billing dates and software invoices. Separate from member billing.", action: "subscription.view", icon: Gauge, place: "side", group: "Account" },
  { id: "audit", title: "Audit log", path: "audit", req: ["S05"], summary: "Who changed memberships, refunds, credits, permissions and sensitive records, and when.", action: "audit.read", icon: History, place: "side", group: "Account" },
  { id: "settings", title: "Settings", path: "settings", req: ["R02"], summary: "Gym profile, logo, GSTIN, currency and time zone.", action: "settings.manage", icon: Settings, place: "side", group: "Account" },
];
