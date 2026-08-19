import { test, expect } from "@playwright/test";

test.describe.configure({ mode: "serial" });

const PROFILES = [
  { name: "720p TV", viewport: { width: 1280, height: 720 }, minAverageFps: 16, minP10Fps: 8 },
  { name: "1080p TV", viewport: { width: 1920, height: 1080 }, minAverageFps: 12, minP10Fps: 6 },
  // GitHub's headless Chromium uses software rendering. 4K remains a
  // continuity/degradation gate; it is deliberately not treated as a GPU benchmark.
  { name: "4K TV", viewport: { width: 3840, height: 2160 }, minAverageFps: null, minP10Fps: null }
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
    return {
      state: core.state,
      averageFps: game.performance.average,
      currentFps: game.performance.current,
      low: game.performance.low,
      renderCount: game.renderer.drawCount,
      particles: game.particles.items.length,
      vehicles: core.vehicles,
      timeLeft: core.timeLeft,
      playerY: core.player.y,
      canvas: core.canvas,
      premium: window.__aaaTest.snapshot(),
      soundtrack: window.__scoreTest.snapshot()
    };
  });
}

async function sampleAnimationFrames(page, durationMs = 1800) {
  return page.evaluate((duration) => new Promise((resolve) => {
    const intervals = [];
    let previous = performance.now();
    const started = previous;
    function percentile(sorted, fraction) {
      if (!sorted.length) return 0;
      return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * fraction))];
    }
    function frame(now) {
      const delta = now - previous;
      if (delta > 0) intervals.push(delta);
      previous = now;
      if (now - started >= duration) {
        const fps = intervals.map((ms) => 1000 / ms).filter(Number.isFinite).sort((a, b) => a - b);
        const sortedFrames = [...intervals].sort((a, b) => a - b);
        resolve({
          frames: intervals.length,
          durationMs: now - started,
          average: fps.length ? fps.reduce((sum, value) => sum + value, 0) / fps.length : 0,
          p10: percentile(fps, .10),
          p95FrameMs: percentile(sortedFrames, .95),
          maxFrameMs: sortedFrames.at(-1) || 0
        });
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

    test("keeps gameplay alive within the CI performance contract", async ({ page }) => {
      await page.goto("/?debug=1&tv=1");
      await waitForGame(page);
      await page.keyboard.press("Enter");
      await expect.poll(async () => (await runtimeMetrics(page)).state).toBe("playing");

      const before = await runtimeMetrics(page);
      const cadence = await sampleAnimationFrames(page);
      const after = await runtimeMetrics(page);
      const renderDelta = after.renderCount - before.renderCount;

      if (profile.minAverageFps != null) {
        expect(cadence.average, `${profile.name}: tolerant average-FPS floor`).toBeGreaterThanOrEqual(profile.minAverageFps);
        expect(cadence.p10, `${profile.name}: tolerant p10-FPS floor`).toBeGreaterThanOrEqual(profile.minP10Fps);
      } else {
        // On 4K the hosted runner is not a meaningful GPU benchmark. Require
        // forward progress and absence of a multi-second render stall instead.
        expect(cadence.frames, "4K: animation must keep producing frames").toBeGreaterThanOrEqual(5);
        expect(cadence.maxFrameMs, "4K: no catastrophic render stall").toBeLessThan(1000);
      }

      expect(renderDelta).toBeGreaterThanOrEqual(5);
      expect(after.particles).toBeLessThanOrEqual(90);
      expect(after.vehicles).toBeLessThanOrEqual(30);
      expect(after.canvas.internal[0]).toBeLessThanOrEqual(2560);
      expect(after.canvas.internal[1]).toBeLessThanOrEqual(1440);
      expect(after.timeLeft).toBeLessThan(before.timeLeft);
      expect(after.soundtrack.active).toBe(true);

      console.log(JSON.stringify({ profile: profile.name, cadence, renderDelta, canvas: after.canvas.internal, low: after.low }));
    });
  });
}

test.describe("stress and adaptive degradation", () => {
  test.use({ viewport: { width: 1920, height: 1080 } });

  test("dense traffic and Rush keep simulation progressing", async ({ page }) => {
    await page.goto("/?debug=1&tv=1");
    await waitForGame(page);
    await page.keyboard.press("Enter");
    await expect.poll(async () => (await runtimeMetrics(page)).state).toBe("playing");

    await page.evaluate(() => {
      const game = window.travessiaGame;
      game.lanes.forEach((lane) => {
        lane.vehicles.length = 0;
        lane.spawnTimer = 999;
        const choices = lane.allowedTypes();
        for (let index = 0; index < 3; index++) {
          const vehicle = lane.makeVehicle(game.world.width * (.15 + index * .35), choices[index % choices.length], game.world, game.difficultySettings);
          vehicle.speed = 0;
          vehicle.__premiumBaseSpeed = 0;
          lane.vehicles.push(vehicle);
        }
      });
      window.__aaaTest.forceHype(100);
    });

    const before = await runtimeMetrics(page);
    const cadence = await sampleAnimationFrames(page, 4000);
    const after = await runtimeMetrics(page);
    expect(before.vehicles).toBe(30);
    expect(before.premium.rushTimer).toBeGreaterThan(0);
    expect(cadence.durationMs).toBeGreaterThanOrEqual(3500);
    expect(cadence.frames).toBeGreaterThanOrEqual(30);
    expect(after.timeLeft).toBeLessThan(before.timeLeft);
    expect(after.renderCount).toBeGreaterThan(before.renderCount);
    expect(after.vehicles).toBe(30);
    expect(after.particles).toBeLessThanOrEqual(after.low ? 35 : 102);
  });

  test("low-performance mode reduces effects before movement or timer semantics", async ({ page }) => {
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
      game.lanes.forEach((lane) => { lane.vehicles.length = 0; lane.spawnTimer = 999; });
      window.__aaaTest.forceHype(100);
      window.__gameTest.forceScore();
    });
    const lowEffects = await page.evaluate(() => ({
      particles: window.travessiaGame.particles.items.length,
      lowFxClass: window.travessiaGame.shell.classList.contains("aaa-lowfx"),
      speedlinesDisplay: getComputedStyle(document.querySelector("#aaa-speedlines")).display
    }));
    expect(lowEffects.particles).toBeLessThan(normalParticles);
    expect(lowEffects.particles).toBeLessThanOrEqual(28);
    expect(lowEffects.lowFxClass).toBe(true);
    expect(lowEffects.speedlinesDisplay).toBe("none");

    await page.evaluate(() => {
      window.__gameTest.reset();
      const game = window.travessiaGame;
      game.performance.low = true;
      game.lanes.forEach((lane) => { lane.vehicles.length = 0; lane.spawnTimer = 999; });
    });
    const before = await runtimeMetrics(page);
    await page.keyboard.down("ArrowUp");
    await page.waitForTimeout(350);
    await page.keyboard.up("ArrowUp");
    const after = await runtimeMetrics(page);
    expect(after.low).toBe(true);
    expect(after.playerY).toBeLessThan(before.playerY);
    expect(after.timeLeft).toBeLessThan(before.timeLeft);
  });
});

test.describe("idle budget", () => {
  test.use({ viewport: { width: 1280, height: 720 } });

  test("ready, paused and gameOver stay idle", async ({ page }) => {
    await page.goto("/?debug=1&tv=1&duration=2");
    await waitForGame(page);
    async function expectIdle(label) {
      const before = await runtimeMetrics(page);
      await page.waitForTimeout(550);
      const after = await runtimeMetrics(page);
      expect(after.renderCount - before.renderCount, `${label}: render budget`).toBeLessThanOrEqual(2);
      expect(after.soundtrack.notesPlayed - before.soundtrack.notesPlayed, `${label}: soundtrack budget`).toBe(0);
      expect(after.soundtrack.active, `${label}: soundtrack state`).toBe(false);
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
});
