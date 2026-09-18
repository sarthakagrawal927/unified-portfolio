import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
await mkdir("artifacts/design", { recursive: true });
const browser = await chromium.launch({ headless: true, channel: "chrome" });
const page = await browser.newPage();
const errors = [];
const checks = [];
page.on("pageerror", (e) => errors.push(e.message));
try {
  for (const width of [390, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const path of [
      "/",
      "/holdings",
      "/performance",
      "/accounts",
      "/settings",
    ]) {
      const response = await page.goto("http://127.0.0.1:3040" + path, {
        waitUntil: "networkidle",
      });
      assert.equal(response.status(), 200);
      const dimensions = await page.evaluate(() => ({
        width: innerWidth,
        scroll: document.documentElement.scrollWidth,
      }));
      assert.ok(
        dimensions.scroll <= dimensions.width,
        `${path} overflows at ${width}`,
      );
      await page.screenshot({
        path: `artifacts/design/${path === "/" ? "after" : path.slice(1)}-${width}.png`,
        fullPage: true,
      });
      checks.push({
        width,
        path,
        heading: await page.locator("h1").innerText(),
        ...dimensions,
      });
    }
  }
  await page.goto("http://127.0.0.1:3040/holdings");
  await page.getByPlaceholder("Company, ticker or ISIN").fill("Reliance");
  assert.equal(
    await page
      .getByRole("region", { name: "Holdings table", exact: true })
      .locator("tbody tr")
      .count(),
    1,
  );
  await page
    .getByPlaceholder("Company, ticker or ISIN")
    .fill("missing-instrument");
  assert.equal(
    await page
      .getByRole("region", { name: "Holdings table", exact: true })
      .locator("tbody tr")
      .count(),
    0,
  );
  await page.goto("http://127.0.0.1:3040/performance");
  await page.getByRole("button", { name: "1D", exact: true }).first().click();
  assert.equal(
    await page
      .getByRole("button", { name: "1D", exact: true })
      .first()
      .getAttribute("aria-pressed"),
    "true",
  );
  assert.equal(
    await page
      .getByRole("button", { name: "1M", exact: true })
      .first()
      .getAttribute("aria-pressed"),
    "false",
  );
  assert.deepEqual(errors, []);
  await writeFile(
    "artifacts/design/browser-check.json",
    JSON.stringify(
      { checks, errors, filters: "pass", period: "pass" },
      null,
      2,
    ),
  );
  console.log(
    JSON.stringify({
      routes: checks.length,
      errors,
      filters: "pass",
      period: "pass",
    }),
  );
} finally {
  await browser.close();
}
