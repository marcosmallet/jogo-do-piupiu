import { test, expect } from "@playwright/test";

test.describe.configure({ mode: "serial" });
test.setTimeout(60_000);

const DRIVER_DECISION_BUFFER_SECONDS = 0.18;
const RECENT_FAIRNESS_WINDOW_SECONDS = 4.5;
const MODES = ["vertical", "lateral"];
const DIFFICULTIES = ["easy", "normal", "hard"];
const SEEDS = [0xC0FFEE, 0x51A7E, 0xB17D];

function percentile(values, fraction) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * fraction))];
}

test("paired vertical/lateral drivers publish a deterministic agency baseline", async ({ page }) => {
  await page.goto("/?debug=1&duration=40");
  await page.waitForFunction(() => Boolean(
    window.travessiaGame && window.__gameTest && window.__aaaTest && window.__horizontalControlsTest
  ));

  const report = await page.evaluate(({ modes, difficulties, seeds, decisionBuffer, recentFairnessWindow }) => {
    const game = window.travessiaGame;
    const originalRandom = Math.random;

    function seededRandom(seed) {
      let value = seed >>> 0;
      return () => {
        value = (Math.imul(value, 1664525) + 1013904223) >>> 0;
        return value / 0x100000000;
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

    function timeToX(lane, vehicle, targetX) {
      const playerHalf = game.player.width * .4;
      const vehicleHalf = vehicle.width * .46;
      const left = targetX - playerHalf;
      const right = targetX + playerHalf;
      const vehicleLeft = vehicle.x - vehicleHalf;
      const vehicleRight = vehicle.x + vehicleHalf;
      if (vehicleRight >= left && vehicleLeft <= right) return 0;
      const speed = vehicle.fairnessHold ? 0 : Math.max(0, vehicle.speed);
      if (!speed) return Infinity;
      if (lane.direction > 0) {
        if (vehicleLeft > right) return Infinity;
        return Math.max(0, (left - vehicleRight) / speed);
      }
      if (vehicleRight < left) return Infinity;
      return Math.max(0, (vehicleLeft - right) / speed);
    }

    function safetyAt(lane, targetX, crossingDuration) {
      let earliest = Infinity;
      for (const vehicle of lane.vehicles) earliest = Math.min(earliest, timeToX(lane, vehicle, targetX));
      return earliest - crossingDuration;
    }

    function lateralTargets() {
      const min = window.__horizontalControlsTest.minX;
      const max = window.__horizontalControlsTest.maxX;
      const span = max - min;
      return [0, .25, .5, .75, 1].map((ratio) => min + span * ratio);
    }

    function run(difficulty, seed, mode) {
      Math.random = seededRandom(seed);
      game.resetGame(true);
      game.setDifficulty(difficulty);
      game.resetGame(true);
      game.audio.enabled = false;
      game.performance.low = false;
      game.startGame();
      game.input.clear();

      const crossingDuration = game.lanes[0].minimumOpenTime(game.difficultySettings)
        - game.difficultySettings.reactionTime;
      const dt = 1 / 60;
      const maxSteps = Math.ceil(38 / dt);
      const waits = [];
      const crossingTimes = [];
      let simTime = 0;
      let previousScore = 0;
      let runStartedAt = 0;
      let currentTargetLane = null;
      let waitStartedAt = 0;
      let committedLane = null;
      let desiredX = game.player.x;
      let spawned = 0;
      let despawned = 0;
      let previousVehicles = new Set(game.lanes.flatMap((lane) => lane.vehicles));
      let fairnessFrames = 0;
      let fairnessWindows = 0;
      let fairnessWasActive = game.fairnessActive;
      let lastFairnessAt = fairnessWasActive ? 0 : -Infinity;
      let crossingsDuringFairness = 0;
      let crossingsRecentFairness = 0;
      let stepsRun = 0;

      for (let step = 0; step < maxSteps && game.state !== "gameOver"; step++) {
        stepsRun += 1;
        simTime += dt;
        if (game.fairnessActive) {
          fairnessFrames += 1;
          lastFairnessAt = simTime;
          if (!fairnessWasActive) fairnessWindows += 1;
        }
        fairnessWasActive = game.fairnessActive;

        if (game.state === "playing") {
          const lane = targetLane();
          if (committedLane == null && lane) {
            if (currentTargetLane !== lane.index) {
              currentTargetLane = lane.index;
              waitStartedAt = simTime;
            }

            if (mode === "lateral") {
              const options = lateralTargets().map((x) => ({ x, margin: safetyAt(lane, x, crossingDuration) }));
              options.sort((a, b) => b.margin - a.margin || Math.abs(a.x - game.player.x) - Math.abs(b.x - game.player.x));
              desiredX = options[0].x;
            } else {
              desiredX = game.world.width / 2;
            }

            const horizontalError = desiredX - game.player.x;
            const positionTolerance = game.world.laneH * .16;
            game.input.left = mode === "lateral" && horizontalError < -positionTolerance;
            game.input.right = mode === "lateral" && horizontalError > positionTolerance;

            const margin = safetyAt(lane, game.player.x, crossingDuration);
            const aligned = mode === "vertical" || Math.abs(horizontalError) <= game.world.laneH * .42;
            if (aligned && margin >= decisionBuffer) {
              waits.push(Math.max(0, simTime - waitStartedAt));
              committedLane = lane.index;
            }
          }

          if (committedLane != null) {
            const lane = game.lanes[committedLane];
            game.input.up = true;
            if (game.player.y < lane.y(game.world) - game.world.laneH * .56) {
              committedLane = null;
              currentTargetLane = null;
            }
          } else {
            game.input.up = !lane && game.player.y > game.world.topGoal;
          }
        } else {
          game.input.up = false;
          game.input.left = false;
          game.input.right = false;
        }

        game.update(dt);
        if (game.fairnessActive) {
          fairnessFrames += 1;
          lastFairnessAt = simTime;
          if (!fairnessWasActive) fairnessWindows += 1;
        }
        fairnessWasActive = game.fairnessActive;

        if (game.score > previousScore) {
          const gained = game.score - previousScore;
          for (let score = previousScore; score < game.score; score += 1) crossingTimes.push(simTime - runStartedAt);
          if (game.fairnessActive) crossingsDuringFairness += gained;
          if (simTime - lastFairnessAt <= recentFairnessWindow) crossingsRecentFairness += gained;
          runStartedAt = simTime;
          previousScore = game.score;
          committedLane = null;
          currentTargetLane = null;
          desiredX = game.world.width / 2;
        }

        const vehicles = new Set(game.lanes.flatMap((lane) => lane.vehicles));
        for (const vehicle of vehicles) if (!previousVehicles.has(vehicle)) spawned += 1;
        for (const vehicle of previousVehicles) if (!vehicles.has(vehicle)) despawned += 1;
        previousVehicles = vehicles;
      }

      game.input.clear();
      const premium = window.__aaaTest.snapshot();
      const sortedWaits = [...waits].sort((a, b) => a - b);
      const sortedCrossings = [...crossingTimes].sort((a, b) => a - b);
      const pick = (values, fraction) => values.length
        ? values[Math.min(values.length - 1, Math.floor((values.length - 1) * fraction))]
        : 0;
      const observedFrames = Math.max(1, stepsRun * 2);
      return {
        difficulty,
        seed,
        mode,
        crossings: game.score,
        collisions: premium.collisions,
        nearMisses: premium.nearMisses,
        collisionPerCrossing: game.score ? premium.collisions / game.score : premium.collisions,
        medianWait: pick(sortedWaits, .5),
        p90Wait: pick(sortedWaits, .9),
        medianCrossingTime: pick(sortedCrossings, .5),
        p90CrossingTime: pick(sortedCrossings, .9),
        fairnessFrames,
        fairnessRatio: fairnessFrames / observedFrames,
        fairnessWindows,
        crossingsDuringFairness,
        crossingsRecentFairness,
        recentFairnessShare: game.score ? crossingsRecentFairness / game.score : 0,
        spawned,
        despawned,
        horizontalSpeedLanes: window.__horizontalControlsTest.speedLanes,
        finalX: game.player.x,
        minX: window.__horizontalControlsTest.minX,
        maxX: window.__horizontalControlsTest.maxX
      };
    }

    try {
      const runs = [];
      for (const difficulty of difficulties) {
        for (const seed of seeds) {
          for (const mode of modes) runs.push(run(difficulty, seed, mode));
        }
      }
      return runs;
    } finally {
      Math.random = originalRandom;
      game.input.clear();
    }
  }, {
    modes: MODES,
    difficulties: DIFFICULTIES,
    seeds: SEEDS,
    decisionBuffer: DRIVER_DECISION_BUFFER_SECONDS,
    recentFairnessWindow: RECENT_FAIRNESS_WINDOW_SECONDS
  });

  for (const run of report) {
    expect(run.spawned, `${run.difficulty}/${run.seed}/${run.mode}: traffic spawns`).toBeGreaterThan(0);
    expect(run.despawned, `${run.difficulty}/${run.seed}/${run.mode}: traffic despawns`).toBeGreaterThan(0);
    expect(run.finalX, `${run.difficulty}/${run.seed}/${run.mode}: left bound`).toBeGreaterThanOrEqual(run.minX - .01);
    expect(run.finalX, `${run.difficulty}/${run.seed}/${run.mode}: right bound`).toBeLessThanOrEqual(run.maxX + .01);
    expect(run.horizontalSpeedLanes, "named lateral speed contract").toBeGreaterThan(0);
    expect(run.fairnessRatio, `${run.difficulty}/${run.seed}/${run.mode}: fairness ratio lower bound`).toBeGreaterThanOrEqual(0);
    expect(run.fairnessRatio, `${run.difficulty}/${run.seed}/${run.mode}: fairness ratio upper bound`).toBeLessThanOrEqual(1);
  }

  const pairedSummary = DIFFICULTIES.map((difficulty) => {
    const pairs = SEEDS.map((seed) => {
      const vertical = report.find((run) => run.difficulty === difficulty && run.seed === seed && run.mode === "vertical");
      const lateral = report.find((run) => run.difficulty === difficulty && run.seed === seed && run.mode === "lateral");
      expect(vertical).toBeTruthy();
      expect(lateral).toBeTruthy();
      return {
        seed,
        vertical,
        lateral,
        delta: {
          crossings: lateral.crossings - vertical.crossings,
          collisionPerCrossing: lateral.collisionPerCrossing - vertical.collisionPerCrossing,
          nearMisses: lateral.nearMisses - vertical.nearMisses,
          medianWait: lateral.medianWait - vertical.medianWait,
          p90Wait: lateral.p90Wait - vertical.p90Wait,
          medianCrossingTime: lateral.medianCrossingTime - vertical.medianCrossingTime,
          p90CrossingTime: lateral.p90CrossingTime - vertical.p90CrossingTime,
          fairnessFrames: lateral.fairnessFrames - vertical.fairnessFrames,
          fairnessRatio: lateral.fairnessRatio - vertical.fairnessRatio,
          fairnessWindows: lateral.fairnessWindows - vertical.fairnessWindows,
          crossingsDuringFairness: lateral.crossingsDuringFairness - vertical.crossingsDuringFairness,
          crossingsRecentFairness: lateral.crossingsRecentFairness - vertical.crossingsRecentFairness,
          recentFairnessShare: lateral.recentFairnessShare - vertical.recentFairnessShare
        }
      };
    });
    return {
      difficulty,
      pairs,
      aggregate: {
        verticalCrossings: pairs.reduce((sum, pair) => sum + pair.vertical.crossings, 0),
        lateralCrossings: pairs.reduce((sum, pair) => sum + pair.lateral.crossings, 0),
        medianCollisionDelta: percentile(pairs.map((pair) => pair.delta.collisionPerCrossing), .5),
        medianWaitDelta: percentile(pairs.map((pair) => pair.delta.medianWait), .5),
        p90WaitDelta: percentile(pairs.map((pair) => pair.delta.p90Wait), .5),
        medianCrossingTimeDelta: percentile(pairs.map((pair) => pair.delta.medianCrossingTime), .5),
        p90CrossingTimeDelta: percentile(pairs.map((pair) => pair.delta.p90CrossingTime), .5),
        medianFairnessRatioDelta: percentile(pairs.map((pair) => pair.delta.fairnessRatio), .5),
        medianFairnessWindowsDelta: percentile(pairs.map((pair) => pair.delta.fairnessWindows), .5),
        medianRecentFairnessShareDelta: percentile(pairs.map((pair) => pair.delta.recentFairnessShare), .5)
      }
    };
  });

  // Observational baseline only: do not invent balance thresholds before this report
  // is observed in CI/local runs on the same deterministic seeds.
  console.log(JSON.stringify({
    scenario: "paired vertical vs lateral agency baseline",
    decisionBufferSeconds: DRIVER_DECISION_BUFFER_SECONDS,
    recentFairnessWindowSeconds: RECENT_FAIRNESS_WINDOW_SECONDS,
    runs: report,
    pairedSummary
  }));
});
