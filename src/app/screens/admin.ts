/** The admin area’s screens (docs/PLAN.md section 4). Loaded with the admin area only. */
import { Building2, Flag, LifeBuoy } from "lucide-react";
import type { ScreenDef } from "@/app/screens";

export const adminScreens: ScreenDef[] = [
  { id: "tenants", title: "Tenants", path: "", req: ["S02", "S06"], summary: "Every gym with its health, subscription state and usage against limits.", action: "tenant.read", icon: Building2, place: "side", group: "Platform" },
  { id: "tenant", title: "Tenant detail", path: "tenants/:tenantId", req: ["S01", "S02"], summary: "One gym’s plan, limits, features, billing and onboarding progress.", action: "tenant.read", icon: Building2, place: "sub", parent: "tenants" },
  { id: "support", title: "Support access", path: "support", req: ["R01", "S05"], summary: "Ask for time-limited access to a gym with a reason. A banner shows while it is active, it ends on its own, and every action is audited.", action: "support.request", icon: LifeBuoy, place: "side", group: "Platform" },
  { id: "saas-plans", title: "SaaS plans", path: "plans", req: ["S02"], summary: "Ember plans and their limits on branches, staff and active members.", action: "saasplan.manage", icon: Flag, place: "side", group: "Platform" },
];
