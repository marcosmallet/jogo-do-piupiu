import { test, expect } from "@playwright/test";

test.describe.configure({ mode: "serial" });

test.setTimeout(45_000);

async function waitForGame(page) {
  await page.waitForFunction(() => Boolean(
    window.travessiaGame && window.__gameTest && window.__aaaTest
  ));
}

test("a vehicle can award at most one near-miss per passage", async ({ page }) => {
  await page.goto("/?debug=1&duration=20");
  await waitForGame(page);
  await page.keyboard.press("Enter");

  const result = await page.evaluate(() => {
    const game = window.travessiaGame;
    game.audio.enabled = false;
    game.input.clear();

    const lane = game.lanes[4];
    game.lanes.forEach((candidate) => {
      candidate.vehicles.length = 0;
      candidate.spawnTimer = 999;
    });

    game.player.y = lane.y(game.world);
    game.player.invulnerable = 0;
    const vehicle = lane.makeVehicle(game.player.x, "sedan", game.world, game.difficultySettings);
    const collisionDistance = vehicle.width * .46 + game.player.width * .4;
    vehicle.x = game.player.x + collisionDistance + game.world.laneH * .18;
    vehicle.speed = 0;
    vehicle.__premiumBaseSpeed = 0;
    lane.vehicles.push(vehicle);

    const before = window.__aaaTest.snapshot().nearMisses;
    for (let index = 0; index < 8; index++) game.update(1 / 60);
    const afterRepeatedDetection = window.__aaaTest.snapshot().nearMisses;

    vehicle.x = game.player.x + collisionDistance + game.world.laneH;
    game.update(1 / 60);
    vehicle.x = game.player.x + collisionDistance + game.world.laneH * .18;
    for (let index = 0; index < 8; index++) game.update(1 / 60);
    const afterSameVehicleReturns = window.__aaaTest.snapshot().nearMisses;

    return { before, afterRepeatedDetection, afterSameVehicleReturns };
  });

  expect(result.afterRepeatedDetection - result.before).toBe(1);
  expect(result.afterSameVehicleReturns).toBe(result.afterRepeatedDetection);
});

test("collision breaks combo and drains Adrenalina", async ({ page }) => {
  await page.goto("/?debug=1&duration=20");
  await waitForGame(page);
  await page.keyboard.press("Enter");

  const result = await page.evaluate(() => {
    const game = window.travessiaGame;
    game.audio.enabled = false;

    const scoreAndResume = () => {
      window.__gameTest.forceScore();
      game.celebrationTimer = 0;
      game.update(1 / 60);
    };

    scoreAndResume();
    scoreAndResume();
    window.__aaaTest.forceHype(80);
    const before = window.__aaaTest.snapshot();

    game.player.invulnerable = 0;
    window.__gameTest.forceCollision();
    const after = window.__aaaTest.snapshot();

    return { before, after };
  });

  expect(result.before.combo).toBeGreaterThanOrEqual(2);
  expect(result.before.hype).toBe(80);
  expect(result.after.combo).toBe(0);
  expect(result.after.hype).toBeLessThan(result.before.hype);
  expect(result.after.rushTimer).toBe(0);
  expect(result.after.collisions).toBe(result.before.collisions + 1);
});

test("moving traffic remains recurrently traversable across every difficulty", async ({ page }) => {
  await page.goto("/?debug=1&duration=45");
  await waitForGame(page);

  const report = await page.evaluate(() => {
    const game = window.travessiaGame;
    const originalRandom = Math.random;
    const difficulties = ["easy", "normal", "hard"];
    const seeds = [0xC0FFEE, 0x51A7E, 0xB17D];

    function seededRandom(seed) {
      let value = seed >>> 0;
      return () => {
        value = (Math.imul(value, 1664525) + 1013904223) >>> 0;
        return value / 0x100000000;
      };
    }

    function laneIsSafe(lane, horizon = .58) {
      const playerHalf = game.player.width * .4;
      const left = game.player.x - playerHalf;
      const right = game.player.x + playerHalf;
      return lane.vehicles.every((vehicle) => {
        const half = vehicle.width * .46;
        const projected = vehicle.x + lane.direction * vehicle.speed * horizon;
        const minX = Math.min(vehicle.x, projected) - half;
        const maxX = Math.max(vehicle.x, projected) + half;
        return maxX < left || minX > right;
      });
    }

    function run(difficulty, seed) {
      Math.random = seededRandom(seed);
      game.resetGame(true);
      game.setDifficulty(difficulty);
      game.resetGame(true);
      game.audio.enabled = false;
      game.performance.low = false;
      game.startGame();
      game.input.clear();

      const dt = 1 / 60;
      const maxSteps = Math.ceil(44 / dt);
      const initialVehicles = new Set(game.lanes.flatMap((lane) => lane.vehicles));
      let previousVehicles = initialVehicles;
      let spawned = 0;
      let despawned = 0;
      let previousScore = game.score;
      let naturalCrossings = 0;
      let fairnessFrames = 0;
      let committedLane = null;
      const currentSafe = Array(game.lanes.length).fill(0);
      const safeWindows = [];
      const blocked = Array(game.lanes.length).fill(0);
      let maxBlocked = 0;

      for (let step = 0; step < maxSteps && game.state !== "gameOver"; step++) {
        for (const lane of game.lanes) {
          const safe = laneIsSafe(lane);
          if (safe) {
            currentSafe[lane.index] += dt;
            if (blocked[lane.index] > 0) {
              maxBlocked = Math.max(maxBlocked, blocked[lane.index]);
              blocked[lane.index] = 0;
            }
          } else {
            if (currentSafe[lane.index] > 0) {
              safeWindows.push(currentSafe[lane.index]);
              currentSafe[lane.index] = 0;
            }
            blocked[lane.index] += dt;
          }
        }

        if (game.state === "playing") {
          if (committedLane == null) {
            let candidate = null;
            for (const lane of game.lanes) {
              const y = lane.y(game.world);
              if (y < game.player.y && (!candidate || y > candidate.y(game.world))) candidate = lane;
            }
            if (candidate && laneIsSafe(candidate)) committedLane = candidate.index;
          }

          if (committedLane != null) {
            const lane = game.lanes[committedLane];
            game.input.up = true;
            if (game.player.y < lane.y(game.world) - game.world.laneH * .56) committedLane = null;
          } else {
            game.input.up = false;
          }
        } else {
          game.input.up = false;
        }

        const fairnessBefore = game.fairnessActive;
        game.update(dt);
        if (game.fairnessActive) fairnessFrames += 1;

        if (game.score > previousScore) {
          const delta = game.score - previousScore;
          if (!fairnessBefore && !game.fairnessActive) naturalCrossings += delta;
          previousScore = game.score;
          committedLane = null;
        }

        const vehicles = new Set(game.lanes.flatMap((lane) => lane.vehicles));
        for (const vehicle of vehicles) if (!previousVehicles.has(vehicle)) spawned += 1;
        for (const vehicle of previousVehicles) if (!vehicles.has(vehicle)) despawned += 1;
        previousVehicles = vehicles;
      }

      game.input.clear();
      for (const value of blocked) maxBlocked = Math.max(maxBlocked, value);
      for (const value of currentSafe) if (value > 0) safeWindows.push(value);

      const premium = window.__aaaTest.snapshot();
      const averageSafeWindow = safeWindows.length
        ? safeWindows.reduce((sum, value) => sum + value, 0) / safeWindows.length
        : 0;

      return {
        seed,
        difficulty,
        crossings: game.score,
        naturalCrossings,
        collisions: premium.collisions,
        nearMisses: premium.nearMisses,
        rushCount: premium.rushCount,
        averageSafeWindow,
        maxBlocked,
        spawned,
        despawned,
        fairnessRatio: fairnessFrames / maxSteps,
        vehiclesRemaining: [...previousVehicles].length
      };
    }

    try {
      const runs = [];
      for (const difficulty of difficulties) {
        for (const seed of seeds) runs.push(run(difficulty, seed));
      }
      return runs;
    } finally {
      Math.random = originalRandom;
      game.input.clear();
    }
  });

  const grouped = Object.groupBy
    ? Object.groupBy(report, (run) => run.difficulty)
    : report.reduce((groups, run) => {
        (groups[run.difficulty] ||= []).push(run);
        return groups;
      }, {});

  for (const difficulty of ["easy", "normal", "hard"]) {
    const runs = grouped[difficulty];
    const totals = runs.reduce((sum, run) => ({
      crossings: sum.crossings + run.crossings,
      naturalCrossings: sum.naturalCrossings + run.naturalCrossings,
      collisions: sum.collisions + run.collisions,
      nearMisses: sum.nearMisses + run.nearMisses,
      rushCount: sum.rushCount + run.rushCount,
      spawned: sum.spawned + run.spawned,
      despawned: sum.despawned + run.despawned
    }), { crossings: 0, naturalCrossings: 0, collisions: 0, nearMisses: 0, rushCount: 0, spawned: 0, despawned: 0 });

    expect(totals.crossings, `${difficulty}: recurrent completability`).toBeGreaterThanOrEqual(runs.length);
    expect(totals.naturalCrossings, `${difficulty}: success without permanent fairness corridor`).toBeGreaterThan(0);
    expect(totals.spawned, `${difficulty}: moving traffic must spawn`).toBeGreaterThan(0);
    expect(totals.despawned, `${difficulty}: moving traffic must despawn`).toBeGreaterThan(0);

    for (const run of runs) {
      expect(run.averageSafeWindow, `${difficulty}: observable safe windows`).toBeGreaterThan(.08);
      expect(run.maxBlocked, `${difficulty}: prolonged center-corridor blockage`).toBeLessThan(12);
      expect(run.fairnessRatio, `${difficulty}: fairness corridor cannot dominate the run`).toBeLessThan(.55);
    }

    expect(
      totals.collisions,
      `${difficulty}: excessive collisions relative to completed crossings`
    ).toBeLessThanOrEqual(totals.crossings * 2 + runs.length * 2);
    expect(
      totals.rushCount,
      `${difficulty}: Rush should not become trivial`
    ).toBeLessThanOrEqual(runs.length * 5);
  }

  console.log(JSON.stringify({ scenario: "deterministic moving-traffic fairness", runs: report }));
});
