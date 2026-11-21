import type { StaffLimits } from "@/domain/permissions";
import type { Role } from "@/domain/roles";

/**
 * The people in the seeded gym who can log in. The login page and the seed generator both read this list, so
 * the ids always match. Keep this file small and free of imports other than types: the login page is part of
 * the marketing bundle.
 */
export const TENANT_ID = "t_pulse";
export const TENANT_NAME = "Pulse Fitness";
export const BRANCH = { andheri: "br_andheri", bandra: "br_bandra", powai: "br_powai" } as const;
export const ALL_BRANCHES: string[] = [BRANCH.andheri, BRANCH.bandra, BRANCH.powai];

/** The second demo gym, so a person in one gym can be shown to see nothing of the other (S03). */
export const LOTUS_TENANT_ID = "t_lotus";
export const LOTUS_NAME = "Lotus Strength Club";
export const LOTUS_BRANCH = { koregaon: "br_lotus_kp", baner: "br_lotus_baner" } as const;
export const LOTUS_BRANCHES: string[] = [LOTUS_BRANCH.koregaon, LOTUS_BRANCH.baner];

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
  /** Extra sample members, each showing a different state. Listed under “More sample members” on the login page. */
  sample?: boolean;
  /** One line shown under the role in the picker. */
  blurb: string;
  /** Belongs to the second demo gym. Not on the login page’s pickers; listed apart in the role switcher so tenant isolation can be shown. */
  otherGym?: boolean;
}

const owner: StaffLimits = { refundLimitPaise: null, canOverrideCheckIn: true, maxDiscountBp: 2000, canViewClientHealth: false };
const manager: StaffLimits = { refundLimitPaise: 5_000_000, canOverrideCheckIn: true, maxDiscountBp: 1000, canViewClientHealth: false };
const desk: StaffLimits = { refundLimitPaise: 0, canOverrideCheckIn: true, maxDiscountBp: 500, canViewClientHealth: false };
const deskCapped: StaffLimits = { ...desk, maxOverridesPerDay: 2 };
const finance: StaffLimits = { refundLimitPaise: 2_500_000, canOverrideCheckIn: false, maxDiscountBp: 500, canViewClientHealth: false };
const trainer: StaffLimits = { refundLimitPaise: 0, canOverrideCheckIn: false, maxDiscountBp: 0, canViewClientHealth: false };

export const DEMO_ACCOUNTS: DemoAccount[] = [
  { userId: "u_admin", name: "Ember Admin", role: "platform_admin", tenantId: null, branchIds: [], email: "admin@ember.example", featured: true, blurb: "Tenants, plans and support access" },
  { userId: "u_owner", name: "Neha Kulkarni", role: "owner", tenantId: TENANT_ID, branchIds: ALL_BRANCHES, email: "owner@pulsefitness.in", phone: "9820011001", limits: owner, featured: true, blurb: "Pulse Fitness, all 3 branches" },
  { userId: "u_bm_bandra", name: "Rohit Sethi", role: "branch_manager", tenantId: TENANT_ID, branchIds: [BRANCH.bandra], email: "rohit.sethi@pulsefitness.in", phone: "9820011002", limits: manager, featured: true, blurb: "Bandra branch only" },
  { userId: "u_desk_andheri", name: "Pooja Nair", role: "front_desk", tenantId: TENANT_ID, branchIds: [BRANCH.andheri], email: "pooja.nair@pulsefitness.in", phone: "9820011003", limits: desk, featured: true, blurb: "Front desk, Andheri" },
  { userId: "u_desk_bandra", name: "Imran Qureshi", role: "front_desk", tenantId: TENANT_ID, branchIds: [BRANCH.bandra], email: "imran.qureshi@pulsefitness.in", phone: "9820011004", limits: desk, blurb: "Front desk, Bandra" },
  { userId: "u_desk_powai", name: "Tanvi Desai", role: "front_desk", tenantId: TENANT_ID, branchIds: [BRANCH.powai], email: "tanvi.desai@pulsefitness.in", phone: "9820011012", limits: deskCapped, blurb: "Front desk, Powai: two check-in overrides a day" },
  { userId: "u_finance", name: "Deepa Menon", role: "finance", tenantId: TENANT_ID, branchIds: ALL_BRANCHES, email: "deepa.menon@pulsefitness.in", phone: "9820011005", limits: finance, featured: true, blurb: "Invoices, refunds and reconciliation" },
  { userId: "u_trainer_meera", name: "Meera Joshi", role: "trainer", tenantId: TENANT_ID, branchIds: [BRANCH.andheri, BRANCH.bandra], email: "meera.joshi@pulsefitness.in", phone: "9820011006", limits: trainer, featured: true, blurb: "Coach Meera, Andheri and Bandra" },
  { userId: "u_trainer_aditya", name: "Aditya Rao", role: "trainer", tenantId: TENANT_ID, branchIds: [BRANCH.andheri], email: "aditya.rao@pulsefitness.in", phone: "9820011007", limits: trainer, blurb: "Trainer, Andheri" },
  { userId: "u_trainer_farah", name: "Farah Khan", role: "trainer", tenantId: TENANT_ID, branchIds: [BRANCH.bandra], email: "farah.khan@pulsefitness.in", phone: "9820011008", limits: trainer, blurb: "Trainer, Bandra" },
  { userId: "u_trainer_sanjay", name: "Sanjay Patil", role: "trainer", tenantId: TENANT_ID, branchIds: [BRANCH.bandra, BRANCH.powai], email: "sanjay.patil@pulsefitness.in", phone: "9820011009", limits: trainer, blurb: "Trainer, Bandra and Powai" },
  { userId: "u_trainer_kavya", name: "Kavya Reddy", role: "trainer", tenantId: TENANT_ID, branchIds: [BRANCH.powai], email: "kavya.reddy@pulsefitness.in", phone: "9820011010", limits: trainer, blurb: "Trainer, Powai" },
  { userId: "u_trainer_vikrant", name: "Vikrant Singh", role: "trainer", tenantId: TENANT_ID, branchIds: [BRANCH.andheri, BRANCH.powai], email: "vikrant.singh@pulsefitness.in", phone: "9820011011", limits: trainer, blurb: "Trainer, Andheri and Powai" },
  { userId: "u_member_arjun", name: "Arjun Kumar", role: "member", tenantId: TENANT_ID, branchIds: [BRANCH.andheri], memberId: "mem_arjun", email: "arjun.kumar@example.in", phone: "9820022002", featured: true, blurb: "Monthly Plus member, trains with Coach Meera" },
  { userId: "u_member_priya", name: "Priya Sharma", role: "member", tenantId: TENANT_ID, branchIds: [BRANCH.andheri], memberId: "mem_priya", email: "priya.sharma@example.in", phone: "9820022003", sample: true, blurb: "Rest day today, a renewal invoice is overdue" },
  { userId: "u_member_rahul", name: "Rahul Mehta", role: "member", tenantId: TENANT_ID, branchIds: [BRANCH.bandra], memberId: "mem_rahul", email: "rahul.mehta@example.in", phone: "9820022004", sample: true, blurb: "Membership frozen for travel, streak paused" },
  { userId: "u_member_sneha", name: "Sneha Patil", role: "member", tenantId: TENANT_ID, branchIds: [BRANCH.andheri], memberId: "mem_sneha", email: "sneha.patil@example.in", phone: "9820022005", sample: true, blurb: "10-visit pass, trainer is still preparing a plan" },
  // A parent and a teenage child who share one mobile number and one email, as families often do (the login asks “Which profile?”).
  { userId: "u_member_meena", name: "Meena Ramaswamy", role: "member", tenantId: TENANT_ID, branchIds: [BRANCH.andheri], memberId: "mem_040", email: "meena.ramaswamy@example.in", phone: "9820022090", sample: true, blurb: "Shares a phone number and email with her son Aarav" },
  { userId: "u_member_aarav", name: "Aarav Ramaswamy", role: "member", tenantId: TENANT_ID, branchIds: [BRANCH.andheri], memberId: "mem_041", email: "meena.ramaswamy@example.in", phone: "9820022090", sample: true, blurb: "Teenager on his mother’s number and email" },
  // Lotus Strength Club: a second, smaller gym in Pune, with its own people, so what each gym can see of the other is shown to be nothing.
  { userId: "u_lotus_owner", name: "Anita Desai", role: "owner", tenantId: LOTUS_TENANT_ID, branchIds: LOTUS_BRANCHES, email: "anita@lotusclub.example", phone: "9300000101", limits: owner, otherGym: true, blurb: "Lotus Strength Club, a second gym in Pune" },
  { userId: "u_lotus_bm", name: "Rakesh Pawar", role: "branch_manager", tenantId: LOTUS_TENANT_ID, branchIds: [LOTUS_BRANCH.baner], email: "rakesh@lotusclub.example", phone: "9300000102", limits: manager, otherGym: true, blurb: "Lotus, Baner branch only" },
  { userId: "u_lotus_desk", name: "Sneha Kale", role: "front_desk", tenantId: LOTUS_TENANT_ID, branchIds: [LOTUS_BRANCH.koregaon], email: "sneha@lotusclub.example", phone: "9300000103", limits: desk, otherGym: true, blurb: "Lotus front desk, Koregaon Park" },
  { userId: "u_lotus_trainer", name: "Imran Shaikh", role: "trainer", tenantId: LOTUS_TENANT_ID, branchIds: LOTUS_BRANCHES, email: "imran@lotusclub.example", phone: "9300000104", limits: trainer, otherGym: true, blurb: "Lotus trainer, both branches" },
  { userId: "u_lotus_member", name: "Nisha Bhat", role: "member", tenantId: LOTUS_TENANT_ID, branchIds: [LOTUS_BRANCH.koregaon], memberId: "mem_lotus_001", email: "nisha.bhat@example.in", phone: "9300001001", otherGym: true, blurb: "Member of Lotus Strength Club" },
];

/** Every person who signs in with this email: more than one when a family shares it. */
export const findAccountsByEmail = (email: string): DemoAccount[] => DEMO_ACCOUNTS.filter((a) => a.email.toLowerCase() === email.trim().toLowerCase());
/** Every person who signs in with this mobile number: more than one when a family shares it. */
export const findAccountsByPhone = (phone: string): DemoAccount[] => DEMO_ACCOUNTS.filter((a) => a.phone === phone.replace(/\s/g, ""));
/** The other profiles on the same phone number or email as this person, for the “Switch profile” choice. */
export const otherProfiles = (userId: string): DemoAccount[] => {
  const me = DEMO_ACCOUNTS.find((a) => a.userId === userId);
  if (!me || me.role !== "member") return [];
  return DEMO_ACCOUNTS.filter((a) => a.userId !== userId && a.role === "member" && ((me.phone && a.phone === me.phone) || a.email.toLowerCase() === me.email.toLowerCase()));
};

