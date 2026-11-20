import { addDays, isIsoDate } from "@/domain/dates";
import { formatDate } from "@/lib/when";

/**
 * Importing members from a spreadsheet (S01), pure. A file is read into rows, each row is checked against the gym’s branches, plans and members, and every problem is said in words with its row and
 * column. A phone number or email that another member already has is not an error: the row is imported as a separate member who shares it, flagged, and can be left out. A row that is the same
 * person as an existing member (same name and same phone or email) is an error, so a file run twice never adds anyone twice.
 */
export const COLUMNS = ["name", "phone", "email", "date_of_birth", "gender", "branch", "plan", "start_date", "visits_left", "pt_credits", "lead_source"] as const;
export type Column = (typeof COLUMNS)[number];
export const REQUIRED: readonly Column[] = ["name", "phone", "branch"];
export const MAX_ROWS = 500;

export const COLUMN_HELP: Record<Column, string> = {
  name: "Full name. Required.", phone: "10-digit mobile number. Required.", email: "Optional.", date_of_birth: "Optional. 2026-11-17 or 17/11/2026.", gender: "Optional: female, male, other or undisclosed.",
  branch: "The branch’s name, for example Bandra. Required.", plan: "Optional. The name of a plan on sale at that branch. Without one, only the member is added.", start_date: "Optional, when the plan started. Today if empty.",
  visits_left: "Optional, for a visit pass: the visits they have left.", pt_credits: "Optional: personal training sessions they still have.", lead_source: "Optional: where they heard of the gym.",
};

export const TEMPLATE_CSV = `${COLUMNS.join(",")}\r\nAsha Menon,98200 11122,asha@example.in,1992-04-09,female,Bandra,Monthly,2026-11-01,,,Walk-in\r\nVikram Shah,9820033344,,,male,Andheri,10-visit pass,2026-11-10,6,,Instagram\r\n`;

/** Reads CSV text into rows of cells: quotes, commas and line breaks inside quotes, a byte-order mark, and blank lines. */
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^﻿/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i]!;
    if (quoted) {
      if (ch === '"') { if (src[i + 1] === '"') { cell += '"'; i++; } else quoted = false; } else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") { if (ch === "\r" && src[i + 1] === "\n") i++; row.push(cell); rows.push(row); row = []; cell = ""; }
    else cell += ch;
  }
  if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

export interface ImportContext {
  today: string;
  branches: Array<{ id: string; name: string }>;
  plans: Array<{ id: string; name: string; kind: "trial" | "time" | "visit"; branchIds: string[]; visits?: number; active: boolean; effectiveFrom: string; effectiveTo?: string; pricePaise: number }>;
  members: Array<{ id: string; name: string; phone: string; email?: string }>;
  /** How many more active members the gym’s subscription allows, or null for no limit. */
  capacityLeft: number | null;
}

export interface ParsedRow {
  /** The line in the spreadsheet, counting the header as line 1. */
  line: number;
  name: string;
  phone: string;
  email?: string;
  dateOfBirth?: string;
  gender?: "female" | "male" | "other" | "undisclosed";
  branchId?: string;
  branchName: string;
  planId?: string;
  planName?: string;
  startsOn?: string;
  visitsLeft?: number;
  ptCredits?: number;
  leadSource?: string;
}
export interface Sharing { name: string; source: "existing" | "file"; line?: number; id?: string }
export interface PreviewRow extends ParsedRow {
  status: "ok" | "shared" | "error";
  /** Problems in words, each starting with the column. Empty unless status is error. */
  errors: string[];
  sharedWith: Sharing[];
  /** Said beside the row when it is fine: what will be made. */
  summary: string;
}
export interface Preview { fileErrors: string[]; rows: PreviewRow[]; counts: { ok: number; shared: number; error: number }; ignoredColumns: string[] }

const digits = (s: string) => s.replace(/\D/g, "").replace(/^(91|0)(?=\d{10}$)/, "");
const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

function dateOf(text: string): string | undefined {
  const t = text.trim();
  if (isIsoDate(t)) return t;
  const m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(t);
  if (!m) return undefined;
  const d = `${m[3]}-${m[2]!.padStart(2, "0")}-${m[1]!.padStart(2, "0")}`;
  return isIsoDate(d) ? d : undefined;
}

export function previewImport(text: string, ctx: ImportContext): Preview {
  const table = parseCsv(text);
  const empty: Preview = { fileErrors: [], rows: [], counts: { ok: 0, shared: 0, error: 0 }, ignoredColumns: [] };
  if (table.length === 0) return { ...empty, fileErrors: ["The file is empty. Use the template to see the columns."] };
  const header = table[0]!.map((h) => norm(h).replace(/[\s-]+/g, "_"));
  const missing = REQUIRED.filter((c) => !header.includes(c));
  const ignoredColumns = header.filter((h) => h && !(COLUMNS as readonly string[]).includes(h));
  if (missing.length) return { ...empty, ignoredColumns, fileErrors: [`The first line has to name the columns. Missing: ${missing.join(", ")}. Use the template to see them all.`] };
  const body = table.slice(1);
  if (body.length === 0) return { ...empty, ignoredColumns, fileErrors: ["The file has the column names but no members. Add one member on each line."] };
  if (body.length > MAX_ROWS) return { ...empty, ignoredColumns, fileErrors: [`The file has ${body.length} members. Import up to ${MAX_ROWS} at a time: split it and import the parts one after the other.`] };
  const at = (r: string[], c: Column) => (r[header.indexOf(c)] ?? "").trim();

  const branchBy = new Map(ctx.branches.map((b) => [norm(b.name), b]));
  const rows: PreviewRow[] = [];
  const seen: Array<{ line: number; name: string; phone: string; email?: string }> = [];
  let capacity = ctx.capacityLeft;

  body.forEach((r, i) => {
    const line = i + 2;
    const errors: string[] = [];
    const name = at(r, "name").replace(/\s+/g, " ");
    const phone = digits(at(r, "phone"));
    const email = at(r, "email").toLowerCase();
    if (name.length < 2) errors.push("name: Enter the member’s name.");
    else if (name.length > 80) errors.push("name: Use 80 characters or fewer.");
    if (!/^[6-9]\d{9}$/.test(phone)) errors.push("phone: Enter a 10-digit mobile number.");
    if (email && !/^\S+@\S+\.\S+$/.test(email)) errors.push("email: Enter an email like name@example.in, or leave it empty.");
    let dateOfBirth: string | undefined;
    if (at(r, "date_of_birth")) {
      dateOfBirth = dateOf(at(r, "date_of_birth"));
      if (!dateOfBirth) errors.push("date_of_birth: Use the date as 17/11/2026 or 2026-11-17.");
      else if (dateOfBirth >= ctx.today || dateOfBirth < "1920-01-01") { errors.push("date_of_birth: Enter a date of birth in the past, after 1920."); dateOfBirth = undefined; }
    }
    let gender: PreviewRow["gender"];
    if (at(r, "gender")) {
      const g = norm(at(r, "gender"));
      if (g === "female" || g === "male" || g === "other" || g === "undisclosed") gender = g;
      else errors.push("gender: Use female, male, other or undisclosed.");
    }
    const branchName = at(r, "branch");
    const branch = branchBy.get(norm(branchName));
    if (!branchName) errors.push("branch: Enter the branch’s name.");
    else if (!branch) errors.push(`branch: “${branchName}” isn’t one of your branches (${ctx.branches.map((b) => b.name).join(", ")}).`);

    let planId: string | undefined;
    let planName: string | undefined;
    let startsOn: string | undefined;
    let visitsLeft: number | undefined;
    const planText = at(r, "plan");
    const plan = planText ? ctx.plans.find((p) => norm(p.name) === norm(planText)) : undefined;
    if (planText) {
      if (!plan) errors.push(`plan: “${planText}” isn’t one of your plans.`);
      else if (branch && !plan.branchIds.includes(branch.id)) errors.push(`plan: ${plan.name} isn’t sold at ${branch.name}.`);
      else if (!plan.active || plan.effectiveFrom > ctx.today || (plan.effectiveTo !== undefined && plan.effectiveTo < ctx.today)) errors.push(`plan: ${plan.name} isn’t on sale now, so it can’t be given to a member.`);
      else if (plan.kind === "trial") errors.push("plan: A free trial can’t be imported. Leave the plan empty.");
      else { planId = plan.id; planName = plan.name; }
    }
    if (at(r, "start_date")) {
      startsOn = dateOf(at(r, "start_date"));
      if (!startsOn) errors.push("start_date: Use the date as 17/11/2026 or 2026-11-17.");
      else if (!planText) errors.push("start_date: A start date needs a plan.");
      else if (startsOn > addDays(ctx.today, 60)) errors.push("start_date: A membership can start up to 60 days ahead.");
      else if (startsOn < "2015-01-01") errors.push("start_date: That date is too long ago to be right.");
    }
    if (at(r, "visits_left")) {
      const n = /^\d+$/.test(at(r, "visits_left")) ? Number(at(r, "visits_left")) : Number.NaN;
      if (!Number.isInteger(n)) errors.push("visits_left: Enter a whole number of visits.");
      else if (!plan || plan.kind !== "visit") errors.push("visits_left: Only a visit pass has visits left.");
      else if (n > (plan.visits ?? 0)) errors.push(`visits_left: ${plan.name} has ${plan.visits} visits, so ${n} can’t be left.`);
      else visitsLeft = n;
    }
    let ptCredits: number | undefined;
    if (at(r, "pt_credits")) {
      const n = /^\d+$/.test(at(r, "pt_credits")) ? Number(at(r, "pt_credits")) : Number.NaN;
      if (!Number.isInteger(n) || n > 200) errors.push("pt_credits: Enter a whole number of sessions, 0 to 200.");
      else if (n > 0) ptCredits = n;
    }

    // Who this row is, against the members already in the gym and the rows above it.
    const sharedWith: Sharing[] = [];
    if (errors.length === 0 || (!errors.some((e) => e.startsWith("name") || e.startsWith("phone") || e.startsWith("email")))) {
      for (const m of ctx.members) {
        const samePhone = !!phone && m.phone === phone;
        const sameEmail = !!email && !!m.email && m.email.toLowerCase() === email;
        if (!samePhone && !sameEmail) continue;
        if (norm(m.name) === norm(name)) { errors.push(`name: ${m.name} is already a member with this ${samePhone ? "phone number" : "email"}. Nobody is added twice.`); break; }
        sharedWith.push({ name: m.name, source: "existing", id: m.id });
      }
      for (const s of seen) {
        const samePhone = !!phone && s.phone === phone;
        const sameEmail = !!email && !!s.email && s.email === email;
        if (!samePhone && !sameEmail) continue;
        if (norm(s.name) === norm(name)) { errors.push(`name: Same person as line ${s.line} of this file.`); break; }
        sharedWith.push({ name: s.name, source: "file", line: s.line });
      }
    }
    const row: PreviewRow = { line, name, phone, email: email || undefined, dateOfBirth, gender, branchId: branch?.id, branchName, planId, planName, startsOn, visitsLeft, ptCredits, leadSource: at(r, "lead_source") || undefined, status: "ok", errors, sharedWith, summary: "" };
    if (errors.length === 0) {
      if (capacity !== null) {
        if (capacity <= 0) row.errors.push("name: Your Ember plan’s limit on active members is reached, so this member can’t be added. See Subscription.");
        else capacity -= planId ? 1 : 0;
      }
    }
    if (row.errors.length > 0) row.status = "error";
    else {
      row.status = sharedWith.length ? "shared" : "ok";
      row.summary = [planName ? `${planName} from ${formatDate(startsOn ?? ctx.today)}` : "Member only", visitsLeft !== undefined ? `${visitsLeft} visits left` : "", ptCredits ? `${ptCredits} training sessions` : ""].filter(Boolean).join(", ");
    }
    if (errors.length === 0 || !errors.some((e) => e.startsWith("name") || e.startsWith("phone"))) seen.push({ line, name, phone, email: email || undefined });
    rows.push(row);
  });
  const counts = { ok: rows.filter((r) => r.status === "ok").length, shared: rows.filter((r) => r.status === "shared").length, error: rows.filter((r) => r.status === "error").length };
  return { fileErrors: [], rows, counts, ignoredColumns };
}
