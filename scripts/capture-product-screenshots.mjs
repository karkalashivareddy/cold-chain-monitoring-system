import { mkdir } from "node:fs/promises";
import path from "node:path";
import { chromium } from "@playwright/test";

const baseUrl = process.env.FROSTGUARD_BASE_URL ?? "http://localhost:5173";
const output = path.resolve("docs/audit/screenshots/release-candidate-20261031-final");
await mkdir(output, { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1366, height: 768 }, deviceScaleFactor: 1 });
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));

try {
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await page.screenshot({ path: path.join(output, "landing-desktop-1366x768.png"), fullPage: true });

  await page.goto(`${baseUrl}/login`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Use demo" }).click();
  await page.getByRole("button", { name: /enter console/i }).click();
  await page.getByRole("heading", { name: "Cold-chain overview" }).waitFor({ state: "visible" });

  const captures = [
    ["dashboard-desktop-1366x768.png", "/app", "Cold-chain overview"],
    ["fleet-map-desktop-1366x768.png", "/app/map", "Live fleet map"],
    ["products-desktop-1366x768.png", "/app/products", "Products"],
    ["incidents-desktop-1366x768.png", "/app/incidents", "Incidents"],
    ["analytics-desktop-1366x768.png", "/app/analytics", "Analytics"],
  ];
  for (const [filename, route, heading] of captures) {
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.goto(`${baseUrl}${route}`, { waitUntil: "networkidle" });
    await page.getByRole("heading", { name: heading, exact: true }).first().waitFor({ state: "visible" });
    await page.screenshot({ path: path.join(output, filename), fullPage: true });
  }

  await page.goto(`${baseUrl}/app/shipments`, { waitUntil: "networkidle" });
  await page.locator('a[href^="/app/shipments/"]').first().click();
  await page.getByRole("heading").first().waitFor({ state: "visible" });
  await page.screenshot({ path: path.join(output, "shipment-detail-desktop-1366x768.png"), fullPage: true });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${baseUrl}/app`, { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "Cold-chain overview" }).waitFor({ state: "visible" });
  await page.screenshot({ path: path.join(output, "dashboard-mobile-390x844.png"), fullPage: true });
  await page.goto(`${baseUrl}/app/map`, { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "Live fleet map" }).waitFor({ state: "visible" });
  await page.screenshot({ path: path.join(output, "fleet-map-mobile-390x844.png"), fullPage: true });
} finally {
  await browser.close();
}

if (errors.length) {
  process.stderr.write(`Browser runtime errors: ${errors.join(" | ")}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(`Captured verified application views to ${output}\n`);
}
