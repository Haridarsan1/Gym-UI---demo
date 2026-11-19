import { test } from "@playwright/test";
import { a03Journey } from "./a03";
import { signInAs } from "./helpers";

/** A03: two desk screens, one slot, one instant (390 px). The same runs at 768 and 1440 px in desktop-flows.spec.ts. */
test("A03: two desks book the same trainer slot at the same moment", async ({ context, page }) => {
  test.setTimeout(90_000);
  await signInAs(page, "u_desk_andheri", "/desk");
  const second = await context.newPage();
  await a03Journey(page, second);
});
