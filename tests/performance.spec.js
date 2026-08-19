import { test, expect } from "@playwright/test";

test.describe.configure({ mode: "serial" });

const PROFILES = [
  { name: "720p TV", viewport: { width: 1280, height: 720 }, minAverageFps: 20, minP10Fps: 12 },
  { name: "1080p TV", viewport: { width: 1920, height: 1080 }, minAverageFps: 20, minP10Fps: 12 },
  { name: "4K TV", viewport: { width: 3840, height: 2160 }, minAverageFps: 18, minP10Fps: 10 }
];

async function waitForGame(page) {
  await page.waitForFunction(() => Boolean(
    window.travessiaGame && window.__gameTest && window.__aaaTest && window.__scoreTest
  ));
}

async function runtimeMetrics(page) {
  return page.evaluate(() => {
    const game = window.travessiaGame;
    const core = window.__gameTest.snapshot();
    const score = window.__scoreTest.snapshot();
    return {
      state: core.state,
      averageFps: game.performance.average,
      currentFps: game.performance.current,
      low: game.performance.low,
      renderCount: game.renderer.drawCount,
      particles: game.particles.items.length,
      vehicles: core.vehicles,
      timeLeft: core.timeLeft,
      canvas: core.canvas,
      soundtrack: score
    };
  });
}

async function sampleAnimationFrames(page, durationMs = 1800) {
  return page.evaluate((duration) => new Promise((resolve) => {
    const intervals = [];
    let previous = performance.now();
    const started = previous;

    function frame(now) {
      const delta = now - previous;
      if (delta > 0) intervals.push(delta);
      previous = now;
      if (now - started >= duration) {
        const fps = intervals.map((ms) => 1000 / ms).filter(Number.isFinite).sort((a, b) => a - b);
        const average = fps.length ? fps.reduce((sum, value) => sum + value, 0) / fps.length : 0;
        const p10 = fps.length ? fps[Math.floor((fps.length - 1) * .10)] : 0;
        resolve({ frames: intervals.length, average, p10 });
        return;
      }
      requestAnimationFrame(frame);
    }

    requestAnimationFrame(frame);
  }), durationMs);
}

for (const profile of PROFILES) {
  test.describe(profile.name, () => {
    test.use({ viewport: profile.viewport });

    test("stays inside the performance budget during representative gameplay", async ({ page }) => {
      await page.goto("/?debug=1&tv=1");
      await waitForGame(page);
      await page.keyboard.press("Enter");
      await expect.poll(async () => (await runtimeMetrics(page)).state).toBe("playing");

      const before = await runtimeMetrics(page);
      const cadence = await sampleAnimationFrames(page);
      const after = await runtimeMetrics(page);
      const renderDelta = after.renderCount - before.renderCount;

      // Deliberately tolerant CI budgets: these catch large regressions rather than benchmark GPUs.
      expect(cadence.average).toBeGreaterThanOrEqual(profile.minAverageFps);
      expect(cadence.p10).toBeGreaterThanOrEqual(profile.minP10Fps);
      expect(renderDelta).toBeGreaterThanOrEqual(18);
      expect(after.particles).toBeLessThanOrEqual(90);
      expect(after.vehicles).toBeLessThanOrEqual(30);
      expect(after.canvas.internal[0]).toBeLessThanOrEqual(2560);
      expect(after.canvas.internal[1]).toBeLessThanOrEqual(1440);
      expect(after.timeLeft).toBeLessThan(before.timeLeft);
      expect(after.soundtrack.active).toBe(true);

      console.log(JSON.stringify({
        profile: profile.name,
        cadence,
        runtimeAverageFps: after.averageFps,
        runtimeCurrentFps: after.currentFps,
        lowPerformanceMode: after.low,
        renderDelta,
        particles: after.particles,
        vehicles: after.vehicles,
        soundtrackNotes: after.soundtrack.notesPlayed,
        canvas: after.canvas.internal
      }));
    });
  });
}

test.describe("idle and adaptive degradation budgets", () => {
  test.use({ viewport: { width: 1280, height: 720 } });

  test("ready, paused and gameOver keep rendering and soundtrack work idle", async ({ page }) => {
    await page.goto("/?debug=1&tv=1&duration=2");
    await waitForGame(page);

    async function expectIdle(label) {
      const before = await runtimeMetrics(page);
      await page.waitForTimeout(550);
      const after = await runtimeMetrics(page);
      expect(after.renderCount - before.renderCount, `${label} render budget`).toBeLessThanOrEqual(2);
      expect(after.soundtrack.notesPlayed - before.soundtrack.notesPlayed, `${label} soundtrack budget`).toBe(0);
      expect(after.soundtrack.active, `${label} soundtrack state`).toBe(false);
    }

    await expectIdle("ready");

    await page.keyboard.press("Enter");
    await expect.poll(async () => (await runtimeMetrics(page)).state).toBe("playing");
    await page.keyboard.press("Escape");
    await expect.poll(async () => (await runtimeMetrics(page)).state).toBe("paused");
    await expectIdle("paused");

    await page.evaluate(() => window.__gameTest.finish());
    await expect.poll(async () => (await runtimeMetrics(page)).state).toBe("gameOver");
    await expectIdle("gameOver");
  });

  test("low-performance mode reduces particles without changing movement or timer semantics", async ({ page }) => {
    await page.goto("/?debug=1&tv=1");
    await waitForGame(page);
    await page.keyboard.press("Enter");
    await expect.poll(async () => (await runtimeMetrics(page)).state).toBe("playing");

    const normalParticles = await page.evaluate(() => {
      const game = window.travessiaGame;
      game.performance.low = false;
      window.__gameTest.forceScore();
      return game.particles.items.length;
    });

    await page.evaluate(() => {
      window.__gameTest.reset();
      const game = window.travessiaGame;
      game.performance.low = true;
      game.lanes.forEach((lane) => {
        lane.vehicles.length = 0;
        lane.spawnTimer = 999;
      });
    });

    const lowParticles = await page.evaluate(() => {
      window.__gameTest.forceScore();
      return window.travessiaGame.particles.items.length;
    });

    expect(lowParticles).toBeLessThan(normalParticles);
    expect(lowParticles).toBeLessThanOrEqual(28);

    await page.evaluate(() => {
      window.__gameTest.reset();
      const game = window.travessiaGame;
      game.performance.low = true;
      game.lanes.forEach((lane) => {
        lane.vehicles.length = 0;
        lane.spawnTimer = 999;
      });
    });

    const before = await page.evaluate(() => ({
      y: window.travessiaGame.player.y,
      time: window.travessiaGame.timeLeft
    }));
    await page.keyboard.down("ArrowUp");
    await page.waitForTimeout(350);
    await page.keyboard.up("ArrowUp");
    const after = await page.evaluate(() => ({
      y: window.travessiaGame.player.y,
      time: window.travessiaGame.timeLeft,
      low: window.travessiaGame.performance.low
    }));

    expect(after.low).toBe(true);
    expect(after.y).toBeLessThan(before.y);
    expect(after.time).toBeLessThan(before.time);
  });
});
