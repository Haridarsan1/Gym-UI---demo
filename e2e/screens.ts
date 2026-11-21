/** Every screen of every area, as it is built: its address, its h1 (and for the trainer, whether it uses the three-zone layout). Add each new screen here: the responsive, accessibility and copy checks all read this list. */

/** Every trainer screen, as it is built: its address, its h1 and whether it uses the three-zone layout. Add each new screen here. */
export const TRAINER_SCREENS: Array<{ path: string; h1: string | RegExp; zones: boolean }> = [
  { path: "/t", h1: /^Good (morning|afternoon|evening), Meera$/, zones: true },
  { path: "/t/clients", h1: "Clients", zones: true },
  { path: "/t/clients/mem_arjun", h1: "Arjun Kumar", zones: true },
  { path: "/t/clients/mem_arjun/assessment", h1: "Assessment and goals", zones: true },
  { path: "/t/clients/mem_arjun/review", h1: "Review", zones: true },
  { path: "/t/schedule", h1: "Schedule", zones: true },
  { path: "/t/schedule?tab=availability", h1: "Schedule", zones: true },
  { path: "/t/schedule?tab=away", h1: "Schedule", zones: true },
  { path: "/t/log", h1: "Log a session", zones: false },
  { path: "/t/log?client=mem_126&date=2026-11-16", h1: "Log a session", zones: false },
  { path: "/t/library", h1: "Exercises", zones: true },
  { path: "/t/library/programs?member=mem_arjun", h1: "Program for Arjun Kumar", zones: true },
  { path: "/t/library/templates", h1: "Templates", zones: true },
  { path: "/t/library/templates?t=tpl_full3", h1: /^(Templates|Full body, three days)$/, zones: true },
  // On a phone the open exercise is the whole screen, so its name is the h1; beside the list the screen’s title is.
  { path: "/t/library?ex=ex_bench_press", h1: /^(Exercises|Barbell bench press)$/, zones: true },
];
export const DESK_SCREENS: Array<{ path: string; h1: string | RegExp }> = [{ path: "/desk", h1: "Check-in" }, { path: "/desk/new", h1: "New member" }, { path: "/desk/members", h1: "Members" }, { path: "/desk/members/mem_arjun", h1: "Arjun Kumar" }, { path: "/desk/members/mem_arjun?tab=billing", h1: "Arjun Kumar" }, { path: "/desk/dues", h1: "Dues" }, { path: "/desk/payments/new", h1: "Collect payment" }, { path: "/desk/bookings", h1: "Bookings" }]
export const OWNER_SCREENS: Array<{ path: string; h1: string | RegExp }> = [{ path: "/owner", h1: "Dashboard" }, { path: "/owner?range=7", h1: "Dashboard" }, { path: "/owner/reports", h1: "Reports" }, { path: "/owner/reports?report=invoices", h1: "Reports" }, { path: "/owner/reports?report=cash", h1: "Reports" }, { path: "/owner/plans", h1: "Plans and pricing" }, { path: "/owner/plans?plan=new", h1: "Plans and pricing" }, { path: "/owner/plans?plan=pl_visit10", h1: "Plans and pricing" }, { path: "/owner/policies", h1: "Policies" }, { path: "/owner/staff", h1: "Staff and roles" }, { path: "/owner/staff?invite=1", h1: "Staff and roles" }, { path: "/owner/staff?person=u_finance", h1: "Staff and roles" }, { path: "/owner/branches", h1: "Branches" }, { path: "/owner/branches?branch=br_andheri", h1: "Branches" }, { path: "/owner/communications", h1: "Communications" }, { path: "/owner/communications?status=skipped", h1: "Communications" }, { path: "/owner/import", h1: "Import members" }, { path: "/owner/subscription", h1: "Subscription" }, { path: "/owner/settings", h1: "Settings" }, { path: "/owner/audit", h1: "Audit log" }, { path: "/owner/audit?kind=setup", h1: "Audit log" }];
export const ADMIN_SCREENS: Array<{ path: string; h1: string | RegExp }> = [{ path: "/admin", h1: "Gyms" }, { path: "/admin/tenants/t_pulse", h1: "Pulse Fitness" }, { path: "/admin/tenants/t_lotus", h1: "Lotus Strength Club" }, { path: "/admin/support", h1: "Support access" }, { path: "/admin/plans", h1: "Ember plans" }];
export const FINANCE_SCREENS: Array<{ path: string; h1: string | RegExp }> = [{ path: "/desk/finance/refunds", h1: "Refunds" }, { path: "/desk/finance/invoices", h1: "Invoices and payments" }, { path: "/desk/finance/invoices?view=payments", h1: "Invoices and payments" }, { path: "/desk/finance/reconciliation", h1: "Reconciliation" }, { path: "/desk/finance/exports", h1: "Exports" }, { path: "/desk/finance/day-close", h1: "Day close" }];
export const MEMBER_SCREENS: Array<[string, string | RegExp]> = [
  ["/m", /^Good (morning|afternoon|evening)/],
  ["/m/program", "Program"],
  ["/m/progress", "Progress"],
  ["/m/progress/reviews", "Reviews and check-ins"],
  ["/m/bookings", "Bookings"],
  ["/m/membership", "Membership"],
  ["/m/pass", "Check-in pass"],
  ["/m/me", "Me"],
];
