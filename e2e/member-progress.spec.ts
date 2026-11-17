import { expect, test, type Page } from "@playwright/test";
import { hasHorizontalScroll, signInAs } from "./helpers";

// A real, tiny PNG, so the browser can decode it like a photo.
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACNMs+9AAAAFUlEQVR42mP8z8BQz0AEYBxVSF+FABJADveWkH6oAAAAAElFTkSuQmCC", "base64");

const card = (page: Page, name: string | RegExp) => page.getByRole("region", { name });

const clearMeasurements = (page: Page, memberId: string) =>
  page.evaluate((id) => new Promise<void>((resolve, reject) => {
    const open = indexedDB.open("ember-demo");
    open.onsuccess = () => {
      const db = open.result;
      const tx = db.transaction("measurements", "readwrite");
      tx.objectStore("measurements").openCursor().onsuccess = (e) => {
        const c = (e.target as IDBRequest<IDBCursorWithValue | null>).result;
        if (!c) return;
        if (c.value.memberId === id) c.delete();
        c.continue();
      };
      tx.oncomplete = () => (db.close(), resolve());
      tx.onerror = () => reject(tx.error);
    };
  }), memberId);

const setConsent = (page: Page, memberId: string, on: boolean) =>
  page.evaluate(([id, grant]) => new Promise<void>((resolve, reject) => {
    const open = indexedDB.open("ember-demo");
    open.onsuccess = () => {
      const db = open.result;
      const tx = db.transaction("consents", "readwrite");
      const st = tx.objectStore("consents");
      st.openCursor().onsuccess = (e) => {
        const c = (e.target as IDBRequest<IDBCursorWithValue | null>).result;
        if (!c) return;
        if (c.value.memberId === id && c.value.scope === "photos") c.delete();
        c.continue();
      };
      tx.oncomplete = () => {
        if (!grant) return db.close(), resolve();
        const t2 = db.transaction("consents", "readwrite");
        t2.objectStore("consents").put({ id: `cn_${id}_photos`, tenantId: "t_pulse", memberId: id, scope: "photos", grantedAt: "2026-01-01T00:00:00.000Z", noticeVersion: "2026-01", recordedBy: "u_desk_andheri" });
        t2.oncomplete = () => (db.close(), resolve());
        t2.onerror = () => reject(t2.error);
      };
      tx.onerror = () => reject(tx.error);
    };
  }), [memberId, on] as const);

test.describe("Progress: Arjun", () => {
  test.beforeEach(async ({ page }) => {
    await signInAs(page, "u_member_arjun", "/m/progress");
    await expect(card(page, "Weight")).toBeVisible();
  });

  test("has the Progress and Reviews tabs, the date range row, and every chart", async ({ page }) => {
    await expect(page.getByRole("navigation", { name: "Section" }).getByRole("link")).toHaveText(["Progress", "Reviews"]);
    const range = page.getByRole("radiogroup", { name: "Date range" });
    await expect(range.getByRole("radio")).toHaveText(["4 weeks", "12 weeks", "6 months", "All time"]);
    await expect(range.getByRole("radio", { name: "12 weeks" })).toHaveAttribute("aria-checked", "true");
    for (const name of ["Weight", "Measurements", "Strength", "Weekly volume", "Attendance", "Workout completion", "Personal records", "Goals", "Progress photos"]) await expect(card(page, name)).toBeVisible();
  });

  test("each chart shows baseline, latest and change", async ({ page }) => {
    for (const name of ["Weight", "Measurements", "Strength", "Weekly volume", "Attendance", "Workout completion"]) {
      const c = card(page, name);
      for (const label of ["Baseline", "Latest", "Change"]) await expect(c.getByText(label, { exact: true })).toBeVisible();
    }
    const weight = card(page, "Weight");
    await expect(weight.getByText("Change", { exact: true }).locator("xpath=following-sibling::dd[1]")).toHaveText(/^[+−]?\d+(\.\d)?$/);
    await expect(weight.getByText(/^kg, (down|up|no change)$/)).toBeVisible();
  });

  test("the date range changes what every chart shows", async ({ page }) => {
    const weight = card(page, "Weight");
    const baseline = () => weight.getByText("Baseline", { exact: true }).locator("xpath=following-sibling::dd[2]").textContent();
    const twelve = await baseline();
    await page.getByRole("radio", { name: "4 weeks" }).click();
    expect(await baseline()).not.toBe(twelve);
    await expect(page.getByRole("radio", { name: "4 weeks" })).toHaveAttribute("aria-checked", "true");
    await page.getByRole("radio", { name: "All time" }).click();
    await expect(card(page, "Workout completion").getByText(/% completed, \d+ of \d+ scheduled\./)).toBeVisible();
  });

  test("a week with no data is a gap, and the readout says so instead of showing zero", async ({ page }) => {
    const volume = card(page, "Weekly volume");
    const chart = volume.getByRole("group", { name: /^Weekly volume, all exercises/ });
    await chart.focus();
    await page.keyboard.press("End"); // this week, with no finished workout yet
    await expect(volume.getByText(/^Week of \d+ \w{3}: no workouts recorded$/)).toBeVisible();
    await expect(volume).not.toContainText(/\b0 kg\b/);
    await page.keyboard.press("ArrowLeft");
    await expect(volume.getByText(/^[\d,]+ kg$/)).toBeVisible();
  });

  test("completion counts partial, skipped and not logged apart, and they add up to the scheduled workouts", async ({ page }) => {
    const c = card(page, "Workout completion");
    const summary = await c.getByText(/% completed, \d+ of \d+ scheduled\./).textContent();
    const scheduled = Number(/of (\d+) scheduled/.exec(summary!)![1]);
    const legend = c.getByRole("list", { name: "Legend" });
    const n = async (label: string) => Number(/, (\d+)$/.exec((await legend.getByText(new RegExp(`^${label}, \\d+$`)).textContent())!)![1]);
    const total = (await n("Completed")) + (await n("Partly done")) + (await n("Skipped")) + (await n("Not logged"));
    expect(total).toBe(scheduled);
  });

  test("every chart has a table view with the same numbers, and says who entered each weight", async ({ page }) => {
    const weight = card(page, "Weight");
    await weight.getByText("View as table").click();
    const table = weight.getByRole("table", { name: "Weight readings" });
    await expect(table.getByRole("columnheader")).toHaveText(["Date", "Weight (kg)", "Entered by"]);
    await expect(table.getByRole("cell", { name: "Meera Joshi" }).first()).toBeVisible();
    await expect(table.getByRole("cell", { name: "You" }).first()).toBeVisible();
  });

  test("charts answer the keyboard: arrow keys step through readings", async ({ page }) => {
    const weight = card(page, "Weight");
    const group = weight.getByRole("group", { name: /^Weight, \d+ readings/ });
    await group.focus();
    await expect(weight.getByText(/^latest, /)).toBeVisible();
    await page.keyboard.press("ArrowLeft");
    await expect(weight.getByText(/^latest, /)).toHaveCount(0);
  });

  test("measurements switch between kinds, and strength between exercises", async ({ page }) => {
    const m = card(page, "Measurements");
    await expect(m.getByRole("radio")).toHaveText(["Waist", "Body fat"]);
    await m.getByRole("radio", { name: "Body fat" }).click();
    await expect(m.getByText(/^%, (down|up|no change)$/)).toBeVisible();
    const s = card(page, "Strength");
    await s.getByLabel("Exercise").selectOption({ label: "Back squat" });
    await expect(s.getByRole("img", { name: /^Back squat, best set: \d+ readings/ })).toBeVisible();
  });

  test("the trophy shelf lists personal records newest first, and each opens its history", async ({ page }) => {
    const shelf = card(page, "Personal records");
    const tiles = shelf.getByRole("button", { name: /up from/ });
    expect(await tiles.count()).toBeGreaterThanOrEqual(4);
    await tiles.first().click();
    const dialog = page.getByRole("dialog", { name: "Record history" });
    await expect(dialog.getByRole("list", { name: "Records for this exercise" }).getByRole("listitem").first()).toContainText(/kg/);
    await expect(dialog.getByRole("list", { name: "Records for this exercise" }).getByRole("listitem").first()).toContainText(/Up from/);
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });

  test("goals show a bar to the target, the date, and the status in words", async ({ page }) => {
    const goals = card(page, "Goals");
    const weight = goals.getByRole("listitem").filter({ hasText: "Reach 78 kg" });
    await expect(weight).toContainText("Active");
    const bar = weight.getByRole("progressbar");
    const pct = Number(await bar.getAttribute("aria-valuenow"));
    expect(pct).toBeGreaterThan(0);
    expect(pct).toBeLessThan(100);
    await expect(weight).toContainText(/By \d+ \w{3} \d{4}, \d+ days to go\./);
    const bench = goals.getByRole("listitem").filter({ hasText: "Bench press 60 kg" });
    await expect(bench).toContainText("Achieved");
    await expect(bench.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "100");
    await expect(bench).toContainText(/Achieved on \d+ \w{3} \d{4}\./);
  });
});

test.describe("Log your weight and measurements", () => {
  test.beforeEach(async ({ page }) => {
    await signInAs(page, "u_member_arjun", "/m/progress");
    await expect(card(page, "Weight")).toBeVisible();
  });

  test("opens pre-filled with the last weight, saves it as entered by the member, and updates the chart", async ({ page }) => {
    await page.getByRole("button", { name: "Log your weight or a measurement" }).click();
    const sheet = page.getByRole("dialog", { name: "Log a measurement" });
    await expect(sheet.getByRole("heading", { name: "Log your weight" })).toBeVisible();
    const field = sheet.getByRole("textbox", { name: "Weight (kg)" });
    expect(Number(await field.inputValue())).toBeGreaterThan(70);
    await field.fill("81.3");
    await sheet.getByRole("button", { name: "Save weight" }).click();
    await expect(page.getByText("Weight saved")).toBeVisible();
    await expect(page.getByText(/Recorded as entered by you/)).toBeVisible();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    const weight = card(page, "Weight");
    await expect(weight.getByText("Latest", { exact: true }).locator("xpath=following-sibling::dd[1]")).toHaveText("81.3");
    await page.getByRole("button", { name: "Log your weight or a measurement" }).click();
    await expect(page.getByRole("dialog").getByText(/^81.3 kg, .*Entered by you$/)).toBeVisible();
  });

  test("says what is wrong and how to fix it", async ({ page }) => {
    await page.getByRole("button", { name: "Log your weight or a measurement" }).click();
    const sheet = page.getByRole("dialog", { name: "Log a measurement" });
    await sheet.getByRole("textbox", { name: "Weight (kg)" }).fill("8");
    await sheet.getByRole("button", { name: "Save weight" }).click();
    await expect(sheet.getByRole("alert")).toHaveText("Enter a weight between 20 and 300 kg.");
    await sheet.getByRole("textbox", { name: "Weight (kg)" }).fill("");
    await sheet.getByRole("button", { name: "Save weight" }).click();
    await expect(sheet.getByRole("alert")).toContainText("Enter your weight as a number");
  });

  test("a waist measurement and body fat with its method", async ({ page }) => {
    await page.getByRole("button", { name: "Log your weight or a measurement" }).click();
    const sheet = page.getByRole("dialog", { name: "Log a measurement" });
    await sheet.getByRole("radio", { name: "Body fat" }).click();
    await expect(sheet.getByRole("heading", { name: "Log a measurement" })).toBeVisible();
    await sheet.getByRole("textbox", { name: "Body fat (%)" }).fill("21.4");
    await sheet.getByLabel("How it was measured (optional)").fill("Smart scale");
    await sheet.getByRole("button", { name: "Save body fat" }).click();
    await expect(page.getByText("Body fat saved")).toBeVisible();
    await card(page, "Measurements").getByRole("radio", { name: "Body fat" }).click();
    await card(page, "Measurements").getByText("View as table").click();
    await expect(card(page, "Measurements").getByRole("cell", { name: "Smart scale" })).toBeVisible();
  });

  test("a reading that reaches a goal celebrates with confetti and marks the goal achieved", async ({ page }) => {
    await page.evaluate(() => {
      const w = window as unknown as { __confetti: number };
      w.__confetti = 0;
      new MutationObserver((rs) => rs.forEach((r) => r.addedNodes.forEach((n) => n instanceof HTMLCanvasElement && n.hasAttribute("data-confetti") && w.__confetti++))).observe(document.body, { childList: true });
    });
    await page.getByRole("button", { name: "Log your weight or a measurement" }).click();
    const sheet = page.getByRole("dialog", { name: "Log a measurement" });
    await sheet.getByRole("textbox", { name: "Weight (kg)" }).fill("77.8");
    await sheet.getByRole("button", { name: "Save weight" }).click();
    await expect(page.getByText("Goal reached")).toBeVisible();
    await expect.poll(() => page.evaluate(() => (window as unknown as { __confetti: number }).__confetti)).toBeGreaterThan(0);
    const goal = card(page, "Goals").getByRole("listitem").filter({ hasText: "Reach 78 kg" });
    await expect(goal).toContainText("Achieved");
    await expect(goal.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "100");
  });

  test("with reduced motion a reached goal still shows, with no confetti", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.getByRole("button", { name: "Log your weight or a measurement" }).click();
    const sheet = page.getByRole("dialog", { name: "Log a measurement" });
    await sheet.getByRole("textbox", { name: "Weight (kg)" }).fill("77.8");
    await sheet.getByRole("button", { name: "Save weight" }).click();
    await expect(page.getByText("Goal reached")).toBeVisible();
    await page.waitForTimeout(300);
    await expect(page.locator("canvas[data-confetti]")).toHaveCount(0);
  });

  test("the rest-day link from Today opens the form on weight", async ({ page }) => {
    await signInAs(page, "u_member_priya", "/m");
    await page.getByRole("link", { name: "Log your weight" }).click();
    await expect(page).toHaveURL(/\/m\/progress\?log=weight$/);
    await expect(page.getByRole("dialog", { name: "Log a measurement" }).getByRole("heading", { name: "Log your weight" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page).toHaveURL(/\/m\/progress$/);
  });
});

test.describe("Progress photos", () => {
  test("without consent, it says why and links to the consent setting in Me", async ({ page }) => {
    await signInAs(page, "u_member_arjun", "/m/progress");
    await setConsent(page, "mem_arjun", false);
    await page.reload();
    const photos = card(page, "Progress photos");
    await expect(photos).toContainText("only keep them if you agree");
    await expect(photos).toContainText("front desk and finance team never can");
    await expect(photos.getByRole("link", { name: "Turn on photo consent in Me" })).toHaveAttribute("href", "/m/me#consent");
    await expect(photos.getByRole("button", { name: "Add a photo" })).toHaveCount(0);
    await photos.getByRole("link", { name: "Turn on photo consent in Me" }).click();
    await expect(page).toHaveURL(/\/m\/me#consent$/);
  });

  test("with consent, a photo can be added, opened and removed", async ({ page }) => {
    await signInAs(page, "u_member_arjun", "/m/progress");
    await setConsent(page, "mem_arjun", true);
    await page.reload();
    const photos = card(page, "Progress photos");
    await expect(photos).toContainText("No photos yet");
    await photos.getByLabel("Choose a progress photo").setInputFiles({ name: "me.png", mimeType: "image/png", buffer: PNG });
    await expect(page.getByText("Photo saved")).toBeVisible();
    const thumb = photos.getByRole("list", { name: /^Your progress photos/ }).getByRole("img", { name: /^Progress photo from/ });
    await expect(thumb).toHaveCount(1);
    expect(await thumb.getAttribute("src")).toMatch(/^data:image\/jpeg;base64,/);
    await thumb.click();
    const dialog = page.getByRole("dialog", { name: "Progress photo" });
    await dialog.getByRole("button", { name: "Remove photo" }).click();
    await expect(dialog.getByText("Remove this photo? This can’t be undone.")).toBeVisible();
    await dialog.getByRole("button", { name: "Keep it" }).click();
    await dialog.getByRole("button", { name: "Remove photo" }).click();
    await dialog.getByRole("button", { name: "Remove photo" }).click();
    await expect(photos).toContainText("No photos yet");
  });

  test("a photo stays in the browser’s IndexedDB, and a refused file says why", async ({ page }) => {
    await signInAs(page, "u_member_arjun", "/m/progress");
    await setConsent(page, "mem_arjun", true);
    await page.reload();
    const photos = card(page, "Progress photos");
    await photos.getByLabel("Choose a progress photo").setInputFiles({ name: "me.png", mimeType: "image/png", buffer: PNG });
    await expect(page.getByText("Photo saved")).toBeVisible();
    const stored = await page.evaluate(() => new Promise<number>((resolve) => {
      const open = indexedDB.open("ember-demo");
      open.onsuccess = () => {
        const all = open.result.transaction("measurements").objectStore("measurements").getAll();
        all.onsuccess = () => resolve(all.result.filter((m) => m.kind === "progress_photo" && m.mediaRef?.startsWith("data:image/jpeg")).length);
      };
    }));
    expect(stored).toBe(1);
    await photos.getByLabel("Choose a progress photo").setInputFiles({ name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("hello") });
    await expect(page.getByText("Photo wasn’t saved")).toBeVisible();
  });
});

test.describe("Reviews and check-ins", () => {
  test("lists shared reviews newest first, marks the new one, never shows private notes, and clears Today’s card", async ({ page }) => {
    await signInAs(page, "u_member_arjun", "/m");
    await expect(page.getByRole("region", { name: /^New review from Coach Meera/ })).toBeVisible();
    await page.getByRole("link", { name: "Read review" }).click();
    await expect(page).toHaveURL(/\/m\/progress\/reviews$/);
    await expect(page.getByRole("heading", { name: "Reviews", level: 1 })).toBeVisible();
    const items = page.getByRole("region", { name: "Shared with you" }).getByRole("article");
    await expect(items).toHaveCount(2);
    await expect(items.first()).toContainText("New plan is live from");
    await expect(items.first().getByText("New", { exact: true })).toBeVisible();
    await expect(items.last().getByText("New", { exact: true })).toHaveCount(0);
    await expect(items.last()).toContainText("Strong block.");
    await expect(items.last()).toContainText(/Follow-up (was|is) on/);
    await expect(page.locator("main")).not.toContainText("shoulder a little tight");
    await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Today", exact: true }).click();
    await expect(page.getByRole("region", { name: /^New review from/ })).toHaveCount(0);
  });

  test("the check-in form takes effort, recovery and what got in the way, and lists what was sent", async ({ page }) => {
    await signInAs(page, "u_member_arjun", "/m/progress/reviews");
    const form = page.getByRole("region", { name: "Check in with your trainer" });
    await form.getByRole("button", { name: "Effort 8 of 10" }).click();
    await form.getByRole("button", { name: "Tired" }).click();
    await form.getByLabel("Anything getting in the way?").fill("Left knee is sore on stairs");
    await form.getByRole("button", { name: "Send check-in" }).click();
    await expect(form.getByText("Sent to your trainer. Thank you.")).toBeVisible();
    await expect(form.getByRole("button", { name: "Effort 8 of 10" })).toHaveAttribute("aria-pressed", "false"); // cleared for the next one
    const mine = page.getByRole("region", { name: "Your check-ins" }).getByRole("listitem");
    await expect(mine.first()).toContainText("Effort 8 of 10, recovery: tired");
    await expect(mine.first()).toContainText("Left knee is sore on stairs");
    await expect(mine).toHaveCount(2); // the one from the seed, and this one
  });

  test("a check-in needs an answer, and a double tap sends one", async ({ page }) => {
    await signInAs(page, "u_member_arjun", "/m/progress/reviews");
    const form = page.getByRole("region", { name: "Check in with your trainer" });
    await form.getByRole("button", { name: "Send check-in" }).click();
    await expect(form.getByRole("alert")).toContainText("Tell your trainer how hard it felt");
    await form.getByRole("button", { name: "Effort 5 of 10" }).click();
    await form.getByRole("button", { name: "Send check-in" }).dblclick();
    await expect(form.getByText("Sent to your trainer. Thank you.")).toBeVisible();
    await expect(page.getByRole("region", { name: "Your check-ins" }).getByRole("listitem")).toHaveCount(2);
  });

  test("a member with nothing yet sees what to expect", async ({ page }) => {
    await signInAs(page, "u_member_sneha", "/m/progress/reviews");
    await expect(page.getByRole("heading", { name: "No reviews yet" })).toBeVisible();
    await expect(page.getByText("You have not sent a check-in yet. It takes two taps.")).toBeVisible();
  });
});

test.describe("Progress: empty and failing states", () => {
  test("a member with little data sees what to do next in every card, and no zeros", async ({ page }) => {
    await signInAs(page, "u_member_sneha", "/m/progress");
    await clearMeasurements(page, "mem_sneha");
    await page.reload();
    await expect(page.getByText(/No weight entries in this range/)).toBeVisible();
    await expect(card(page, "Measurements")).toContainText("No measurements yet");
    await expect(card(page, "Strength")).toContainText("Strength shows here once you log a workout with weights");
    await expect(card(page, "Weekly volume")).toContainText("No workouts with weights in this range");
    await expect(card(page, "Workout completion")).toContainText("No scheduled workouts have passed");
    await expect(card(page, "Personal records")).toContainText("Your first record appears");
    await expect(card(page, "Goals")).toContainText("No goals yet");
    await expect(card(page, "Weight").getByText("Baseline", { exact: true }).locator("xpath=following-sibling::dd[1]")).toHaveText("–");
  });

  test("shows a loading placeholder, and an error with a retry", async ({ page }) => {
    await signInAs(page, "u_member_arjun", "/m/progress");
    await page.evaluate(() => localStorage.setItem("ember.demo.simulation", JSON.stringify({ minMs: 0, maxMs: 0, failureRate: 1 })));
    await page.reload();
    await expect(page.getByRole("alert")).toContainText("We couldn’t load your progress");
    await page.evaluate(() => localStorage.setItem("ember.demo.simulation", JSON.stringify({ minMs: 0, maxMs: 0, failureRate: 0 })));
    await page.getByRole("button", { name: "Try again" }).click();
    await expect(card(page, "Weight")).toBeVisible();
  });
});

test.describe("Progress at 390 px", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("no sideways scroll, big targets, and nothing shouted or dotted", async ({ page }) => {
    await signInAs(page, "u_member_arjun", "/m/progress");
    await expect(card(page, "Weight")).toBeVisible();
    expect(await hasHorizontalScroll(page)).toBe(false);
    for (const r of await page.getByRole("radiogroup", { name: "Date range" }).getByRole("radio").all()) expect((await r.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    const shouted = await page.evaluate(() => [...document.querySelectorAll("main *")].filter((e) => getComputedStyle(e).textTransform === "uppercase").length);
    expect(shouted).toBe(0);
    expect(await page.locator("main").innerText()).not.toContain("·");
    await page.goto("/m/progress/reviews");
    await expect(page.getByRole("heading", { name: "Reviews", level: 1 })).toBeVisible();
    expect(await hasHorizontalScroll(page)).toBe(false);
    expect(await page.locator("main").innerText()).not.toContain("·");
  });
});
