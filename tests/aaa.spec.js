import { test, expect } from "@playwright/test";

async function openGame(page) {
  await page.goto("/?debug=1&duration=8");
  await page.waitForFunction(() => Boolean(window.__gameTest && window.__aaaTest));
}

async function premium(page) {
  return page.evaluate(() => window.__aaaTest.snapshot());
}

test.beforeEach(async ({ page }) => {
  await openGame(page);
  await page.keyboard.press("Enter");
  await expect.poll(async () => page.evaluate(() => window.__gameTest.snapshot().state)).toBe("playing");
});

test("near miss builds adrenaline without changing the score", async ({ page }) => {
  const beforeScore = await page.evaluate(() => window.__gameTest.snapshot().score);
  await page.evaluate(() => window.__aaaTest.forceNearMiss());
  const state = await premium(page);
  const afterScore = await page.evaluate(() => window.__gameTest.snapshot().score);

  expect(state.nearMisses).toBe(1);
  expect(state.hype).toBeGreaterThan(0);
  expect(afterScore).toBe(beforeScore);
});

test("successful crossings build combo and award a capped time bonus", async ({ page }) => {
  await page.evaluate(() => window.__gameTest.forceScore());
  await expect.poll(async () => (await premium(page)).combo).toBe(1);
  await expect.poll(async () => page.evaluate(() => window.__gameTest.snapshot().state)).toBe("playing");

  await page.evaluate(() => window.__gameTest.forceScore());
  await expect.poll(async () => (await premium(page)).combo).toBe(2);
  const state = await premium(page);
  const timeLeft = await page.evaluate(() => window.__gameTest.snapshot().timeLeft);

  expect(state.maxCombo).toBe(2);
  expect(state.timeBonus).toBeGreaterThan(0);
  expect(timeLeft).toBeLessThanOrEqual(20);
});

test("collision breaks combo and records the impact", async ({ page }) => {
  await page.evaluate(() => window.__gameTest.forceScore());
  await expect.poll(async () => page.evaluate(() => window.__gameTest.snapshot().state)).toBe("playing");
  await page.evaluate(() => window.__gameTest.forceScore());
  await expect.poll(async () => (await premium(page)).combo).toBe(2);
  await expect.poll(async () => page.evaluate(() => window.__gameTest.snapshot().state)).toBe("playing");

  await page.evaluate(() => window.__gameTest.forceCollision());
  const state = await premium(page);

  expect(state.combo).toBe(0);
  expect(state.collisions).toBe(1);
});

test("full adrenaline activates the temporary Pistola mode", async ({ page }) => {
  await page.evaluate(() => window.__aaaTest.forceHype(100));
  const state = await premium(page);
  expect(state.rushTimer).toBeGreaterThan(0);
  await expect(page.locator("#game-shell")).toHaveClass(/aaa-rush/);
});
