import { test, expect } from "@playwright/test";

async function openGame(page) {
  await page.goto("/?debug=1&duration=10");
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

  // The game intentionally spawns players at bottomSafeCenter, just outside the
  // normal movement clamp, then the first update settles them to bottomLimit.
  // Normalize that startup state before measuring input isolation so the clamp
  // itself is not mistaken for movement from the other player's controls.
  await page.evaluate(() => window.travessiaGame.updatePlayer(0));

  const p1Step = await page.evaluate(() => {
    const before = window.__gameTest.multiplayerSnapshot();
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "w", code: "KeyW", bubbles: true }));
    window.travessiaGame.updatePlayer(.12);
    window.dispatchEvent(new KeyboardEvent("keyup", { key: "w", code: "KeyW", bubbles: true }));
    return { before, after: window.__gameTest.multiplayerSnapshot() };
  });
  expect(p1Step.after.players[0].y).toBeLessThan(p1Step.before.players[0].y);
  expect(p1Step.after.players[1].y).toBeCloseTo(p1Step.before.players[1].y, 3);

  const p2Step = await page.evaluate(() => {
    const before = window.__gameTest.multiplayerSnapshot();
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowUp", code: "ArrowUp", bubbles: true }));
    window.travessiaGame.updatePlayer(.12);
    window.dispatchEvent(new KeyboardEvent("keyup", { key: "ArrowUp", code: "ArrowUp", bubbles: true }));
    return { before, after: window.__gameTest.multiplayerSnapshot() };
  });
  expect(p2Step.after.players[1].y).toBeLessThan(p2Step.before.players[1].y);
  expect(p2Step.after.players[0].y).toBeCloseTo(p2Step.before.players[0].y, 3);
});

test("A and D move only P1 laterally and stop on keyup", async ({ page }) => {
  await page.evaluate(() => window.__gameTest.setPlayerMode(2));
  await page.keyboard.press("Enter");
  const start = await page.evaluate(() => window.__gameTest.multiplayerSnapshot());

  await page.keyboard.down("KeyA");
  await page.waitForTimeout(140);
  await page.keyboard.up("KeyA");
  const afterA = await page.evaluate(() => window.__gameTest.multiplayerSnapshot());
  expect(afterA.players[0].x).toBeLessThan(start.players[0].x);
  expect(afterA.players[1].x).toBeCloseTo(start.players[1].x, 3);

  await page.waitForTimeout(100);
  const afterAReleased = await page.evaluate(() => window.__gameTest.multiplayerSnapshot());
  expect(afterAReleased.players[0].x).toBeCloseTo(afterA.players[0].x, 3);

  await page.keyboard.down("KeyD");
  await page.waitForTimeout(140);
  await page.keyboard.up("KeyD");
  const afterD = await page.evaluate(() => window.__gameTest.multiplayerSnapshot());
  expect(afterD.players[0].x).toBeGreaterThan(afterAReleased.players[0].x);
  expect(afterD.players[1].x).toBeCloseTo(start.players[1].x, 3);
});

test("P1 and P2 can move laterally at the same time without overwriting each other", async ({ page }) => {
  await page.evaluate(() => window.__gameTest.setPlayerMode(2));
  await page.keyboard.press("Enter");
  const before = await page.evaluate(() => window.__gameTest.multiplayerSnapshot());

  await page.keyboard.down("KeyD");
  await page.keyboard.down("ArrowLeft");
  await page.waitForTimeout(140);
  await page.keyboard.up("KeyD");
  await page.keyboard.up("ArrowLeft");

  const after = await page.evaluate(() => window.__gameTest.multiplayerSnapshot());
  expect(after.players[0].x).toBeGreaterThan(before.players[0].x);
  expect(after.players[1].x).toBeLessThan(before.players[1].x);
});

test("P1 lateral movement respects world bounds", async ({ page }) => {
  await page.evaluate(() => window.__gameTest.setPlayerMode(2));
  await page.keyboard.press("Enter");
  const bounds = await page.evaluate(() => ({
    min: window.__horizontalControlsTest.minX,
    max: window.__horizontalControlsTest.maxX,
    y: window.__gameTest.multiplayerSnapshot().players[0].y
  }));

  await page.evaluate(({ y }) => window.__gameTest.setPlayerPosition(1, 0, y), bounds);
  await page.keyboard.down("KeyA"); await page.waitForTimeout(120); await page.keyboard.up("KeyA");
  const left = await page.evaluate(() => window.__gameTest.multiplayerSnapshot().players[0].x);
  expect(left).toBeCloseTo(bounds.min, 3);

  await page.evaluate(({ max, y }) => window.__gameTest.setPlayerPosition(1, max + 1000, y), bounds);
  await page.keyboard.down("KeyD"); await page.waitForTimeout(120); await page.keyboard.up("KeyD");
  const right = await page.evaluate(() => window.__gameTest.multiplayerSnapshot().players[0].x);
  expect(right).toBeCloseTo(bounds.max, 3);
});

test("1P keeps A and D horizontal controls", async ({ page }) => {
  await page.keyboard.press("Enter");
  const before = await page.evaluate(() => window.__gameTest.multiplayerSnapshot());
  await page.keyboard.down("KeyA"); await page.waitForTimeout(120); await page.keyboard.up("KeyA");
  const afterA = await page.evaluate(() => window.__gameTest.multiplayerSnapshot());
  expect(afterA.players[0].x).toBeLessThan(before.players[0].x);
  await page.keyboard.down("KeyD"); await page.waitForTimeout(120); await page.keyboard.up("KeyD");
  const afterD = await page.evaluate(() => window.__gameTest.multiplayerSnapshot());
  expect(afterD.players[0].x).toBeGreaterThan(afterA.players[0].x);
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
