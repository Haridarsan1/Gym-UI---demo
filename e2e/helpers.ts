import { expect, type Page } from "@playwright/test";
import { DEMO_ACCOUNTS } from "../src/app/demoAccounts";

/** Signs in as one of the demo people by writing the session the login page would write, then opens `path`. */
export async function signInAs(page: Page, userId: string, path = "/app") {
  const a = DEMO_ACCOUNTS.find((x) => x.userId === userId);
  if (!a) throw new Error(`No demo account ${userId}`);
  await page.goto("/login");
  await page.evaluate(
    (s) => {
      localStorage.setItem("ember.session", JSON.stringify(s));
      // No simulated delay or failures in tests.
      localStorage.setItem("ember.demo.simulation", JSON.stringify({ minMs: 0, maxMs: 0, failureRate: 0 }));
    },
    { userId: a.userId, name: a.name, role: a.role, tenantId: a.tenantId, branchIds: a.branchIds, memberId: a.memberId, limits: a.limits },
  );
  await page.goto(path);
  // Wait for the app to mount (past the lazy load and the demo setup) so key presses and taps land.
  await page.getByRole("heading", { level: 1 }).first().waitFor();
}

export const hasHorizontalScroll = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);

/** Logs every open set of the exercise on screen as prescribed (or as pre-filled). */
export async function logRemainingSets(page: Page) {
  const log = page.getByRole("button", { name: "Log set" });
  while (await log.count()) {
    const list = page.getByRole("list", { name: /^Sets,/ });
    const before = await list.getAttribute("aria-label");
    await log.click();
    await expect(list).not.toHaveAttribute("aria-label", before!);
  }
}

/**
 * Starts Arjun’s workout and goes through it. `exercises` limits how many exercises are logged (the rest are left, so the
 * workout is partly done). `heavyBench` lifts 200 kg on the first set of the bench press, which is a personal record.
 * Leaves the Finish sheet open.
 */
export async function doWorkout(page: Page, opts: { exercises?: number; heavyBench?: boolean; prepare?: (page: Page) => Promise<void> } = {}) {
  await signInAs(page, "u_member_arjun", "/m");
  await opts.prepare?.(page);
  if (opts.prepare) await page.reload();
  await page.getByRole("link", { name: "Start workout" }).click();
  await expect(page.getByRole("heading", { name: "Arm circles", level: 2 })).toBeVisible();
  const count = opts.exercises ?? 7;
  for (let i = 0; i < count; i++) {
    const name = await page.getByRole("heading", { level: 2 }).first().textContent();
    if (opts.heavyBench && name === "Dumbbell bench press") await page.getByRole("form", { name: "Set 1" }).getByRole("textbox", { name: "Load (kg)" }).fill("200");
    await logRemainingSets(page);
    if (i < count - 1) await page.getByRole("button", { name: "Next exercise" }).click();
  }
  await page.getByRole("button", { name: "Finish", exact: true }).click();
}

/** Every row of one table in the demo database (IndexedDB), for checking what was really written. */
export const readStore = (page: Page, store: string) =>
  page.evaluate(
    (name) => new Promise<Array<Record<string, unknown>>>((resolve, reject) => {
      const open = indexedDB.open("ember-demo");
      open.onsuccess = () => {
        const all = open.result.transaction(name).objectStore(name).getAll();
        all.onsuccess = () => resolve(all.result);
        all.onerror = () => reject(all.error);
      };
    }),
    store,
  );

/** Changes rows in one table: `change` is the source of a function that gets a row and returns the new row, `null` to delete, or `false` to leave it. */
export const changeStore = (page: Page, store: string, change: string) =>
  page.evaluate(
    ([name, src]) => new Promise<void>((resolve, reject) => {
      const open = indexedDB.open("ember-demo");
      open.onsuccess = () => {
        const tx = open.result.transaction(name!, "readwrite");
        tx.objectStore(name!).openCursor().onsuccess = (e) => {
          const c = (e.target as IDBRequest<IDBCursorWithValue | null>).result;
          if (!c) return;
          const out = new Function("v", `return (${src})(v)`)(c.value);
          if (out === null) c.delete();
          else if (out) c.update(out);
          c.continue();
        };
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      };
    }),
    [store, change],
  );
