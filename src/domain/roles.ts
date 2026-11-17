/** Roles from REQUIREMENTS R01–R05. Finance and front desk share the /desk area (R03) with different permissions. */
export const ROLES = ["platform_admin", "owner", "branch_manager", "front_desk", "finance", "trainer", "member"] as const;
export type Role = (typeof ROLES)[number];

/** The five places people work. Each is a separately loaded part of the app. */
export const AREAS = ["member", "trainer", "desk", "owner", "admin"] as const;
export type Area = (typeof AREAS)[number];

export const AREA_PATH: Record<Area, string> = {
  member: "/m",
  trainer: "/t",
  desk: "/desk",
  owner: "/owner",
  admin: "/admin",
};

const ROLE_AREA: Record<Role, Area> = {
  platform_admin: "admin",
  owner: "owner",
  branch_manager: "owner",
  front_desk: "desk",
  finance: "desk",
  trainer: "trainer",
  member: "member",
};

export const areaFor = (role: Role): Area => ROLE_AREA[role];
export const homePathFor = (role: Role): string => AREA_PATH[areaFor(role)];
