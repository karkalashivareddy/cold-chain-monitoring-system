import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("authenticated operational routes render without runtime or server errors", async ({ page }) => {
  test.setTimeout(90_000);
  const pageErrors: string[] = [];
  const serverErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("response", (response) => {
    if (response.url().includes("/api/v1/") && response.status() >= 500) {
      serverErrors.push(`${response.request().method()} ${new URL(response.url()).pathname}: ${response.status()}`);
    }
  });

  await page.goto("/login");
  await page.getByRole("button", { name: "Use demo" }).click();
  await page.getByRole("button", { name: /enter console/i }).click();
  await expect(page).toHaveURL(/\/app$/, { timeout: 15_000 });

  const routes = [
    ["/app", "Cold-chain overview"],
    ["/app/products", "Products"],
    ["/app/batches", "Batches"],
    ["/app/warehouses", "Warehouse network"],
    ["/app/storage-units", "Storage units"],
    ["/app/devices", "Devices & telemetry"],
    ["/app/shipments", "Shipments"],
    ["/app/map", "Live fleet map"],
    ["/app/incidents", "Incidents"],
    ["/app/alerts", "Alert queue"],
    ["/app/analytics", "Analytics"],
    ["/app/audit", "Audit trail"],
    ["/app/settings", "Members & access"],
    ["/app/dbms", "MySQL objects, plans & integrity"],
  ] as const;

  const audit = async (label: string) => {
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    const serious = results.violations.filter((violation) => ["critical", "serious"].includes(violation.impact ?? ""));
    const lowerImpact = results.violations
      .filter((violation) => !["critical", "serious"].includes(violation.impact ?? ""))
      .map(({ id, impact, nodes }) => ({ id, impact, affectedNodes: nodes.length }));
    if (lowerImpact.length) console.info(`[axe] ${label}: lower-impact findings ${JSON.stringify(lowerImpact)}`);
    expect(serious, `${label}: critical/serious axe findings`).toEqual([]);
  };

  for (const [path, heading] of routes) {
    await page.goto(path);
    await expect(page.getByRole("heading", { name: heading, exact: true }).first(), `${path} heading`).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole("navigation", { name: "Main navigation" })).toBeVisible();
    await expect(page.getByRole("main")).toBeVisible();
    await audit(path);
  }

  for (const [path, linkSelector] of [
    ["/app/batches", 'a[href^="/app/batches/"]'],
    ["/app/shipments", 'a[href^="/app/shipments/"]'],
  ]) {
    await page.goto(path);
    const detail = page.locator(linkSelector).first();
    await expect(detail, `${path} has a seeded detail record`).toBeVisible();
    await detail.click();
    await expect(page).toHaveURL(new RegExp(`${path}/[^/]+$`));
    await expect(page.getByRole("main")).toBeVisible();
    await expect(page.getByRole("heading").first()).toBeVisible();
  }

  // Incident fixtures can be resolved by the API integration suite. Verify
  // either the available detail navigation or the intentional empty state.
  await page.goto("/app/incidents");
  const incidentLink = page.locator('a[href^="/app/incidents/"]').first();
  const emptyIncidents = page.getByText("No incidents match");
  await expect.poll(async () => (await incidentLink.count()) > 0 || await emptyIncidents.isVisible()).toBe(true);
  if (await incidentLink.count()) {
    await incidentLink.click();
    await expect(page).toHaveURL(/\/app\/incidents\/[^/]+$/);
    await expect(page.getByRole("main")).toBeVisible();
  } else {
    await expect(emptyIncidents).toBeVisible();
  }

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/app/products");
  await expect(page.getByRole("heading", { name: "Products", exact: true })).toBeVisible();
  await audit("/app/products at 390x844");
  await page.keyboard.press("Tab");
  await expect(page.locator(":focus")).toBeVisible();

  for (const [width, height] of [[375, 812], [768, 1024], [1366, 768], [1920, 1080]] as const) {
    await page.setViewportSize({ width, height });
    await page.goto("/app");
    await expect(page.getByRole("heading", { name: "Cold-chain overview" })).toBeVisible();
    await audit(`/app at ${width}x${height}`);
  }

  expect(pageErrors).toEqual([]);
  expect(serverErrors).toEqual([]);
});
