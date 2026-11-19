import { test } from "@playwright/test";
import { a01Journey } from "./a01";
import { signInAs } from "./helpers";

/** A01 as one journey, at 390 px (the phone project). The same journey runs at 1440 px in desktop-flows.spec.ts. */
test("A01: register, pay, check in, assign a trainer, publish, log as the member, review the trend, renew, switching roles", async ({ page }) => {
  test.setTimeout(120_000);
  const problems: string[] = [];
  page.on("pageerror", (e) => problems.push(e.message));
  await signInAs(page, "u_desk_andheri", "/desk");
  await a01Journey(page);
  test.expect(problems).toEqual([]);
});
