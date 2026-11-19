import { expect, test } from "@playwright/test";
import { readStore, signInAs } from "./helpers";

/** The camera QR scan at the front desk (M05), with a fake camera. It needs its own file because it starts the browser with the fake-camera flags. */
test.use({ launchOptions: { args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"] }, permissions: ["camera"] });

test("scanning a pass with the camera checks the member in, and the scanner only loads when it is opened", async ({ page }) => {
  await signInAs(page, "u_desk_andheri", "/desk");
  const token = (await readStore(page, "members")).find((m) => m.id === "mem_arjun")!.qrToken as string;
  const scripts: string[] = [];
  page.on("request", (r) => r.url().includes("/@fs/") || r.url().includes("zxing") ? scripts.push(r.url()) : undefined);
  await expect(page.getByRole("button", { name: "Scan QR" })).toBeVisible();
  expect(scripts.filter((s) => s.includes("Scanner"))).toHaveLength(0);
  // The browser’s own detector, replaced by one that reads the fake camera’s frames as this member’s pass.
  await page.addInitScript((t) => { (window as unknown as { BarcodeDetector: unknown }).BarcodeDetector = class { async detect() { return [{ rawValue: t }]; } }; }, token);
  await page.reload();
  await page.getByRole("button", { name: "Scan QR" }).click();
  await expect(page.getByRole("dialog", { name: "Scan a pass" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Check-in result" })).toHaveAttribute("data-result", "allowed", { timeout: 10_000 });
  await expect(page.getByRole("region", { name: "Check-in result" })).toContainText("Arjun Kumar");
  expect((await readStore(page, "checkIns")).filter((c) => c.memberId === "mem_arjun" && c.method === "qr" && String(c.at).startsWith("2026-11-17"))).toHaveLength(1);
});

test("without a camera a pass code can be typed", async ({ page }) => {
  await signInAs(page, "u_desk_andheri", "/desk");
  await page.evaluate(() => Object.defineProperty(navigator, "mediaDevices", { value: undefined, configurable: true }));
  await page.getByRole("button", { name: "Scan QR" }).click();
  const d = page.getByRole("dialog", { name: "Scan a pass" });
  await expect(d.getByText("There is no camera here. Type the pass code instead.")).toBeVisible();
  await d.getByLabel("Pass code").fill("arjun");
  await d.getByRole("button", { name: "Find member" }).click();
  await expect(page.getByRole("option", { name: /Arjun Kumar/ })).toBeVisible();
});
