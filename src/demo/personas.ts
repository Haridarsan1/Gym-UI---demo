import { BRANCH } from "@/app/demoAccounts";
import type { Membership } from "@/domain/types";

/** The four sample members with logins. Each shows a different state of the member app. */
export interface Persona {
  memberId: string;
  userId: string;
  name: string;
  phone: string;
  email: string;
  branchId: string;
  planId: string;
  status: Membership["status"];
  /** Trainer’s user id. Without one the member has no trainer. */
  trainerId?: string;
  /** Days since the current membership started. */
  elapsed: number;
  /** How many earlier memberships sit behind the current one. */
  priors: number;
  visitsRemaining?: number;
}

export const PERSONAS: Persona[] = [
  // A workout today, 12 weeks of history, training credits, an unread review, a booking tomorrow.
  { memberId: "mem_arjun", userId: "u_member_arjun", name: "Arjun Kumar", phone: "9820022002", email: "arjun.kumar@example.in", branchId: BRANCH.andheri, planId: "pl_monthly_plus", status: "active", trainerId: "u_trainer_meera", elapsed: 9, priors: 3 },
  // A rest day today and a renewal invoice that is overdue.
  { memberId: "mem_priya", userId: "u_member_priya", name: "Priya Sharma", phone: "9820022003", email: "priya.sharma@example.in", branchId: BRANCH.andheri, planId: "pl_monthly", status: "active", trainerId: "u_trainer_aditya", elapsed: 27, priors: 1 },
  // Frozen for travel: the streak pauses and nothing counts as missed.
  { memberId: "mem_rahul", userId: "u_member_rahul", name: "Rahul Mehta", phone: "9820022004", email: "rahul.mehta@example.in", branchId: BRANCH.bandra, planId: "pl_annual", status: "frozen", trainerId: "u_trainer_farah", elapsed: 100, priors: 0 },
  // Has a trainer, but no plan has been published yet.
  { memberId: "mem_sneha", userId: "u_member_sneha", name: "Sneha Patil", phone: "9820022005", email: "sneha.patil@example.in", branchId: BRANCH.andheri, planId: "pl_visit10", status: "active", trainerId: "u_trainer_meera", elapsed: 12, priors: 0, visitsRemaining: 4 },
];
