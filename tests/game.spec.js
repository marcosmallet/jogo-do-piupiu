import { test, expect } from "@playwright/test";

async function openGame(page) {
  await page.goto("/?debug=1&duration=5");
  await page.waitForFunction(() => Boolean(window.__gameTest));
}

async function snapshot(page) {
  return page.evaluate(() => window.__gameTest.snapshot());
}

async function expectState(page, state) {
  await expect.poll(async () => (await snapshot(page)).state).toBe(state);
}

test.beforeEach(async ({ page }) => {
  await openGame(page);
});

test("initializes without external runtime resources", async ({ page }) => {
  const state = await snapshot(page);
  expect(state.state).toBe("ready");
  expect(state.difficulty).toBe("normal");
  expect(state.externalResources).toEqual([]);
  expect(state.canvas.internal[0]).toBeLessThanOrEqual(2560);
  expect(state.canvas.internal[1]).toBeLessThanOrEqual(1440);
});

test("pauses without advancing the timer and resumes", async ({ page }) => {
  await page.keyboard.press("Enter");
  await expectState(page, "playing");

  await page.keyboard.press("Escape");
  await expectState(page, "paused");
  const paused = await snapshot(page);

  await page.waitForTimeout(250);
  const stillPaused = await snapshot(page);
  expect(stillPaused.timeLeft).toBeCloseTo(paused.timeLeft, 2);

  await page.keyboard.press("Enter");
  await expectState(page, "playing");
});

test("persists a new best score immediately", async ({ page }) => {
  await page.keyboard.press("Enter");
  await expectState(page, "playing");

  await page.evaluate(() => window.__gameTest.forceScore());
  await expect.poll(async () => page.evaluate(() => localStorage.getItem("travessia-canarinho-best"))).toBe("1");

  await page.reload();
  await page.waitForFunction(() => Boolean(window.__gameTest));
  expect((await snapshot(page)).best).toBeGreaterThanOrEqual(1);
});

test("collision retreats the player and grants temporary invulnerability", async ({ page }) => {
  await page.keyboard.press("Enter");
  await expectState(page, "playing");

  await page.evaluate(() => window.__gameTest.setPlayerProgress(0.45));
  const before = await snapshot(page);
  await page.evaluate(() => window.__gameTest.forceCollision());
  const after = await snapshot(page);

  expect(after.state).toBe("hit");
  expect(after.player.invulnerable).toBeGreaterThan(0);
  expect(after.player.y).toBeGreaterThan(before.player.y);
});

test("does not continuously repaint a static screen", async ({ page }) => {
  await page.waitForTimeout(200);
  const before = (await snapshot(page)).renderCount;
  await page.waitForTimeout(350);
  const after = (await snapshot(page)).renderCount;
  expect(after).toBe(before);
});
