import { test, expect } from "@playwright/test";

async function openGame(page) {
  await page.goto("/?debug=1&duration=5");
  await page.waitForFunction(() => Boolean(window.__gameTest?.setPlayerMode));
}

test.beforeEach(async ({ page }) => { await openGame(page); });

test("keeps 1P as default and enables two independent players", async ({ page }) => {
  expect((await page.evaluate(() => window.__gameTest.multiplayerSnapshot())).mode).toBe("1P");
  await page.evaluate(() => window.__gameTest.setPlayerMode(2));
  const snap = await page.evaluate(() => window.__gameTest.multiplayerSnapshot());
  expect(snap.mode).toBe("2P");
  expect(snap.players).toHaveLength(2);
  expect(snap.players[0].x).not.toBe(snap.players[1].x);
});

test("WASD moves only P1 and arrows move only P2", async ({ page }) => {
  await page.evaluate(() => window.__gameTest.setPlayerMode(2));
  await page.keyboard.press("Enter");
  const before = await page.evaluate(() => window.__gameTest.multiplayerSnapshot());
  await page.keyboard.down("KeyW"); await page.waitForTimeout(120); await page.keyboard.up("KeyW");
  const afterP1 = await page.evaluate(() => window.__gameTest.multiplayerSnapshot());
  expect(afterP1.players[0].y).toBeLessThan(before.players[0].y);
  expect(afterP1.players[1].y).toBeCloseTo(before.players[1].y, 3);
  await page.keyboard.down("ArrowUp"); await page.waitForTimeout(120); await page.keyboard.up("ArrowUp");
  const afterP2 = await page.evaluate(() => window.__gameTest.multiplayerSnapshot());
  expect(afterP2.players[1].y).toBeLessThan(afterP1.players[1].y);
});

test("collision and score are isolated per player", async ({ page }) => {
  await page.evaluate(() => window.__gameTest.setPlayerMode(2));
  await page.keyboard.press("Enter");

  // Capture both snapshots and apply the collision in the same browser task.
  // This prevents requestAnimationFrame from advancing an otherwise independent
  // player between observations and makes the assertion test collision causality.
  const collision = await page.evaluate(() => {
    const before = window.__gameTest.multiplayerSnapshot();
    window.__gameTest.forceCollisionForPlayer(1);
    const after = window.__gameTest.multiplayerSnapshot();
    return { before, after };
  });

  expect(collision.after.players[0].invulnerable).toBeGreaterThan(0);
  expect(collision.after.players[1].invulnerable).toBe(0);
  expect(collision.after.players[1].y).toBeCloseTo(collision.before.players[1].y, 3);

  const score = await page.evaluate(() => {
    window.__gameTest.forceScoreForPlayer(2);
    return window.__gameTest.multiplayerSnapshot();
  });
  expect(score.scores).toEqual([0, 1]);
});

test("2P result reports winner and does not overwrite 1P best", async ({ page }) => {
  await page.evaluate(() => localStorage.setItem("travessia-canarinho-best", "7"));
  await page.reload();
  await page.waitForFunction(() => Boolean(window.__gameTest?.setPlayerMode));
  await page.evaluate(() => window.__gameTest.setPlayerMode(2));
  await page.keyboard.press("Enter");
  await page.evaluate(() => { window.__gameTest.forceScoreForPlayer(1); window.__gameTest.setTimeLeft?.(0); });
  await page.waitForTimeout(120);
  expect(await page.evaluate(() => localStorage.getItem("travessia-canarinho-best"))).toBe("7");
  const snap = await page.evaluate(() => window.__gameTest.multiplayerSnapshot());
  expect(snap.winner).toBe("Jogador 1 venceu");
});
