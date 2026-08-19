import test from "node:test";
import assert from "node:assert/strict";
import { validateReport, SCENARIO } from "./validate-horizontal-agency-baseline.mjs";

const difficulties = ["easy", "normal", "hard"];
const modes = ["vertical", "lateral"];
const seeds = [101, 202, 303];

function makeRun(difficulty, seed, mode) {
  const lateral = mode === "lateral" ? 1 : 0;
  return {
    difficulty, seed, mode,
    crossings: 2 + lateral,
    collisions: 1,
    nearMisses: 3 + lateral,
    collisionPerCrossing: mode === "lateral" ? 1 / 3 : .5,
    medianWait: .4 - lateral * .1,
    p90Wait: .8 - lateral * .1,
    medianCrossingTime: 8 - lateral,
    p90CrossingTime: 10 - lateral,
    fairnessFrames: 12 - lateral * 2,
    fairnessRatio: .1 - lateral * .01,
    fairnessWindows: 1,
    crossingsDuringFairness: 0,
    crossingsRecentFairness: 1,
    recentFairnessShare: mode === "lateral" ? 1 / 3 : .5,
    spawned: 20,
    despawned: 18,
    horizontalSpeedLanes: 3.15,
    finalX: 50,
    minX: 10,
    maxX: 90
  };
}

function makeDelta(vertical, lateral) {
  const fields = ["crossings", "collisionPerCrossing", "nearMisses", "medianWait", "p90Wait",
    "medianCrossingTime", "p90CrossingTime", "fairnessFrames", "fairnessRatio", "fairnessWindows",
    "crossingsDuringFairness", "crossingsRecentFairness", "recentFairnessShare"];
  return Object.fromEntries(fields.map((field) => [field, lateral[field] - vertical[field]]));
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor((sorted.length - 1) * .5)];
}

function makeAggregate(pairs) {
  return {
    verticalCrossings: pairs.reduce((sum, pair) => sum + pair.vertical.crossings, 0),
    lateralCrossings: pairs.reduce((sum, pair) => sum + pair.lateral.crossings, 0),
    medianCollisionDelta: median(pairs.map((pair) => pair.delta.collisionPerCrossing)),
    medianWaitDelta: median(pairs.map((pair) => pair.delta.medianWait)),
    p90WaitDelta: median(pairs.map((pair) => pair.delta.p90Wait)),
    medianCrossingTimeDelta: median(pairs.map((pair) => pair.delta.medianCrossingTime)),
    p90CrossingTimeDelta: median(pairs.map((pair) => pair.delta.p90CrossingTime)),
    medianFairnessRatioDelta: median(pairs.map((pair) => pair.delta.fairnessRatio)),
    medianFairnessWindowsDelta: median(pairs.map((pair) => pair.delta.fairnessWindows)),
    medianRecentFairnessShareDelta: median(pairs.map((pair) => pair.delta.recentFairnessShare))
  };
}

function validReport() {
  const runs = [];
  for (const difficulty of difficulties) for (const seed of seeds) for (const mode of modes) runs.push(makeRun(difficulty, seed, mode));
  const pairedSummary = difficulties.map((difficulty) => {
    const pairs = seeds.map((seed) => {
      const vertical = runs.find((run) => run.difficulty === difficulty && run.seed === seed && run.mode === "vertical");
      const lateral = runs.find((run) => run.difficulty === difficulty && run.seed === seed && run.mode === "lateral");
      return { seed, vertical: structuredClone(vertical), lateral: structuredClone(lateral), delta: makeDelta(vertical, lateral) };
    });
    return { difficulty, pairs, aggregate: makeAggregate(pairs) };
  });
  return { scenario: SCENARIO, runs, pairedSummary };
}

function clone(report) { return structuredClone(report); }

test("accepts a mathematically consistent baseline", () => {
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

test("rejects pair seed drift", () => {
  const report = clone(validReport());
  report.pairedSummary[0].pairs[0].seed = 999;
  assert.throws(() => validateReport(report), /paired seeds do not match run seeds/);
});

test("rejects a tampered pair run metric even when key and type remain valid", () => {
  const report = clone(validReport());
  report.pairedSummary[0].pairs[0].vertical.medianWait += .01;
  assert.throws(() => validateReport(report), /\.vertical\.medianWait must equal derived value/);
});

test("rejects a tampered delta even when finite", () => {
  const report = clone(validReport());
  report.pairedSummary[0].pairs[0].delta.p90Wait += .01;
  assert.throws(() => validateReport(report), /\.delta\.p90Wait must equal derived value/);
});

test("rejects a tampered aggregate even when finite", () => {
  const report = clone(validReport());
  report.pairedSummary[0].aggregate.medianWaitDelta += .01;
  assert.throws(() => validateReport(report), /aggregate\.medianWaitDelta must equal derived value/);
});

test("accepts insignificant floating-point representation noise", () => {
  const report = clone(validReport());
  report.pairedSummary[0].pairs[0].delta.fairnessRatio += 1e-12;
  validateReport(report);
});
