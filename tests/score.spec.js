import { test, expect } from "@playwright/test";

async function openGame(page) {
  await page.goto("/?debug=1&duration=6");
  await page.waitForFunction(() => Boolean(window.__gameTest && window.__aaaTest && window.__scoreTest));
}

test("adaptive score follows active gameplay and rush intensity", async ({ page }) => {
  await openGame(page);

  let score = await page.evaluate(() => window.__scoreTest.snapshot());
  expect(score.active).toBe(false);
  expect(score.bpm).toBe(96);

  await page.keyboard.press("Enter");
  await expect.poll(async () => page.evaluate(() => window.__gameTest.snapshot().state)).toBe("playing");
  await expect.poll(async () => page.evaluate(() => window.__scoreTest.snapshot().active)).toBe(true);

  await page.evaluate(() => window.__aaaTest.forceHype(100));
  await expect.poll(async () => page.evaluate(() => window.__scoreTest.snapshot().bpm), { timeout: 1200 }).toBe(148);

  await page.keyboard.press("Escape");
  await expect.poll(async () => page.evaluate(() => window.__gameTest.snapshot().state)).toBe("paused");
  await expect.poll(async () => page.evaluate(() => window.__scoreTest.snapshot().active)).toBe(false);
});
