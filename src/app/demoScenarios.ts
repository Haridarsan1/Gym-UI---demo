/**
 * The demo guide’s scenarios (demo mode only): who to be and where to start. Starting one signs in as that person and opens the screen; it never resets anything.
 * This file is part of the marketing bundle (the login page links to the guide), so it must not import React Query, Dexie or Zod.
 */
export interface DemoScenario {
  id: string;
  title: string;
  /** One line on what it shows. */
  shows: string;
  /** Who you are while you do it, in words. */
  who: string;
  userId: string;
  /** Where it opens. */
  to: string;
}

export const DEMO_SCENARIOS: DemoScenario[] = [
  { id: "workout", title: "Log a workout as Arjun", shows: "A member does today’s workout set by set, finishes it and sees the result.", who: "Arjun Kumar, member", userId: "u_member_arjun", to: "/m" },
  { id: "review", title: "Review a client as Coach Meera", shows: "A trainer reads a client’s progress and writes the review that the client sees.", who: "Meera Joshi, trainer", userId: "u_trainer_meera", to: "/t/clients/mem_arjun/review" },
  { id: "checkin", title: "Check in a member at the front desk", shows: "The desk finds a member by name and sees at once whether they can come in.", who: "Pooja Nair, front desk", userId: "u_desk_andheri", to: "/desk" },
  { id: "refund", title: "Approve a refund as finance", shows: "Finance looks at refund requests from the desk and approves or declines each one.", who: "Deepa Menon, finance", userId: "u_finance", to: "/desk/finance/refunds" },
  { id: "dashboard", title: "See the dashboard as the owner", shows: "The owner sees billed against collected, dues, renewals and who is coming in.", who: "Neha Kulkarni, owner", userId: "u_owner", to: "/owner" },
  { id: "support", title: "Support access as Ember admin", shows: "An Ember administrator asks to look inside a gym, with a reason, for a short time.", who: "Ember Admin, platform admin", userId: "u_admin", to: "/admin/support" },
];
