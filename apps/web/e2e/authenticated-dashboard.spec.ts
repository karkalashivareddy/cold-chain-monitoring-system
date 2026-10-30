import { expect, test } from "@playwright/test";

test("seeded organization owner can load the live dashboard", async ({ page }, testInfo) => {
  const pageErrors: string[] = [];
  const apiErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("response", async (response) => {
    if (response.url().includes("/api/v1/") && response.status() >= 400) {
      const body = await response.text().catch(() => "");
      apiErrors.push(`${response.request().method()} ${new URL(response.url()).pathname}: ${response.status()} ${body}`);
    }
  });

  await page.goto("/login");
  await page.getByRole("button", { name: "Use demo" }).click();
  await page.getByRole("button", { name: /enter console/i }).click();

  await expect(page).toHaveURL(/\/app$/, { timeout: 15_000 }).catch((error: unknown) => {
    throw new Error(`${String(error)}\nAPI errors: ${apiErrors.join("; ")}`);
  });
  await expect(page.getByRole("heading", { name: "Cold-chain overview" })).toBeVisible();
  await expect(page.getByText(/Operational picture for Northline Biologics/)).toBeVisible();
  await expect(page.getByRole("region", { name: "Key performance indicators" }).getByText("Active shipments")).toBeVisible();

  await page.setViewportSize({ width: 1366, height: 768 });
  await page.screenshot({ path: testInfo.outputPath("dashboard-desktop.png"), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole("heading", { name: "Cold-chain overview" })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("dashboard-mobile.png"), fullPage: true });

  expect(pageErrors).toEqual([]);
});
