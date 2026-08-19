import { test, expect } from "@playwright/test";

test.describe.configure({ mode: "serial" });

const PROFILES = [
  { name: "720p TV", viewport: { width: 1280, height: 720 }, minAverageFps: 20, minP10Fps: 12 },
  { name: "1080p TV", viewport: { width: 1920, height: 1080 }, minAverageFps: 20, minP10Fps: 12 },
  { name: "4K TV", viewport: { width: 3840, height: 2160 }, minAverageFps: 18, minP10Fps: 10 }
];

const STRESS_BUDGET = Object.freeze({
  usefulDurationMs: 5500,
  maxP95FrameMs: 100,
  maxP99FrameMs: 180,
  maxLongFrame50msRatio: .25,
  maxParticlesNormalWithPendingBurst: 102,
  maxParticlesLowWithPendingBurst: 35
});

async function waitForGame(page) {
  await page.waitForFunction(() => Boolean(
    window.travessiaGame && window.__gameTest && window.__aaaTest && window.__scoreTest
  ));
}

async function runtimeMetrics(page) {
  return page.evaluate(() => {
    const game = window.travessiaGame;
    const core = window.__gameTest.snapshot();
    const premium = window.__aaaTest.snapshot();
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
      playerY: core.player.y,
      canvas: core.canvas,
      premium,
      soundtrack: score
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
        const average = fps.length ? fps.reduce((sum, value) => sum + value, 0) / fps.length : 0;
        const p10 = percentile(fps, .10);
        const longFrames32 = intervals.filter((ms) => ms > 32).length;
        const longFrames50 = intervals.filter((ms) => ms > 50).length;
        resolve({
          frames: intervals.length,
          durationMs: now - started,
          average,
          p10,
          frameMs: {
            p50: percentile(sortedFrames, .50),
            p95: percentile(sortedFrames, .95),
            p99: percentile(sortedFrames, .99),
            max: sortedFrames.length ? sortedFrames[sortedFrames.length - 1] : 0
          },
          longFrames: {
            over32ms: longFrames32,
            over50ms: longFrames50,
            over32msRatio: intervals.length ? longFrames32 / intervals.length : 1,
            over50msRatio: intervals.length ? longFrames50 / intervals.length : 1
          }
        });
        return;
      }
      requestAnimationFrame(frame);
    }

    requestAnimationFrame(frame);
  }), durationMs);
}

async function startDeterministicStress(page) {
  await page.evaluate(() => {
    const game = window.travessiaGame;
    game.performance.low = false;

    game.lanes.forEach((lane) => {
      lane.vehicles.length = 0;
      lane.spawnTimer = 999;
      const choices = lane.allowedTypes();
      for (let index = 0; index < 3; index++) {
        const type = choices[(lane.index + index) % choices.length];
        const x = game.world.width * (.15 + index * .35);
        const vehicle = lane.makeVehicle(x, type, game.world, game.difficultySettings);
        vehicle.speed = 0;
        vehicle.__premiumBaseSpeed = 0;
        lane.vehicles.push(vehicle);
      }
    });

    window.__aaaTest.forceHype(100);

    const palette = ["#ffe239", "#fff", "#19a85b", "#2d73d2"];
    const timer = window.setInterval(() => {
      if (!["playing", "hit", "celebrating"].includes(game.state)) return;
      game.particles.emit(
        game.player.x + (game.elapsed % 2 < 1 ? game.world.laneH * .35 : -game.world.laneH * .35),
        game.player.y - game.world.laneH * .35,
        12,
        palette,
        "confetti",
        game.performance.low
      );
    }, 180);

    window.__stopPerformanceStress = () => {
      window.clearInterval(timer);
      delete window.__stopPerformanceStress;
    };
  });
}

async function stopDeterministicStress(page) {
  await page.evaluate(() => window.__stopPerformanceStress?.());
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

      // Deliberately tolerant CI floors: these catch large regressions rather than benchmark GPUs.
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

test.describe("stress experience budget", () => {
  test.use({ viewport: { width: 1920, height: 1080 } });

  test("measures sustained dense traffic, particles and Rush with stutter percentiles", async ({ page }) => {
    await page.goto("/?debug=1&tv=1");
    await waitForGame(page);
    await page.keyboard.press("Enter");
    await expect.poll(async () => (await runtimeMetrics(page)).state).toBe("playing");

    await startDeterministicStress(page);
    try {
      const before = await runtimeMetrics(page);
      expect(before.vehicles).toBe(30);
      expect(before.premium.rushTimer).toBeGreaterThan(0);

      const cadence = await sampleAnimationFrames(page, STRESS_BUDGET.usefulDurationMs);
      const after = await runtimeMetrics(page);

      expect(cadence.durationMs).toBeGreaterThanOrEqual(5000);
      expect(cadence.frames).toBeGreaterThanOrEqual(90);
      expect(cadence.frameMs.p95).toBeLessThanOrEqual(STRESS_BUDGET.maxP95FrameMs);
      expect(cadence.frameMs.p99).toBeLessThanOrEqual(STRESS_BUDGET.maxP99FrameMs);
      expect(cadence.longFrames.over50msRatio).toBeLessThanOrEqual(STRESS_BUDGET.maxLongFrame50msRatio);
      expect(after.timeLeft).toBeLessThan(before.timeLeft);
      expect(after.renderCount).toBeGreaterThan(before.renderCount);
      expect(after.vehicles).toBe(30);
      expect(after.particles).toBeLessThanOrEqual(after.low
        ? STRESS_BUDGET.maxParticlesLowWithPendingBurst
        : STRESS_BUDGET.maxParticlesNormalWithPendingBurst);

      console.log(JSON.stringify({
        profile: "1080p deterministic stress",
        targetExperience: "50–60 FPS on reasonable 720p/1080p hardware; graceful degradation on weak TVs",
        ciFloor: STRESS_BUDGET,
        cadence,
        lowPerformanceMode: after.low,
        particles: after.particles,
        vehicles: after.vehicles,
        rushRemaining: after.premium.rushTimer,
        soundtrackNotes: after.soundtrack.notesPlayed
      }));
    } finally {
      await stopDeterministicStress(page);
    }
  });
});

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
      game.lanes.forEach((lane) => {
        lane.vehicles.length = 0;
        lane.spawnTimer = 999;
      });
      window.__aaaTest.forceHype(100);
    });

    const lowEffects = await page.evaluate(() => {
      const game = window.travessiaGame;
      window.__gameTest.forceScore();
      return {
        particles: game.particles.items.length,
        lowFxClass: game.shell.classList.contains("aaa-lowfx"),
        speedlinesDisplay: getComputedStyle(document.querySelector("#aaa-speedlines")).display
      };
    });

    expect(lowEffects.particles).toBeLessThan(normalParticles);
    expect(lowEffects.particles).toBeLessThanOrEqual(28);
    expect(lowEffects.lowFxClass).toBe(true);
    expect(lowEffects.speedlinesDisplay).toBe("none");

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
