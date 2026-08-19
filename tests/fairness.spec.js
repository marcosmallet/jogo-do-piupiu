import { test, expect } from "@playwright/test";

test.describe.configure({ mode: "serial" });
test.setTimeout(60_000);

async function waitForGame(page) {
  await page.waitForFunction(() => Boolean(window.travessiaGame && window.__gameTest && window.__aaaTest));
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
    game.lanes.forEach((candidate) => { candidate.vehicles.length = 0; candidate.spawnTimer = 999; });
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
    return { before, afterRepeatedDetection, afterSameVehicleReturns: window.__aaaTest.snapshot().nearMisses };
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
    return { before, after: window.__aaaTest.snapshot() };
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

    function targetLane() {
      let candidate = null;
      for (const lane of game.lanes) {
        const y = lane.y(game.world);
        if (y < game.player.y && (!candidate || y > candidate.y(game.world))) candidate = lane;
      }
      return candidate;
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
      let committedLane = null;
      let previousScore = 0;
      let fairnessFrames = 0;
      let spawned = 0;
      let despawned = 0;
      let previousVehicles = new Set(game.lanes.flatMap((lane) => lane.vehicles));

      for (let step = 0; step < maxSteps && game.state !== "gameOver"; step++) {
        if (game.state === "playing") {
          const candidate = targetLane();
          if (committedLane == null && candidate && laneIsSafe(candidate)) committedLane = candidate.index;

          if (committedLane != null) {
            const lane = game.lanes[committedLane];
            game.input.up = true;
            if (game.player.y < lane.y(game.world) - game.world.laneH * .56) committedLane = null;
          } else {
            // After lane 0 there is still a short grass stretch before topGoal.
            // Keep walking so the simulated driver actually completes the crossing.
            game.input.up = !candidate && game.player.y > game.world.topGoal;
          }
        } else {
          game.input.up = false;
        }

        game.update(dt);
        if (game.fairnessActive) fairnessFrames += 1;
        if (game.score > previousScore) {
          previousScore = game.score;
          committedLane = null;
        }

        const vehicles = new Set(game.lanes.flatMap((lane) => lane.vehicles));
        for (const vehicle of vehicles) if (!previousVehicles.has(vehicle)) spawned += 1;
        for (const vehicle of previousVehicles) if (!vehicles.has(vehicle)) despawned += 1;
        previousVehicles = vehicles;
      }

      game.input.clear();
      const premium = window.__aaaTest.snapshot();
      return {
        difficulty,
        seed,
        crossings: game.score,
        collisions: premium.collisions,
        nearMisses: premium.nearMisses,
        rushCount: premium.rushCount,
        spawned,
        despawned,
        fairnessRatio: fairnessFrames / maxSteps
      };
    }

    try {
      const runs = [];
      for (const difficulty of difficulties) for (const seed of seeds) runs.push(run(difficulty, seed));
      return runs;
    } finally {
      Math.random = originalRandom;
      game.input.clear();
    }
  });

  for (const difficulty of ["easy", "normal", "hard"]) {
    const runs = report.filter((run) => run.difficulty === difficulty);
    const crossings = runs.reduce((sum, run) => sum + run.crossings, 0);
    expect(crossings, `${difficulty}: recurrent completability`).toBeGreaterThanOrEqual(runs.length);
    expect(runs.reduce((sum, run) => sum + run.spawned, 0), `${difficulty}: moving traffic must spawn`).toBeGreaterThan(0);
    expect(runs.reduce((sum, run) => sum + run.despawned, 0), `${difficulty}: moving traffic must despawn`).toBeGreaterThan(0);
    for (const run of runs) expect(run.fairnessRatio, `${difficulty}: fairness corridor cannot dominate`).toBeLessThan(.55);
  }

  // Collision counts are diagnostic here. The scripted driver uses a deliberately
  // simple lane-safety heuristic, so its collision ratio is not a valid skill or
  // balance proxy—especially on Hard. Real balance decisions use the printed data.
  console.log(JSON.stringify({ scenario: "deterministic moving-traffic fairness", runs: report }));
});
