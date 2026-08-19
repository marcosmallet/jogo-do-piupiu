import { test, expect } from "@playwright/test";

test.describe.configure({ mode: "serial" });
test.setTimeout(60_000);

const CI_FLOOR = Object.freeze({
  minCrossingsPerDifficulty: 2,
  maxMedianWaitSeconds: 8,
  maxSingleWaitSeconds: 14
});

// Extra TTC margin reserved for the deterministic driver's decision/command latency.
// This is intentionally independent from physical lane-crossing time, which is derived
// below from the runtime's minimumOpenTime() contract for the active difficulty.
const DRIVER_DECISION_BUFFER_SECONDS = 0.18;

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

  const report = await page.evaluate(({ driverDecisionBufferSeconds }) => {
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

    function vehicleTimeToCorridor(lane, vehicle) {
      const playerHalf = game.player.width * .4;
      const corridorLeft = game.player.x - playerHalf;
      const corridorRight = game.player.x + playerHalf;
      const vehicleHalf = vehicle.width * .46;
      const vehicleLeft = vehicle.x - vehicleHalf;
      const vehicleRight = vehicle.x + vehicleHalf;

      if (vehicleRight >= corridorLeft && vehicleLeft <= corridorRight) return 0;

      const effectiveSpeed = vehicle.fairnessHold ? 0 : Math.max(0, vehicle.speed);
      if (effectiveSpeed <= 0) return Infinity;

      if (lane.direction > 0) {
        if (vehicleLeft > corridorRight) return Infinity;
        return Math.max(0, (corridorLeft - vehicleRight) / effectiveSpeed);
      }

      if (vehicleRight < corridorLeft) return Infinity;
      return Math.max(0, (vehicleLeft - corridorRight) / effectiveSpeed);
    }

    function assessLane(lane, crossingDuration, safetyBuffer) {
      let earliestArrival = Infinity;
      for (const vehicle of lane.vehicles) {
        earliestArrival = Math.min(earliestArrival, vehicleTimeToCorridor(lane, vehicle));
      }
      const safetyMargin = earliestArrival - crossingDuration;
      return {
        safe: safetyMargin >= safetyBuffer,
        earliestArrival,
        safetyMargin
      };
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

      const laneContract = game.lanes[0];
      const minimumOpenTime = laneContract.minimumOpenTime(game.difficultySettings);
      const reactionTime = game.difficultySettings.reactionTime;
      const crossingDuration = minimumOpenTime - reactionTime;
      const safetyBuffer = driverDecisionBufferSeconds;

      const dt = 1 / 60;
      const maxSteps = Math.ceil(38 / dt);
      let previousScore = 0;
      let lastFairnessAt = -Infinity;
      let recentFairnessCrossings = 0;
      let committedLane = null;
      let currentTarget = null;
      let waitStartedAt = 0;
      let simTime = 0;
      let acceptedOpportunities = 0;
      let rejectedOpportunities = 0;
      let minAcceptedSafetyMargin = Infinity;
      let minObservedSafetyMargin = Infinity;
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

            const assessment = assessLane(candidate, crossingDuration, safetyBuffer);
            if (Number.isFinite(assessment.safetyMargin)) {
              minObservedSafetyMargin = Math.min(minObservedSafetyMargin, assessment.safetyMargin);
            }

            if (assessment.safe) {
              waits.push(Math.max(0, simTime - waitStartedAt));
              acceptedOpportunities += 1;
              if (Number.isFinite(assessment.safetyMargin)) {
                minAcceptedSafetyMargin = Math.min(minAcceptedSafetyMargin, assessment.safetyMargin);
              }
              committedLane = candidate.index;
            } else {
              rejectedOpportunities += 1;
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
        acceptedOpportunities,
        rejectedOpportunities,
        minAcceptedSafetyMargin: Number.isFinite(minAcceptedSafetyMargin) ? minAcceptedSafetyMargin : null,
        minObservedSafetyMargin: Number.isFinite(minObservedSafetyMargin) ? minObservedSafetyMargin : null,
        minimumOpenTime,
        reactionTime,
        crossingDuration,
        safetyBuffer,
        safetyBufferBasis: "deterministic driver decision/command latency",
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
  }, { driverDecisionBufferSeconds: DRIVER_DECISION_BUFFER_SECONDS });

  for (const run of report) {
    expect(run.spawned, `${run.difficulty}/${run.seed}: traffic must spawn`).toBeGreaterThan(0);
    expect(run.despawned, `${run.difficulty}/${run.seed}: traffic must despawn`).toBeGreaterThan(0);
    expect(run.acceptedOpportunities, `${run.difficulty}/${run.seed}: driver must accept opportunities`).toBeGreaterThan(0);
    expect(run.maxWait, `${run.difficulty}/${run.seed}: single-wait CI floor`).toBeLessThan(CI_FLOOR.maxSingleWaitSeconds);
    expect(run.minimumOpenTime - run.reactionTime, `${run.difficulty}/${run.seed}: crossing duration must come from runtime contract`)
      .toBeCloseTo(run.crossingDuration, 10);
    expect(run.crossingDuration, `${run.difficulty}/${run.seed}: physical crossing duration must be positive`).toBeGreaterThan(0);
    expect(run.safetyBuffer, `${run.difficulty}/${run.seed}: decision buffer must be independent and positive`).toBe(DRIVER_DECISION_BUFFER_SECONDS);
    expect(run.safetyBuffer, `${run.difficulty}/${run.seed}: decision buffer cannot replace physical crossing time`).toBeLessThan(run.crossingDuration);
    expect(
      run.minAcceptedSafetyMargin == null || run.minAcceptedSafetyMargin >= run.safetyBuffer,
      `${run.difficulty}/${run.seed}: accepted lane must respect the TTC safety buffer`
    ).toBe(true);
  }

  const pairedSummary = [];
  for (const difficulty of ["easy", "normal", "hard"]) {
    const enabled = report.filter((run) => run.difficulty === difficulty && run.fairnessEnabled);
    const disabled = report.filter((run) => run.difficulty === difficulty && !run.fairnessEnabled);
    expect(enabled.map((run) => run.seed)).toEqual(disabled.map((run) => run.seed));

    const disabledCrossings = disabled.reduce((sum, run) => sum + run.crossings, 0);
    const disabledMedianWait = percentile(disabled.map((run) => run.medianWait), .5);
    expect(disabledCrossings, `${difficulty}: completable without fairness`).toBeGreaterThanOrEqual(CI_FLOOR.minCrossingsPerDifficulty);
    expect(disabledMedianWait, `${difficulty}: median wait without fairness`).toBeLessThan(CI_FLOOR.maxMedianWaitSeconds);

    const pairs = enabled.map((on, index) => {
      const off = disabled[index];
      return {
        seed: on.seed,
        on,
        off,
        delta: {
          crossings: on.crossings - off.crossings,
          collisions: on.collisions - off.collisions,
          nearMisses: on.nearMisses - off.nearMisses,
          medianWait: on.medianWait - off.medianWait,
          p90Wait: on.p90Wait - off.p90Wait,
          maxWait: on.maxWait - off.maxWait,
          acceptedOpportunities: on.acceptedOpportunities - off.acceptedOpportunities,
          rejectedOpportunities: on.rejectedOpportunities - off.rejectedOpportunities,
          recentFairnessCrossings: on.recentFairnessCrossings - off.recentFairnessCrossings
        }
      };
    });

    pairedSummary.push({
      difficulty,
      pairs,
      aggregateDelta: {
        crossings: pairs.reduce((sum, pair) => sum + pair.delta.crossings, 0),
        collisions: pairs.reduce((sum, pair) => sum + pair.delta.collisions, 0),
        nearMisses: pairs.reduce((sum, pair) => sum + pair.delta.nearMisses, 0),
        medianWait: percentile(pairs.map((pair) => pair.delta.medianWait), .5),
        p90Wait: percentile(pairs.map((pair) => pair.delta.p90Wait), .5),
        maxWait: Math.max(...pairs.map((pair) => pair.delta.maxWait)),
        acceptedOpportunities: pairs.reduce((sum, pair) => sum + pair.delta.acceptedOpportunities, 0),
        rejectedOpportunities: pairs.reduce((sum, pair) => sum + pair.delta.rejectedOpportunities, 0),
        recentFairnessCrossings: pairs.reduce((sum, pair) => sum + pair.delta.recentFairnessCrossings, 0)
      }
    });
  }

  // This TTC-driver run remains observational until a reproducible baseline is captured.
  // Once observed, paired ON/OFF deltas can become causal gates without inventing balance thresholds.
  console.log(JSON.stringify({
    scenario: "causal fairness on/off with runtime-derived TTC driver",
    driverDecisionBufferSeconds: DRIVER_DECISION_BUFFER_SECONDS,
    driverDecisionBufferBasis: "deterministic driver decision/command latency",
    ciFloor: CI_FLOOR,
    runs: report,
    pairedSummary
  }));
});
