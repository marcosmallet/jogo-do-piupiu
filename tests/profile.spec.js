import { test, expect } from "@playwright/test";

async function openGame(page, duration = 4) {
  await page.goto(`/?debug=1&duration=${duration}`);
  await page.waitForFunction(() => Boolean(window.__gameTest && window.__aaaTest));
}

test("completed runs persist career progress across reloads", async ({ page }) => {
  await openGame(page);
  const initialRuns = await page.evaluate(() => window.__aaaTest.snapshot().profile.runs);

  await page.keyboard.press("Enter");
  await expect.poll(async () => page.evaluate(() => window.__gameTest.snapshot().state)).toBe("playing");
  await page.evaluate(() => window.__gameTest.forceScore());
  await expect.poll(async () => page.evaluate(() => window.__gameTest.snapshot().state)).toBe("playing");
  await page.evaluate(() => window.__gameTest.finish());

  await expect.poll(async () => page.evaluate(() => window.__aaaTest.snapshot().profile.runs)).toBe(initialRuns + 1);
  const saved = await page.evaluate(() => window.__aaaTest.snapshot().profile);
  expect(saved.bestCombo).toBeGreaterThanOrEqual(1);

  await page.reload();
  await page.waitForFunction(() => Boolean(window.__gameTest && window.__aaaTest));
  const reloaded = await page.evaluate(() => window.__aaaTest.snapshot().profile);
  expect(reloaded.runs).toBe(initialRuns + 1);
  expect(reloaded.bestCombo).toBeGreaterThanOrEqual(1);
});

test("match phases advance and change the visual direction", async ({ page }) => {
  await openGame(page, 3);
  await page.keyboard.press("Enter");
  await expect.poll(async () => page.evaluate(() => window.__gameTest.snapshot().state)).toBe("playing");

  await expect.poll(async () => page.evaluate(() => window.__aaaTest.snapshot().phase), { timeout: 2500 })
    .toBe("PRESSÃO SUBINDO");
  await expect(page.locator("#game-shell")).toHaveClass(/aaa-phase-mid/);
});
