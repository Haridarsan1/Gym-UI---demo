import { db } from "@/demo/db";
import { assertCan, open } from "@/api/context";
import { ApiError } from "@/api/errors";
import { can, type Resource } from "@/domain/permissions";
import { todayIST } from "@/domain/dates";
import { assignmentOn, currentMembership } from "@/domain/membership";
import type { Member, Membership } from "@/domain/types";
import type { Session } from "@/app/session";

export interface MemberListItem {
  id: string;
  name: string;
  phone: string;
  homeBranchId: string;
  branchName: string;
  /** "none" when the member has never had a membership. */
  membershipStatus: Membership["status"] | "none";
  planName?: string;
  endsOn?: string;
  trainerId?: string;
  trainerName?: string;
}

export interface MemberListParams {
  search?: string;
  branchId?: string;
  status?: Membership["status"] | "none";
  page?: number;
  pageSize?: number;
}

export interface MemberPage {
  rows: MemberListItem[];
  total: number;
  page: number;
  pageSize: number;
}

/** Members the caller is allowed to see: everyone for owners, a branch for branch staff, assigned clients for trainers. */
export async function listMembers(session: Session | null, params: MemberListParams = {}): Promise<MemberPage> {
  const { principal } = await open(session);
  assertCan(principal, "member.list");
  const tenantId = principal.tenantId!;
  const today = todayIST();

  const [members, memberships, assignments, branches, users] = await Promise.all([
    db.members.where("tenantId").equals(tenantId).toArray(),
    db.memberships.where("tenantId").equals(tenantId).toArray(),
    db.trainerAssignments.where("tenantId").equals(tenantId).toArray(),
    db.branches.where("tenantId").equals(tenantId).toArray(),
    db.users.where("tenantId").equals(tenantId).toArray(),
  ]);
  const branchName = new Map(branches.map((b) => [b.id, b.name]));
  const userName = new Map(users.map((u) => [u.id, u.name]));
  const msByMember = groupBy(memberships, (m) => m.memberId);
  const taByMember = groupBy(assignments, (a) => a.memberId);

  const q = params.search?.trim().toLowerCase() ?? "";
  const rows: MemberListItem[] = [];
  for (const m of members) {
    if (m.archivedAt) continue;
    const trainerId = assignmentOn(taByMember.get(m.id) ?? [], today)?.trainerId;
    const resource: Resource = { tenantId, branchId: m.homeBranchId, memberId: m.id, assignedTrainerId: trainerId };
    if (!can(principal, "member.read", resource)) continue;
    if (params.branchId && m.homeBranchId !== params.branchId) continue;
    if (q && !m.name.toLowerCase().includes(q) && !m.phone.includes(q.replace(/\s/g, ""))) continue;
    const ms = currentMembership(msByMember.get(m.id) ?? []);
    const status = ms?.status ?? "none";
    if (params.status && status !== params.status) continue;
    rows.push({
      id: m.id, name: m.name, phone: m.phone, homeBranchId: m.homeBranchId, branchName: branchName.get(m.homeBranchId) ?? "", membershipStatus: status,
      planName: ms?.terms.name, endsOn: ms?.endsOn, trainerId, trainerName: trainerId ? userName.get(trainerId) : undefined,
    });
  }
  rows.sort((a, b) => a.name.localeCompare(b.name));

  const pageSize = Math.min(Math.max(params.pageSize ?? 50, 1), 200);
  const page = Math.max(params.page ?? 1, 1);
  return { rows: rows.slice((page - 1) * pageSize, page * pageSize), total: rows.length, page, pageSize };
}

/** One member. Records from another gym look like they do not exist. */
export async function getMember(session: Session | null, memberId: string): Promise<Member> {
  const { principal } = await open(session);
  const member = await db.members.get(memberId);
  if (!member || member.tenantId !== principal.tenantId) throw new ApiError("not_found", "We couldn’t find this member. They may have been removed.");
  const assignments = await db.trainerAssignments.where("memberId").equals(memberId).toArray();
  assertCan(principal, "member.read", {
    tenantId: member.tenantId, branchId: member.homeBranchId, memberId, assignedTrainerId: assignmentOn(assignments, todayIST())?.trainerId,
  });
  return member;
}

function groupBy<T>(items: T[], key: (item: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const k = key(item);
    const list = map.get(k);
    if (list) list.push(item);
    else map.set(k, [item]);
  }
  return map;
}
