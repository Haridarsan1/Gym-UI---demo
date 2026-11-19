import { expect, type Page } from "@playwright/test";
import { readStore } from "./helpers";

/**
 * A03, strict: two desk screens (two tabs of one browser, which share the demo database, so this is a real race on the stored data) book the same trainer slot for two different
 * members at the same moment. Exactly one booking is confirmed; the other desk is told the time was taken; the credit balances are exact afterwards.
 */

type Row = Record<string, unknown>;

async function register(page: Page, name: string, phone: string): Promise<string> {
  const r = await page.evaluate(async ([n, p]) => {
    const mod = "newMember";
    const m = await import(/* @vite-ignore */ `/src/api/${mod}.ts`);
    const res = await m.registerMember({ userId: "u_desk_andheri", name: "", role: "front_desk", tenantId: "t_pulse", branchIds: [] }, { key: `a03-${p}`, branchId: "br_andheri", member: { name: n, phone: p }, consents: { photos: false, assessments: false, marketing: false, dataProcessing: true }, planId: "pl_monthly_plus", payment: { method: "cash", amountPaise: 413_000 } });
    return res.memberId as string;
  }, [name, phone] as const);
  return r;
}

const entriesOf = (ledger: Row[], memberId: string) => ledger.filter((e) => e.memberId === memberId);
const count = (entries: Row[], kind: string) => entries.filter((e) => e.kind === kind).reduce((n, e) => n + Number(e.credits), 0);

async function openSheet(page: Page, member: string) {
  await page.goto("/desk/bookings?date=2026-11-18&lane=u_trainer_meera");
  await expect(page.getByRole("heading", { name: "Bookings", level: 1 })).toBeVisible();
  await page.getByRole("button", { name: /^Book Meera Joshi at 7:00 am$/ }).first().click();
  const sheet = page.getByRole("dialog", { name: "Book a session" });
  await sheet.getByLabel("Search members").fill(member);
  await sheet.getByRole("button", { name: new RegExp(member) }).click();
  await expect(sheet).toContainText(/\d+ sessions? left/);
  await expect(sheet.getByRole("radio", { name: "7:00 am" })).toHaveAttribute("aria-checked", "true");
  return sheet;
}

export async function a03Journey(first: Page, second: Page) {
  const a = await register(first, "Tara Bose", "9876500001");
  const b = await register(first, "Uday Rane", "9876500002");
  const before = (await readStore(first, "creditLedger")) as Row[];
  const startA = entriesOf(before, a);
  const startB = entriesOf(before, b);
  expect(count(startA, "purchase")).toBeGreaterThan(0);
  expect(count(startA, "reservation")).toBe(0);
  const bookingsBefore = (await readStore(first, "bookings")) as Row[];

  const sheetA = await openSheet(first, "Tara Bose");
  const sheetB = await openSheet(second, "Uday Rane");
  const left = (await sheetA.textContent())!.match(/(\d+) sessions? left/)![1];

  // Both press “Book session” in the same instant.
  await Promise.all([sheetA.getByRole("button", { name: "Book session" }).click(), sheetB.getByRole("button", { name: "Book session" }).click()]);
  await expect.poll(async () => (await first.getByText("Session booked").count()) + (await second.getByText("Session booked").count())).toBe(1);
  const loserPage = (await first.getByText("Session booked").count()) === 1 ? second : first;
  const loserSheet = loserPage === second ? sheetB : sheetA;
  await expect(loserSheet.getByRole("alert")).toContainText("That time was just taken.");
  // It offers the next free times instead of a dead end.
  await expect(loserSheet.getByRole("alert").getByRole("button").first()).toBeVisible();

  const bookings = ((await readStore(first, "bookings")) as Row[]).filter((x) => x.trainerId === "u_trainer_meera" && String(x.startsAt) === "2026-11-18T01:30:00.000Z" && x.status !== "canceled");
  expect(bookings).toHaveLength(1);
  expect(((await readStore(first, "bookings")) as Row[]).length).toBe(bookingsBefore.length + 1);
  const winner = bookings[0]!.memberId as string;
  const loser = winner === a ? b : a;
  const after = (await readStore(first, "creditLedger")) as Row[];
  // Exact balances: the winner holds one credit (one reservation, the rest available); the other member’s ledger is untouched, row for row.
  const wEntries = entriesOf(after, winner);
  const wStart = winner === a ? startA : startB;
  expect(wEntries).toHaveLength(wStart.length + 1);
  expect(count(wEntries, "reservation")).toBe(1);
  expect(count(wEntries, "purchase") - count(wEntries, "reservation") - count(wEntries, "consumption") + count(wEntries, "release")).toBe(Number(left) - 1);
  expect(entriesOf(after, loser)).toEqual(loser === a ? startA : startB);
  expect(after.filter((e) => e.kind === "reservation" && e.bookingId === bookings[0]!.id)).toHaveLength(1);
}
