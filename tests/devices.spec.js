import { test, expect } from "@playwright/test";

async function waitForGame(page) {
  await page.waitForFunction(() => Boolean(window.__gameTest && window.__aaaTest && window.__scoreTest));
}

async function snapshot(page) {
  return page.evaluate(() => window.__gameTest.snapshot());
}

test.describe("mobile portrait", () => {
  test.use({ viewport: { width: 360, height: 800 }, hasTouch: true, isMobile: true });

  test("keeps the game inside the viewport and exposes touch controls", async ({ page }) => {
    await page.goto("/?debug=1");
    await waitForGame(page);
    const state = await snapshot(page);

    expect(state.orientation).toBe("portrait");
    expect(state.canvas.css[0]).toBeLessThanOrEqual(360);
    expect(state.canvas.css[1]).toBeLessThanOrEqual(800);
    await expect(page.locator("#touch-up")).toBeVisible();
    await expect(page.locator("#touch-down")).toBeVisible();
    await expect(page.locator("#start-button")).toBeVisible();
  });
});

for (const [name, viewport] of [
  ["720p TV", { width: 1280, height: 720 }],
  ["1080p TV", { width: 1920, height: 1080 }],
  ["4K TV", { width: 3840, height: 2160 }]
]) {
  test.describe(name, () => {
    test.use({ viewport });

    test("keeps resolution bounded and TV controls clean", async ({ page }) => {
      await page.goto("/?debug=1&tv=1");
      await waitForGame(page);
      const state = await snapshot(page);

      expect(state.orientation).toBe("landscape");
      expect(state.canvas.internal[0]).toBeLessThanOrEqual(2560);
      expect(state.canvas.internal[1]).toBeLessThanOrEqual(1440);
      await expect(page.locator("#touch-controls")).toBeHidden();
      await expect(page.locator("#device-label")).toHaveText("Controle remoto");

      await page.keyboard.press("Enter");
      await expect.poll(async () => (await snapshot(page)).state).toBe("playing");
      await page.keyboard.press("Escape");
      await expect.poll(async () => (await snapshot(page)).state).toBe("paused");
    });
  });
}
