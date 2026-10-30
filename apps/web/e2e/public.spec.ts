import { expect, test } from "@playwright/test";

test("public landing page loads across viewports without browser runtime errors", async ({ page }, testInfo) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Every degree.");
  await expect(page.getByRole("banner").getByRole("button", { name: /enter console/i })).toBeVisible();
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.screenshot({ path: testInfo.outputPath("landing-desktop.png"), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("landing-mobile.png"), fullPage: true });
  expect(pageErrors).toEqual([]);
});
