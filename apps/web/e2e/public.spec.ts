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
  const menuButton = page.getByRole("button", { name: "Open navigation menu" });
  await menuButton.click();
  const mobileNav = page.getByRole("navigation", { name: "Mobile primary" });
  await expect(mobileNav).toBeVisible();
  await expect(page.getByRole("button", { name: "Close navigation menu" })).toHaveAttribute("aria-expanded", "true");
  await mobileNav.getByRole("link", { name: "Traceability" }).click();
  await expect(page).toHaveURL(/#traceability$/);
  await expect(mobileNav).toBeHidden();
  expect(pageErrors).toEqual([]);
});
