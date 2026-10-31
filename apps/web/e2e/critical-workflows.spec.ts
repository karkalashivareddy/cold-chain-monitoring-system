import { expect, test } from "@playwright/test";

test("fleet map distinguishes shipment endpoints from sourced vehicle positions", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.stack ?? error.message));
  await page.goto("/login");
  await page.getByRole("button", { name: "Use demo" }).click();
  await page.getByRole("button", { name: /enter console/i }).click();
  await expect(page).toHaveURL(/\/app$/);
  await page.route("https://tile.openstreetmap.org/**", (route) => route.abort());
  await page.goto("/app/map");
  await expect(page.getByRole("heading", { name: "Live fleet map" })).toBeVisible();
  await expect(page.getByText(/direct geographic connection/)).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: "Basemap tiles are unavailable" })).toBeVisible();
  await expect(page.getByText(/Location unavailable/).first()).toBeVisible();

  const search = page.getByRole("textbox", { name: "Search shipments on map" });
  await search.fill("SHP-2026-0001");
  await expect(page.getByRole("button", { name: /SHP-2026-0001/ })).toBeVisible();
  await expect(page.getByText(/Location unavailable/).first()).toBeVisible();
  await page.getByLabel("Filter map by excursion or position").selectOption("located");
  await expect(page.getByText("No matching shipments")).toBeVisible();
  await page.getByLabel("Filter map by excursion or position").selectOption("");
  await search.fill("");
  await page.getByRole("button", { name: /SHP-2026-0002/ }).click();
  await expect(page.getByText(/Simulated demo position/)).toBeVisible();
  await expect(page.getByRole("link", { name: "Open shipment record" })).toHaveAttribute("href", /\/app\/shipments\//);

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole("heading", { name: "Live fleet map" })).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  expect(overflow).toBe(false);
  expect(pageErrors).toEqual([]);
});

test("owner can validate, create, edit and archive a product through the API", async ({ page }) => {
  const pageErrors: string[] = [];
  const apiErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("response", (response) => {
    if (response.url().includes("/api/v1/") && response.status() >= 500) {
      apiErrors.push(`${response.request().method()} ${new URL(response.url()).pathname}: ${response.status()}`);
    }
  });

  await page.goto("/login");
  await page.getByRole("button", { name: "Use demo" }).click();
  await page.getByRole("button", { name: /enter console/i }).click();
  await expect(page).toHaveURL(/\/app$/);
  await page.goto("/app/products");

  await page.getByRole("button", { name: "New product" }).click();
  const dialog = page.getByRole("dialog", { name: "New product" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Create product" }).click();
  await expect(dialog.getByText("Product code is required")).toBeVisible();
  await expect(dialog.getByText("Product name is required")).toBeVisible();
  await expect(dialog.getByText("Category is required")).toBeVisible();

  const suffix = String(Date.now()).slice(-8);
  const code = `QA-${suffix}`;
  const originalName = `Workflow product ${suffix}`;
  const updatedName = `Updated workflow product ${suffix}`;
  await dialog.getByLabel("Product code").fill(code.toLowerCase());
  await dialog.getByLabel("Product name").fill(originalName);
  await dialog.getByLabel("Category").fill("Vaccine");
  await dialog.getByLabel("Minimum temperature (°C)").fill("2");
  await dialog.getByLabel("Maximum temperature (°C)").fill("8");
  await dialog.getByRole("button", { name: "Create product" }).click();

  const row = page.getByRole("row").filter({ hasText: code });
  await expect(row).toContainText(originalName);
  await expect(row).toContainText("Active");

  await row.getByRole("button", { name: "Edit" }).click();
  const editDialog = page.getByRole("dialog", { name: "Edit product" });
  await expect(editDialog).toBeVisible();
  await editDialog.getByLabel("Product name").fill(updatedName);
  await editDialog.getByRole("button", { name: "Save changes" }).click();
  await expect(row).toContainText(updatedName);

  await row.getByRole("button", { name: "Archive" }).click();
  const confirm = page.getByRole("dialog", { name: "Archive product" });
  await expect(confirm).toBeVisible();
  await confirm.getByRole("button", { name: "Archive" }).click();
  await expect(row).toContainText("Archived");

  expect(pageErrors).toEqual([]);
  expect(apiErrors).toEqual([]);
});
