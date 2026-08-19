import { test, expect } from "@playwright/test";

test.describe.configure({ mode: "serial" });
test.setTimeout(60_000);

const CI_FLOOR = Object.freeze({
  minCrossingsPerDifficulty: 2,
  maxMedianWaitSeconds: 8,
  maxSingleWaitSeconds: 14,
  maxCollisionRatio: 3
});

async function waitForGame(page) {
  await page.waitForFunction(() => Boolean(window.travessiaGame && window.__gameTest && window.__aaaTest));
}

function percentile(values, fraction) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * fraction))];
}

test("fairness corridor has causal ON/OFF evidence with identical seeds", async ({ page }) => {
  await page.goto("/?debug=1&duration=40");
  await waitForGame(page);

  const report = await page.evaluate(() => {
    const game = window.travessiaGame;
    const originalRandom = Math.random;
    const originalFairnessUpdate = game.updateFairnessWindow;
    const difficulties = ["easy", "normal", "hard"];
    const seeds = [0xC0FFEE, 0x51A7E, 0xB17D];
    const recentFairnessWindow = 4.5;

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
        return Math.max(vehicle.x, projected) + half < left || Math.min(vehicle.x, projected) - half > right;
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

    function releaseFairnessHolds() {
      game.fairnessActive = false;
      game.fairnessTimer = 999;
      game.fairnessElapsed = 0;
      game.fairnessAnnounced = false;
      for (const lane of game.lanes) for (const vehicle of lane.vehicles) vehicle.fairnessHold = false;
    }

    function run(difficulty, seed, fairnessEnabled) {
      Math.random = seededRandom(seed);
      game.updateFairnessWindow = fairnessEnabled
        ? originalFairnessUpdate
        : function disabledFairness() { releaseFairnessHolds(); };
      game.resetGame(true);
      game.setDifficulty(difficulty);
      game.resetGame(true);
      game.audio.enabled = false;
      game.performance.low = false;
      if (!fairnessEnabled) releaseFairnessHolds();
      game.startGame();
      game.input.clear();

      const dt = 1 / 60;
      const maxSteps = Math.ceil(38 / dt);
      let previousScore = 0;
      let lastFairnessAt = -Infinity;
      let recentFairnessCrossings = 0;
      let committedLane = null;
      let currentTarget = null;
      let waitStartedAt = 0;
      let simTime = 0;
      const waits = [];
      let spawned = 0;
      let despawned = 0;
      let previousVehicles = new Set(game.lanes.flatMap((lane) => lane.vehicles));

      for (let step = 0; step < maxSteps && game.state !== "gameOver"; step++) {
        simTime += dt;
        if (game.fairnessActive) lastFairnessAt = simTime;

        if (game.state === "playing") {
          const candidate = targetLane();
          if (committedLane == null && candidate) {
            if (currentTarget !== candidate.index) {
              currentTarget = candidate.index;
              waitStartedAt = simTime;
            }
            if (laneIsSafe(candidate)) {
              waits.push(Math.max(0, simTime - waitStartedAt));
              committedLane = candidate.index;
            }
          }

          if (committedLane != null) {
            const lane = game.lanes[committedLane];
            game.input.up = true;
            if (game.player.y < lane.y(game.world) - game.world.laneH * .56) {
              committedLane = null;
              currentTarget = null;
            }
          } else {
            // No lane remains once the bird has cleared lane 0. Continue across
            // the final grass strip until topGoal so a completed run is scored.
            game.input.up = !candidate && game.player.y > game.world.topGoal;
          }
        } else {
          game.input.up = false;
        }

        game.update(dt);
        if (game.fairnessActive) lastFairnessAt = simTime;
        if (game.score > previousScore) {
          const gained = game.score - previousScore;
          if (simTime - lastFairnessAt <= recentFairnessWindow) recentFairnessCrossings += gained;
          previousScore = game.score;
          committedLane = null;
          currentTarget = null;
        }

        const vehicles = new Set(game.lanes.flatMap((lane) => lane.vehicles));
        for (const vehicle of vehicles) if (!previousVehicles.has(vehicle)) spawned += 1;
        for (const vehicle of previousVehicles) if (!vehicles.has(vehicle)) despawned += 1;
        previousVehicles = vehicles;
      }

      game.input.clear();
      const premium = window.__aaaTest.snapshot();
      const sortedWaits = [...waits].sort((a, b) => a - b);
      const pick = (fraction) => sortedWaits.length
        ? sortedWaits[Math.min(sortedWaits.length - 1, Math.floor((sortedWaits.length - 1) * fraction))]
        : 0;
      return {
        difficulty,
        seed,
        fairnessEnabled,
        crossings: game.score,
        recentFairnessCrossings,
        collisions: premium.collisions,
        nearMisses: premium.nearMisses,
        medianWait: pick(.5),
        p90Wait: pick(.9),
        maxWait: sortedWaits.at(-1) || 0,
        opportunities: waits.length,
        spawned,
        despawned
      };
    }

    try {
      const runs = [];
      for (const difficulty of difficulties) {
        for (const seed of seeds) {
          runs.push(run(difficulty, seed, true));
          runs.push(run(difficulty, seed, false));
        }
      }
      return runs;
    } finally {
      Math.random = originalRandom;
      game.updateFairnessWindow = originalFairnessUpdate;
      game.input.clear();
    }
  });

  for (const run of report) {
    expect(run.spawned, `${run.difficulty}/${run.seed}: traffic must spawn`).toBeGreaterThan(0);
    expect(run.despawned, `${run.difficulty}/${run.seed}: traffic must despawn`).toBeGreaterThan(0);
    expect(run.opportunities, `${run.difficulty}/${run.seed}: driver must observe opportunities`).toBeGreaterThan(0);
    expect(run.maxWait, `${run.difficulty}/${run.seed}: single-wait CI floor`).toBeLessThan(CI_FLOOR.maxSingleWaitSeconds);
  }

  for (const difficulty of ["easy", "normal", "hard"]) {
    const enabled = report.filter((run) => run.difficulty === difficulty && run.fairnessEnabled);
    const disabled = report.filter((run) => run.difficulty === difficulty && !run.fairnessEnabled);
    expect(enabled.map((run) => run.seed)).toEqual(disabled.map((run) => run.seed));

    const disabledCrossings = disabled.reduce((sum, run) => sum + run.crossings, 0);
    const disabledCollisions = disabled.reduce((sum, run) => sum + run.collisions, 0);
    const disabledMedianWait = percentile(disabled.map((run) => run.medianWait), .5);
    expect(disabledCrossings, `${difficulty}: completable without fairness`).toBeGreaterThanOrEqual(CI_FLOOR.minCrossingsPerDifficulty);
    expect(disabledMedianWait, `${difficulty}: median wait without fairness`).toBeLessThan(CI_FLOOR.maxMedianWaitSeconds);
    expect(disabledCollisions, `${difficulty}: collision floor without fairness`)
      .toBeLessThanOrEqual(disabledCrossings * CI_FLOOR.maxCollisionRatio + disabled.length);
  }

  console.log(JSON.stringify({ scenario: "causal fairness on/off", ciFloor: CI_FLOOR, runs: report }));
});
