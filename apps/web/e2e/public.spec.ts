import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("public landing page loads across viewports without browser runtime errors", async ({ page }, testInfo) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.emulateMedia({ reducedMotion: "no-preference" });

  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Every degree.");
  await expect(page.getByRole("banner").getByRole("button", { name: /enter console/i })).toBeVisible();
  await expect(page.getByText("ARCHITECTURE VIEW")).toBeVisible();
  const primaryAction = page.getByRole("banner").getByRole("button", { name: /enter console/i });
  await primaryAction.hover();
  await expect
    .poll(() => primaryAction.evaluate((button) => getComputedStyle(button).filter))
    .toBe("saturate(1.08) brightness(1.05)");
  const heroArtwork = page.locator(".hero-artwork img");
  await expect(heroArtwork).toBeVisible();
  await expect.poll(() => heroArtwork.evaluate((image) => getComputedStyle(image).animationName)).toBe("fg-hero-drift");
  await expect.poll(() => page.locator(".hero-stage .aurora").evaluate((node) => getComputedStyle(node).animationName)).toBe("fg-aurora-flow");
  await expect.poll(() => page.locator(".hero-stage .text-gradient").evaluate((node) => getComputedStyle(node).animationName)).toBe("fg-spectrum");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect.poll(() => heroArtwork.evaluate((image) => getComputedStyle(image).animationName)).toBe("none");
  await expect.poll(() => page.locator(".hero-stage .aurora").evaluate((node) => getComputedStyle(node).animationName)).toBe("none");
  await expect.poll(() => page.locator(".hero-stage .text-gradient").evaluate((node) => getComputedStyle(node).animationName)).toBe("none");
  for (const [width, height] of [[375, 812], [390, 844], [768, 1024], [1366, 768], [1920, 1080]] as const) {
    await page.setViewportSize({ width, height });
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    expect(
      results.violations.filter((violation) => ["critical", "serious"].includes(violation.impact ?? "")),
      `landing page at ${width}x${height}`
    ).toEqual([]);
  }
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
