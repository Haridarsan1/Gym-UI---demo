import { expect, test, type Page } from "@playwright/test";
import { hasHorizontalScroll, readStore, signInAs } from "./helpers";

const addRow = (page: Page, store: string, row: Record<string, unknown>) =>
  page.evaluate(([name, value]) => new Promise<void>((resolve, reject) => {
    const open = indexedDB.open("ember-demo");
    open.onsuccess = () => {
      const tx = open.result.transaction(name as string, "readwrite");
      tx.objectStore(name as string).put(value);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    };
  }), [store, row] as const);

test.describe("Check-in pass (M05)", () => {
  test("shows the QR code, who it is for, that it is ready, a brightness hint and the last visits", async ({ page }) => {
    await signInAs(page, "u_member_arjun", "/m/pass");
    await expect(page.getByRole("heading", { name: "Check-in pass", level: 1 })).toBeVisible();
    const qr = page.getByRole("img", { name: "Your check-in QR code, Arjun Kumar" });
    await expect(qr).toBeVisible();
    expect(await qr.locator("path").getAttribute("d")).toMatch(/^M\d/);
    const box = (await qr.boundingBox())!;
    expect(box.width).toBeGreaterThanOrEqual(200);
    expect(Math.abs(box.width - box.height)).toBeLessThan(2);
    await expect(page.locator("#main").getByText("Arjun Kumar", { exact: true })).toBeVisible();
    await expect(page.getByText("Pulse Fitness, Andheri")).toBeVisible();
    await expect(page.getByText("Ready to scan")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Turn your brightness up" })).toBeVisible();
    await expect(page.getByText("A browser can’t do that for you.")).toBeVisible();
    const list = page.getByRole("list", { name: "Recent check-ins" });
    await expect(list.getByRole("listitem")).toHaveCount(8);
    await expect(list.getByRole("listitem").first()).toContainText("Andheri");
    await expect(list.getByRole("listitem").first()).toContainText("Checked in");
    expect(await hasHorizontalScroll(page)).toBe(false);
  });

  test("keeps the screen awake while it is open, and lets go when switched off", async ({ page }) => {
    await page.addInitScript(() => {
      const w = window as unknown as { __wake: { requests: number; released: number } };
      w.__wake = { requests: 0, released: 0 };
      Object.defineProperty(navigator, "wakeLock", { configurable: true, value: { request: async () => { w.__wake.requests++; return { release: async () => { w.__wake.released++; } }; } } });
    });
    await signInAs(page, "u_member_arjun", "/m/pass");
    await expect(page.getByText("Ready to scan")).toBeVisible();
    // Locks held now: asked for minus let go. (In development React runs effects twice, so one is asked for and let go at once.)
    const held = () => page.evaluate(() => { const w = (window as unknown as { __wake: { requests: number; released: number } }).__wake; return w.requests - w.released; });
    await expect.poll(held).toBe(1);
    await page.getByRole("switch", { name: "Keep my screen on" }).click();
    await expect.poll(held).toBe(0);
  });

  test("works in a browser with no screen lock", async ({ page }) => {
    await page.addInitScript(() => Object.defineProperty(navigator, "wakeLock", { configurable: true, value: undefined }));
    await signInAs(page, "u_member_arjun", "/m/pass");
    await expect(page.getByText("Ready to scan")).toBeVisible();
  });

  test("flips to “Checked in” when the pass is scanned while it is open", async ({ page }) => {
    await signInAs(page, "u_member_arjun", "/m/pass");
    await expect(page.getByText("Ready to scan")).toBeVisible();
    // The door scans it from another place: the check-in is written, and the open pass notices on its next read.
    await addRow(page, "checkIns", { id: "ci_door_1", tenantId: "t_pulse", memberId: "mem_arjun", branchId: "br_andheri", membershipId: "m", at: new Date(Date.now() + 1000).toISOString(), method: "qr", result: "allowed", visitDebited: false, recordedBy: "u_desk_andheri" });
    await expect(page.getByRole("status").filter({ hasText: "Checked in at Andheri" })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole("img", { name: /QR code/ })).toHaveCount(0);
  });

  test("the demo scan checks in, and a second scan within 10 minutes uses no extra visit", async ({ page }) => {
    await signInAs(page, "u_member_sneha", "/m/pass");
    await expect(page.getByText("4 visits left on your pass")).toBeVisible();
    await page.getByRole("button", { name: "Scan my pass at the door" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Checked in at Andheri" })).toBeVisible();
    await expect(page.getByRole("status")).toContainText("3 visits left");
    await page.getByRole("button", { name: "Scan my pass at the door" }).click();
    await expect(page.getByRole("status").filter({ hasText: "You’re already checked in" })).toBeVisible();
    const m = (await readStore(page, "memberships")).find((x) => x.memberId === "mem_sneha" && x.status === "active")!;
    expect(m.visitsRemaining).toBe(3);
    const scans = (await readStore(page, "checkIns")).filter((c) => c.memberId === "mem_sneha" && String(c.id).length > 30);
    expect(scans.map((c) => c.result).sort()).toEqual(["allowed", "repeat_scan"]);
    await expect(page.getByRole("list", { name: "Recent check-ins" }).getByRole("listitem").first()).toContainText("Scanned again, no extra visit used");
  });

  test("a frozen member sees why the pass won’t open the door, and a way to the membership", async ({ page }) => {
    await signInAs(page, "u_member_rahul", "/m/pass");
    await expect(page.getByRole("alert")).toContainText("This pass won’t open the door right now");
    await expect(page.getByRole("alert")).toContainText("Your membership is frozen until 29 Nov 2026. Your pass works again then.");
    await page.getByRole("link", { name: "Open membership" }).click();
    await expect(page).toHaveURL(/\/m\/membership$/);
  });
});

test.describe("Me (S04, O04)", () => {
  test.beforeEach(async ({ page }) => {
    await signInAs(page, "u_member_arjun", "/m/me");
    await expect(page.getByRole("heading", { name: "Me", level: 1 })).toBeVisible();
  });

  test("shows the member’s details", async ({ page }) => {
    const profile = page.getByRole("region", { name: "Arjun Kumar" });
    await expect(profile).toContainText("9820022002");
    await expect(profile).toContainText("arjun.kumar@example.in");
    await expect(profile).toContainText("Andheri");
    await expect(profile).toContainText("Meera Joshi");
    expect(await hasHorizontalScroll(page)).toBe(false);
  });

  test("consent: each one says what it allows and what turning it off does, and a change is saved, recorded and shown", async ({ page }) => {
    const consent = page.getByRole("region", { name: "Consent" });
    const photos = consent.getByRole("switch", { name: "Progress photos" });
    await expect(consent).toContainText("The front desk and finance never can.");
    await expect(consent).toContainText("Turning this off hides your photos from you and your trainer.");
    await expect(consent.getByRole("switch", { name: "Assessments" })).toBeVisible();
    await expect(consent.getByRole("switch", { name: "Offers and news" })).toBeVisible();
    await expect(consent.getByRole("switch", { name: /Using your details/ })).toBeDisabled();
    await expect(consent).toContainText("Required.");
    if ((await photos.getAttribute("aria-checked")) === "false") await photos.click();
    await expect(photos).toHaveAttribute("aria-checked", "true");
    await photos.click();
    await expect(page.getByText("Progress photos: turned off")).toBeVisible();
    await expect(photos).toHaveAttribute("aria-checked", "false");
    await expect(consent).toContainText(/Withdrawn on 17 Nov 2026/);
    const audit = (await readStore(page, "auditEvents")).filter((a) => a.action === "consent.change");
    expect(audit.length).toBeGreaterThanOrEqual(1);
    // The setting holds after a reload, and Progress now explains it needs the consent and links back here.
    await page.reload();
    await expect(page.getByRole("switch", { name: "Progress photos" })).toHaveAttribute("aria-checked", "false");
    await page.goto("/m/progress");
    await page.getByRole("link", { name: "Turn on photo consent in Me" }).click();
    await expect(page).toHaveURL(/\/m\/me#consent$/);
    await expect(page.getByRole("heading", { name: "Consent", level: 2 })).toBeInViewport();
  });

  test("email preferences save one at a time and stay after a reload; receipts always come", async ({ page }) => {
    const prefs = page.getByRole("region", { name: "Emails we send you" });
    await expect(prefs).toContainText("We only contact you by email, at arjun.kumar@example.in.");
    await expect(prefs).toContainText("Receipts and payment confirmations always come to you");
    const nudge = prefs.getByRole("switch", { name: "A nudge after a quiet spell" });
    await expect(nudge).toHaveAttribute("aria-checked", "true");
    await nudge.click();
    await expect(page.getByText("A nudge after a quiet spell: off")).toBeVisible();
    await page.reload();
    await expect(page.getByRole("switch", { name: "A nudge after a quiet spell" })).toHaveAttribute("aria-checked", "false");
    await expect(page.getByRole("switch", { name: "Booking confirmations and reminders" })).toHaveAttribute("aria-checked", "true");
  });

  test("vibration can be turned off, and the app remembers it on this phone", async ({ page }) => {
    await page.getByRole("switch", { name: "Vibration" }).click();
    await expect(page.getByText("Vibration: off")).toBeVisible();
    expect(await page.evaluate(() => localStorage.getItem("ember.haptics"))).toBe("off");
  });

  test("asks for a copy of the data: explained first, recorded once, and asking again doesn’t make a second", async ({ page }) => {
    await page.getByRole("button", { name: "Ask for a copy" }).click();
    const d = page.getByRole("dialog", { name: "Ask for a copy of your data" });
    await expect(d).toContainText("The gym emails it to you");
    await d.getByRole("button", { name: "Request a copy" }).click();
    await expect(page.getByText("Request received")).toBeVisible();
    const list = page.getByRole("list", { name: "Your requests" });
    await expect(list.getByRole("listitem")).toHaveCount(1);
    await expect(list).toContainText("Copy of your data");
    await expect(list).toContainText("Requested");
    await expect(list).toContainText("Asked on 17 Nov 2026");
    await page.getByRole("button", { name: "Ask for a copy" }).click();
    await page.getByRole("dialog", { name: "Ask for a copy of your data" }).getByRole("button", { name: "Request a copy" }).click();
    await expect(page.getByText("You already have this request open")).toBeVisible();
    await expect(list.getByRole("listitem")).toHaveCount(1);
    expect((await readStore(page, "dataRequests")).filter((r) => r.memberId === "mem_arjun")).toHaveLength(1);
    expect((await readStore(page, "emailLog")).filter((e) => e.template === "data_request")).toHaveLength(1);
  });

  test("asks for deletion: says what is kept and what ends, and can be backed out of", async ({ page }) => {
    await page.getByRole("button", { name: "Ask for deletion" }).click();
    const d = page.getByRole("dialog", { name: "Ask for your data to be deleted" });
    await expect(d).toContainText("invoices and tax receipts, must be kept");
    await expect(d).toContainText("you can no longer use your membership");
    await d.getByRole("button", { name: "Not now" }).click();
    await expect(d).toBeHidden();
    expect((await readStore(page, "dataRequests")).filter((r) => r.memberId === "mem_arjun")).toHaveLength(0);
    await page.getByRole("button", { name: "Ask for deletion" }).click();
    await page.getByRole("dialog", { name: "Ask for your data to be deleted" }).getByRole("button", { name: "Request deletion" }).click();
    await expect(page.getByRole("list", { name: "Your requests" })).toContainText("Deletion of your data");
  });
});
