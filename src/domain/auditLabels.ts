import { AuditAction } from "@/domain/types";

/** What each audit action means, in words an owner reads (S05). */
export const ACTION_LABEL: Record<string, string> = {
  "membership.create": "Membership started", "membership.freeze": "Membership frozen", "membership.unfreeze": "Membership unfrozen", "membership.renew": "Membership renewed", "membership.upgrade": "Membership upgraded",
  "membership.cancel": "Membership canceled", "membership.cancel.undo": "Cancellation taken back", "membership.autorenew": "Auto-renew changed", "membership.grace": "Grace period changed",
  "consent.change": "Consent changed", "data.request": "Data request", "refund.create": "Refund paid", "refund.request": "Refund requested", "refund.approve": "Refund approved", "refund.reject": "Refund rejected",
  "creditnote.issue": "Credit note issued", "payment.record": "Payment recorded", "dayclose.close": "Cash day closed", "dayclose.reopen": "Cash day reopened", "credits.adjust": "Training credits adjusted",
  "permission.change": "Access changed", "staff.change": "Staff account", "checkin.override": "Check-in override", "support.access.start": "Support access started", "support.access.end": "Support access ended",
  "assessment.view": "Assessment opened", "photo.view": "Progress photo opened", "record.edit": "Record edited", "workout.correct": "Workout corrected", "booking.attendance": "Session marked", "booking.move": "Booking moved",
  "schedule.change": "Schedule changed", "review.shared": "Review shared", "goal.confirm": "Goal confirmed", "policy.change": "Policy changed", "plan.change": "Plan or pricing changed", "branch.change": "Branch changed",
  "settings.change": "Gym settings changed", "communication.retry": "Email retried", "communication.send": "Emails sent to a group", "communication.template": "Email wording changed", "member.invite": "App invitation sent", "member.join": "Member set up their login", "export.create": "File downloaded", "import.run": "Members imported",
};

export const actionLabel = (a: string): string => ACTION_LABEL[a] ?? a;

/** The groups the log can be filtered by. */
export const AUDIT_GROUPS: Array<{ id: string; label: string; actions: string[] }> = [
  { id: "memberships", label: "Memberships", actions: ["membership.create", "membership.freeze", "membership.unfreeze", "membership.renew", "membership.upgrade", "membership.cancel", "membership.cancel.undo", "membership.autorenew", "membership.grace"] },
  { id: "money", label: "Money", actions: ["refund.create", "refund.request", "refund.approve", "refund.reject", "creditnote.issue", "payment.record", "dayclose.close", "dayclose.reopen", "credits.adjust"] },
  { id: "access", label: "People and access", actions: ["permission.change", "staff.change", "checkin.override", "support.access.start", "support.access.end"] },
  { id: "setup", label: "Plans, policies and settings", actions: ["policy.change", "plan.change", "branch.change", "settings.change"] },
  { id: "records", label: "Health and training records", actions: ["assessment.view", "photo.view", "record.edit", "workout.correct", "booking.attendance", "booking.move", "schedule.change", "review.shared", "goal.confirm", "consent.change", "data.request"] },
  { id: "messages", label: "Messages, imports and downloads", actions: ["communication.retry", "communication.send", "communication.template", "member.invite", "member.join", "export.create", "import.run"] },
];

/** Every action the system can write has a label and a group, so nothing in the log is a bare code. */
export const UNLABELED = AuditAction.options.filter((a) => !ACTION_LABEL[a] || !AUDIT_GROUPS.some((g) => g.actions.includes(a)));
