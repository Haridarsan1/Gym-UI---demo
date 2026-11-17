import type { StaffLimits } from "@/domain/permissions";
import type { Role } from "@/domain/roles";

/**
 * The people in the seeded gym who can log in. The login page and the seed generator both read this list, so
 * the ids always match. Keep this file small and free of imports other than types: the login page is part of
 * the marketing bundle.
 */
export const TENANT_ID = "t_pulse";
export const BRANCH = { andheri: "br_andheri", bandra: "br_bandra", powai: "br_powai" } as const;
export const ALL_BRANCHES: string[] = [BRANCH.andheri, BRANCH.bandra, BRANCH.powai];

export interface DemoAccount {
  userId: string;
  name: string;
  role: Role;
  tenantId: string | null;
  branchIds: string[];
  memberId?: string;
  email: string;
  phone?: string;
  limits?: StaffLimits;
  /** Shown in the “Try as…” picker when true. */
  featured?: boolean;
  /** One line shown under the role in the picker. */
  blurb: string;
}

const owner: StaffLimits = { refundLimitPaise: null, canOverrideCheckIn: true, maxDiscountBp: 2000, canViewClientHealth: false };
const manager: StaffLimits = { refundLimitPaise: 5_000_000, canOverrideCheckIn: true, maxDiscountBp: 1000, canViewClientHealth: false };
const desk: StaffLimits = { refundLimitPaise: 0, canOverrideCheckIn: true, maxDiscountBp: 500, canViewClientHealth: false };
const finance: StaffLimits = { refundLimitPaise: 2_500_000, canOverrideCheckIn: false, maxDiscountBp: 500, canViewClientHealth: false };
const trainer: StaffLimits = { refundLimitPaise: 0, canOverrideCheckIn: false, maxDiscountBp: 0, canViewClientHealth: false };

export const DEMO_ACCOUNTS: DemoAccount[] = [
  { userId: "u_admin", name: "Ember Admin", role: "platform_admin", tenantId: null, branchIds: [], email: "admin@ember.example", featured: true, blurb: "Tenants, plans and support access" },
  { userId: "u_owner", name: "Neha Kulkarni", role: "owner", tenantId: TENANT_ID, branchIds: ALL_BRANCHES, email: "owner@pulsefitness.in", phone: "9820011001", limits: owner, featured: true, blurb: "Pulse Fitness, all 3 branches" },
  { userId: "u_bm_bandra", name: "Rohit Sethi", role: "branch_manager", tenantId: TENANT_ID, branchIds: [BRANCH.bandra], email: "rohit.sethi@pulsefitness.in", phone: "9820011002", limits: manager, featured: true, blurb: "Bandra branch only" },
  { userId: "u_desk_andheri", name: "Pooja Nair", role: "front_desk", tenantId: TENANT_ID, branchIds: [BRANCH.andheri], email: "pooja.nair@pulsefitness.in", phone: "9820011003", limits: desk, featured: true, blurb: "Front desk, Andheri" },
  { userId: "u_desk_bandra", name: "Imran Qureshi", role: "front_desk", tenantId: TENANT_ID, branchIds: [BRANCH.bandra], email: "imran.qureshi@pulsefitness.in", phone: "9820011004", limits: desk, blurb: "Front desk, Bandra" },
  { userId: "u_finance", name: "Deepa Menon", role: "finance", tenantId: TENANT_ID, branchIds: ALL_BRANCHES, email: "deepa.menon@pulsefitness.in", phone: "9820011005", limits: finance, featured: true, blurb: "Invoices, refunds and reconciliation" },
  { userId: "u_trainer_meera", name: "Meera Joshi", role: "trainer", tenantId: TENANT_ID, branchIds: [BRANCH.andheri, BRANCH.bandra], email: "meera.joshi@pulsefitness.in", phone: "9820011006", limits: trainer, featured: true, blurb: "Coach Meera, Andheri and Bandra" },
  { userId: "u_trainer_aditya", name: "Aditya Rao", role: "trainer", tenantId: TENANT_ID, branchIds: [BRANCH.andheri], email: "aditya.rao@pulsefitness.in", phone: "9820011007", limits: trainer, blurb: "Trainer, Andheri" },
  { userId: "u_trainer_farah", name: "Farah Khan", role: "trainer", tenantId: TENANT_ID, branchIds: [BRANCH.bandra], email: "farah.khan@pulsefitness.in", phone: "9820011008", limits: trainer, blurb: "Trainer, Bandra" },
  { userId: "u_trainer_sanjay", name: "Sanjay Patil", role: "trainer", tenantId: TENANT_ID, branchIds: [BRANCH.bandra, BRANCH.powai], email: "sanjay.patil@pulsefitness.in", phone: "9820011009", limits: trainer, blurb: "Trainer, Bandra and Powai" },
  { userId: "u_trainer_kavya", name: "Kavya Reddy", role: "trainer", tenantId: TENANT_ID, branchIds: [BRANCH.powai], email: "kavya.reddy@pulsefitness.in", phone: "9820011010", limits: trainer, blurb: "Trainer, Powai" },
  { userId: "u_trainer_vikrant", name: "Vikrant Singh", role: "trainer", tenantId: TENANT_ID, branchIds: [BRANCH.andheri, BRANCH.powai], email: "vikrant.singh@pulsefitness.in", phone: "9820011011", limits: trainer, blurb: "Trainer, Andheri and Powai" },
  { userId: "u_member_arjun", name: "Arjun Kumar", role: "member", tenantId: TENANT_ID, branchIds: [BRANCH.andheri], memberId: "mem_arjun", email: "arjun.kumar@example.in", phone: "9820022002", featured: true, blurb: "Monthly Plus member, trains with Coach Meera" },
];

export const findAccountByEmail = (email: string): DemoAccount | undefined => DEMO_ACCOUNTS.find((a) => a.email.toLowerCase() === email.trim().toLowerCase());
export const findAccountByPhone = (phone: string): DemoAccount | undefined => DEMO_ACCOUNTS.find((a) => a.phone === phone.replace(/\s/g, ""));
