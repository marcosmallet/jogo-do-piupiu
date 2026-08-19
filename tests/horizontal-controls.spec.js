const { test, expect } = require('@playwright/test');

test('personagem move para esquerda e direita respeitando os limites', async ({ page }) => {
  await page.goto('/?debug=1');
  await page.locator('#start-button').click();
  await expect.poll(() => page.evaluate(() => !!window.__horizontalControlsTest)).toBe(true);
  const start = await page.evaluate(() => window.__horizontalControlsTest.playerX);
  await page.keyboard.down('ArrowLeft');
  await page.waitForTimeout(180);
  await page.keyboard.up('ArrowLeft');
  const left = await page.evaluate(() => window.__horizontalControlsTest.playerX);
  expect(left).toBeLessThan(start);
  await page.keyboard.down('ArrowRight');
  await page.waitForTimeout(360);
  await page.keyboard.up('ArrowRight');
  const right = await page.evaluate(() => window.__horizontalControlsTest.playerX);
  expect(right).toBeGreaterThan(left);

  await page.evaluate(() => { for (let i = 0; i < 30; i++) window.__horizontalControlsTest.move(-1, 1); });
  const atLeft = await page.evaluate(() => ({ x: window.__horizontalControlsTest.playerX, min: window.__horizontalControlsTest.minX }));
  expect(atLeft.x).toBeGreaterThanOrEqual(atLeft.min - 0.01);
  await page.evaluate(() => { for (let i = 0; i < 60; i++) window.__horizontalControlsTest.move(1, 1); });
  const atRight = await page.evaluate(() => ({ x: window.__horizontalControlsTest.playerX, max: window.__horizontalControlsTest.maxX }));
  expect(atRight.x).toBeLessThanOrEqual(atRight.max + 0.01);
});
