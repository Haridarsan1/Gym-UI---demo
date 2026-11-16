/**
 * Marketing copy and mock data.
 * Everything a non-developer may want to edit lives here.
 * NOTE: customer names, quotes and results below are placeholders — replace with real, approved ones before launch.
 */
import type { BranchRange, MemberRange } from "@/lib/api";

export const navLinks = [
  { label: "Features", href: "#features" },
  { label: "Demo", href: "#demo" },
  { label: "Pricing", href: "#pricing" },
  { label: "FAQ", href: "#faq" },
];

export type RoleKey = "owner" | "desk" | "trainer" | "member";

/** Placeholder quotes. Replace with real, approved quotes from your first customers before launch. */
export const stories = [
  {
    quote:
      "We used to keep renewals in a notebook at the desk and half of them got missed. Now I open the dashboard on Monday and call whoever is due that week.",
    person: "Neha Kulkarni",
    role: "Owner, Pulse Studio, Pune",
  },
  {
    quote:
      "The morning batch used to queue at the counter while we searched the register. Now they scan and walk in. My desk staff picked it up in a day.",
    person: "Imran Shaikh",
    role: "Branch manager, Bandra Barbell, Mumbai",
  },
];

export interface PricingTier {
  id: "starter" | "growth" | "pro" | "enterprise";
  name: string;
  memberLimit: number | null;
  monthly: number | null;
  yearlyMonthly: number | null;
  summary: string;
  features: string[];
}

/** Placeholder prices (INR, excl. GST). `yearlyMonthly` is the per-month price when billed yearly (about 20% off). */
export const pricingTiers: PricingTier[] = [
  {
    id: "starter",
    name: "Starter",
    memberLimit: 75,
    monthly: 2499,
    yearlyMonthly: 1999,
    summary: "For a single gym getting organised.",
    features: ["1 branch", "Memberships, GST invoices and UPI", "QR check-in", "Workout plans and logging", "Email reminders"],
  },
  {
    id: "growth",
    name: "Growth",
    memberLimit: 250,
    monthly: 4499,
    yearlyMonthly: 3599,
    summary: "For busy gyms with a training team.",
    features: ["Up to 3 branches", "Everything in Starter", "Personal training credits", "Trainer dashboards", "Core reports and CSV export"],
  },
  {
    id: "pro",
    name: "Pro",
    memberLimit: 500,
    monthly: 7999,
    yearlyMonthly: 6399,
    summary: "For multi-branch operators.",
    features: ["Unlimited branches", "Everything in Growth", "Advanced analytics", "Branch-level permissions", "Priority support"],
  },
  {
    id: "enterprise",
    name: "Enterprise",
    memberLimit: null,
    monthly: null,
    yearlyMonthly: null,
    summary: "For chains above 500 active members.",
    features: ["Custom member limits", "Assisted data import", "Uptime and support SLA", "Dedicated onboarding"],
  },
];

export const faqs = [
  {
    q: "Do I need a card to start the free trial?",
    a: "No. You get 14 days with every Growth feature. Add billing details only if you decide to continue.",
  },
  {
    q: "Can I import my existing members?",
    a: "Yes. Upload a spreadsheet of members and their remaining plan balances. We show a preview with row-level errors before anything is saved, so nothing is imported twice.",
  },
  {
    q: "Does it handle GST?",
    a: "Yes. Set your GSTIN and tax rates once. Every invoice and receipt shows the tax breakdown, and finance can export collections for your accountant.",
  },
  {
    q: "Which payment methods can members use?",
    a: "UPI, cards and net banking through your payment gateway, plus cash and bank transfer recorded at the desk. Partial payments can be switched on if you allow them.",
  },
  {
    q: "What counts as an active member for pricing?",
    a: "A member with an active, frozen or scheduled membership at any point in the billing month. Expired and canceled members don’t count.",
  },
  {
    q: "Can members use it on their phone?",
    a: "Yes. Members and trainers get a mobile-friendly app for workouts, bookings, progress and receipts. Nothing to install from an app store.",
  },
  {
    q: "Can I put my gym’s logo on it?",
    a: "Yes. Your logo appears on the member app, the login screen and every receipt.",
  },
];

export const cities = [
  "Mumbai",
  "Delhi",
  "Bengaluru",
  "Hyderabad",
  "Chennai",
  "Pune",
  "Kolkata",
  "Ahmedabad",
  "Jaipur",
  "Kochi",
  "Chandigarh",
  "Lucknow",
  "Indore",
  "Other",
];

export const branchOptions: Array<{ value: BranchRange; label: string }> = [
  { value: "1", label: "1 branch" },
  { value: "2-3", label: "2 to 3" },
  { value: "4-10", label: "4 to 10" },
  { value: "10+", label: "More than 10" },
];

export const memberOptions: Array<{ value: MemberRange; label: string; tier: PricingTier["id"] }> = [
  { value: "under-75", label: "Under 75", tier: "starter" },
  { value: "75-250", label: "75 to 250", tier: "growth" },
  { value: "250-500", label: "250 to 500", tier: "pro" },
  { value: "500+", label: "More than 500", tier: "enterprise" },
];

/* ───────────── Thermal home page additions ───────────── */

/** Interactive "Try the front desk" demo. Each member shows a different check-in outcome. */
export type DemoStatus = "allowed" | "allowed-dues" | "frozen" | "expired" | "no-visits";
export interface DemoMember {
  id: string;
  name: string;
  initials: string;
  plan: string;
  branch: string;
  status: DemoStatus;
  visitsLeft: number | null;
  detail: string;
}

export const demoMembers: DemoMember[] = [
  { id: "m1", name: "Arjun Kumar", initials: "AK", plan: "Monthly Plus", branch: "Andheri", status: "allowed", visitsLeft: 12, detail: "Push day assigned by Coach Meera" },
  { id: "m2", name: "Priya Sharma", initials: "PS", plan: "Quarterly", branch: "Andheri", status: "allowed-dues", visitsLeft: null, detail: "Invoice of ₹2,950 overdue by 4 days" },
  { id: "m3", name: "Rahul Mehta", initials: "RM", plan: "Annual", branch: "Bandra", status: "frozen", visitsLeft: null, detail: "Frozen until 5 December (travel)" },
  { id: "m4", name: "Ananya Iyer", initials: "AI", plan: "Monthly", branch: "Andheri", status: "expired", visitsLeft: null, detail: "Expired on 2 November" },
  { id: "m5", name: "Vikram Rao", initials: "VR", plan: "10-visit pass", branch: "Andheri", status: "no-visits", visitsLeft: 0, detail: "All 10 visits used" },
  { id: "m6", name: "Sneha Patil", initials: "SP", plan: "10-visit pass", branch: "Andheri", status: "allowed", visitsLeft: 4, detail: "First visit this week" },
  { id: "m7", name: "Karan Desai", initials: "KD", plan: "Annual", branch: "Andheri", status: "allowed", visitsLeft: null, detail: "New personal record yesterday" },
];

/** Scroll-pinned role tour. `heat` is the stage colour for that role. */
/** Role tour. `heat`/`soft` are kept for compatibility; colours come from the tour component. */
export const tourRoles: Array<{ key: RoleKey; tab: string; title: string; body: string; heat: string; soft: string }> = [
  {
    key: "owner",
    tab: "Owner",
    title: "Owner dashboard",
    body: "See collections, dues, renewals and check-ins for one branch or all of them. Branch managers only see the branches you give them.",
    heat: "",
    soft: "",
  },
  {
    key: "desk",
    tab: "Front desk",
    title: "Check-in and payments",
    body: "Find a member by name or QR code, see if their plan allows entry, take a payment and print or email the receipt.",
    heat: "",
    soft: "",
  },
  {
    key: "trainer",
    tab: "Trainer",
    title: "Trainer app",
    body: "Today’s sessions, clients who missed workouts, reviews that are due and clients who still need a plan, on the trainer’s phone.",
    heat: "",
    soft: "",
  },
  {
    key: "member",
    tab: "Member",
    title: "Member app",
    body: "Members see today’s workout, log their sets, book sessions, check their progress and renew without coming to the desk.",
    heat: "",
    soft: "",
  },
];
