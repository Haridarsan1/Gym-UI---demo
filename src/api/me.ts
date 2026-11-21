import { db } from "@/demo/db";
import { open } from "@/api/context";
import type { Session } from "@/app/session";
import type { Banner } from "@/domain/subscriptionStatus";
import { quickStatus } from "@/domain/subscriptionQuick";
import { todayIST } from "@/domain/dates";
import { now } from "@/api/clock";
import type { Branch, Tenant } from "@/domain/types";

export interface Me {
  userId: string;
  name: string;
  role: Session["role"];
  tenant: Pick<Tenant, "id" | "name" | "logoUrl"> | null;
  /** Branches this person can work in. Owners see all of them. */
  branches: Array<Pick<Branch, "id" | "name">>;
  memberId?: string;
  /** What the gym’s subscription allows today, and what to tell the staff about it (S02). */
  subscription?: { effective: string; access: "full" | "readonly" | "export_only"; banner?: Banner };
}

/** Who is signed in, the gym they belong to, and the branches they can switch between. */
export async function getMe(session: Session | null): Promise<Me> {
  const { principal } = await open(session);
  const user = await db.users.get(principal.userId);
  const tenant = principal.tenantId ? await db.tenants.get(principal.tenantId) : undefined;
  const all = principal.tenantId ? await db.branches.where("tenantId").equals(principal.tenantId).toArray() : [];
  const branches = principal.role === "owner" ? all : all.filter((b) => principal.branchIds.includes(b.id));
  return {
    userId: principal.userId,
    name: user?.name ?? "",
    role: principal.role,
    tenant: tenant ? { id: tenant.id, name: tenant.name, logoUrl: tenant.logoUrl } : null,
    branches: branches.map(({ id, name }) => ({ id, name })),
    memberId: principal.memberId,
    subscription: tenant ? await subscriptionOf(tenant) : undefined,
  };
}

async function subscriptionOf(tenant: { name: string; subscription: Parameters<typeof quickStatus>[0] }) {
  const today = todayIST(now());
  const quick = quickStatus(tenant.subscription, today);
  if (quick) return quick;
  const st = (await import("@/domain/subscriptionStatus")).subscriptionStatus(tenant.subscription, tenant.name, today);
  return { effective: st.effective, access: st.access, banner: st.banner };
}
