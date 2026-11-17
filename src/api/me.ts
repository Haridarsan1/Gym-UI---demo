import { db } from "@/demo/db";
import { open } from "@/api/context";
import type { Session } from "@/app/session";
import type { Branch, Tenant } from "@/domain/types";

export interface Me {
  userId: string;
  name: string;
  role: Session["role"];
  tenant: Pick<Tenant, "id" | "name"> | null;
  /** Branches this person can work in. Owners see all of them. */
  branches: Array<Pick<Branch, "id" | "name">>;
  memberId?: string;
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
    tenant: tenant ? { id: tenant.id, name: tenant.name } : null,
    branches: branches.map(({ id, name }) => ({ id, name })),
    memberId: principal.memberId,
  };
}
