import test from "node:test";
import assert from "node:assert/strict";
import { validateReport, SCENARIO } from "./validate-horizontal-agency-baseline.mjs";

const difficulties = ["easy", "normal", "hard"];
const modes = ["vertical", "lateral"];
const seeds = [101, 202, 303];

function makeRun(difficulty, seed, mode) {
  return {
    difficulty,
    seed,
    mode,
    crossings: 2,
    collisions: 1,
    nearMisses: 3,
    collisionPerCrossing: .5,
    medianWait: .4,
    p90Wait: .8,
    medianCrossingTime: 8,
    p90CrossingTime: 10,
    fairnessFrames: 12,
    fairnessRatio: .1,
    fairnessWindows: 1,
    crossingsDuringFairness: 0,
    crossingsRecentFairness: 1,
    recentFairnessShare: .5,
    spawned: 20,
    despawned: 18,
    horizontalSpeedLanes: 3.15,
    finalX: 50,
    minX: 10,
    maxX: 90
  };
}

function makeDelta(vertical, lateral) {
  return {
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
  };
}

function validReport() {
  const runs = [];
  for (const difficulty of difficulties) {
    for (const seed of seeds) {
      for (const mode of modes) runs.push(makeRun(difficulty, seed, mode));
    }
  }
  const pairedSummary = difficulties.map((difficulty) => {
    const pairs = seeds.map((seed) => {
      const vertical = runs.find((run) => run.difficulty === difficulty && run.seed === seed && run.mode === "vertical");
      const lateral = runs.find((run) => run.difficulty === difficulty && run.seed === seed && run.mode === "lateral");
      return { seed, vertical, lateral, delta: makeDelta(vertical, lateral) };
    });
    return {
      difficulty,
      pairs,
      aggregate: {
        verticalCrossings: 6,
        lateralCrossings: 6,
        medianCollisionDelta: 0,
        medianWaitDelta: 0,
        p90WaitDelta: 0,
        medianCrossingTimeDelta: 0,
        p90CrossingTimeDelta: 0,
        medianFairnessRatioDelta: 0,
        medianFairnessWindowsDelta: 0,
        medianRecentFairnessShareDelta: 0
      }
    };
  });
  return { scenario: SCENARIO, runs, pairedSummary };
}

function clone(report) {
  return structuredClone(report);
}

test("accepts a semantically complete baseline", () => {
  const result = validateReport(validReport());
  assert.equal(result.runs, 18);
  assert.equal(result.summaries, 3);
});

test("rejects a missing metric with a clear field path", () => {
  const report = clone(validReport());
  delete report.runs[0].medianWait;
  assert.throws(() => validateReport(report), /runs\[0\]\.medianWait must be a finite number/);
});

test("rejects null, including the JSON representation produced from NaN", () => {
  const report = clone(validReport());
  report.runs[0].p90Wait = null;
  assert.throws(() => validateReport(report), /runs\[0\]\.p90Wait must be a finite number/);
});

test("rejects numeric strings", () => {
  const report = clone(validReport());
  report.runs[0].crossings = "2";
  assert.throws(() => validateReport(report), /runs\[0\]\.crossings must be a finite number/);
});

test("rejects ratios outside [0, 1]", () => {
  const report = clone(validReport());
  report.runs[0].fairnessRatio = 1.01;
  assert.throws(() => validateReport(report), /fairnessRatio must be within \[0, 1\]/);
});

test("rejects p90 lower than the corresponding median", () => {
  const report = clone(validReport());
  report.runs[0].p90CrossingTime = 7;
  assert.throws(() => validateReport(report), /p90CrossingTime must be >= medianCrossingTime/);
});

test("rejects finalX outside lateral bounds", () => {
  const report = clone(validReport());
  report.runs[0].finalX = 100;
  assert.throws(() => validateReport(report), /finalX must be within \[minX, maxX\]/);
});

test("rejects missing aggregate deltas", () => {
  const report = clone(validReport());
  delete report.pairedSummary[0].aggregate.medianWaitDelta;
  assert.throws(() => validateReport(report), /aggregate\.medianWaitDelta must be a finite number/);
});

test("rejects pair seed drift", () => {
  const report = clone(validReport());
  report.pairedSummary[0].pairs[0].seed = 999;
  assert.throws(() => validateReport(report), /paired seeds do not match run seeds/);
});
