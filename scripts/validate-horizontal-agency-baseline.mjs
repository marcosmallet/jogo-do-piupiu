import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

export const SCENARIO = "paired vertical vs lateral agency baseline";
const EXPECTED_DIFFICULTIES = ["easy", "normal", "hard"];
const EXPECTED_MODES = ["vertical", "lateral"];
const EPSILON = 1e-9;
const RUN_FINITE_FIELDS = [
  "crossings", "collisions", "nearMisses", "collisionPerCrossing",
  "medianWait", "p90Wait", "medianCrossingTime", "p90CrossingTime",
  "fairnessFrames", "fairnessRatio", "fairnessWindows", "crossingsDuringFairness",
  "crossingsRecentFairness", "recentFairnessShare", "spawned", "despawned",
  "horizontalSpeedLanes", "finalX", "minX", "maxX"
];
const RUN_NON_NEGATIVE_FIELDS = [
  "crossings", "collisions", "nearMisses", "collisionPerCrossing",
  "medianWait", "p90Wait", "medianCrossingTime", "p90CrossingTime",
  "fairnessFrames", "fairnessWindows", "crossingsDuringFairness",
  "crossingsRecentFairness", "spawned", "despawned"
];
const RUN_INTEGER_FIELDS = [
  "crossings", "collisions", "nearMisses", "fairnessFrames", "fairnessWindows",
  "crossingsDuringFairness", "crossingsRecentFairness", "spawned", "despawned"
];
const DELTA_FIELDS = [
  "crossings", "collisionPerCrossing", "nearMisses", "medianWait", "p90Wait",
  "medianCrossingTime", "p90CrossingTime", "fairnessFrames", "fairnessRatio",
  "fairnessWindows", "crossingsDuringFairness", "crossingsRecentFairness", "recentFairnessShare"
];
const AGGREGATE_FIELDS = [
  "verticalCrossings", "lateralCrossings", "medianCollisionDelta", "medianWaitDelta",
  "p90WaitDelta", "medianCrossingTimeDelta", "p90CrossingTimeDelta",
  "medianFairnessRatioDelta", "medianFairnessWindowsDelta", "medianRecentFairnessShareDelta"
];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function finiteNumber(value, label) {
  assert(typeof value === "number" && Number.isFinite(value), `${label} must be a finite number`);
}

function sameNumber(actual, expected, label) {
  finiteNumber(actual, label);
  const tolerance = EPSILON * Math.max(1, Math.abs(actual), Math.abs(expected));
  assert(Math.abs(actual - expected) <= tolerance,
    `${label} must equal derived value ${expected}; received ${actual}`);
}

function percentile(values, fraction) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * fraction))];
}

function validateRun(run, label) {
  for (const field of RUN_FINITE_FIELDS) finiteNumber(run[field], `${label}.${field}`);
  for (const field of RUN_NON_NEGATIVE_FIELDS) assert(run[field] >= 0, `${label}.${field} must be >= 0`);
  for (const field of RUN_INTEGER_FIELDS) assert(Number.isInteger(run[field]), `${label}.${field} must be an integer`);
  for (const field of ["fairnessRatio", "recentFairnessShare"]) {
    assert(run[field] >= 0 && run[field] <= 1, `${label}.${field} must be within [0, 1]`);
  }
  assert(run.p90Wait >= run.medianWait, `${label}.p90Wait must be >= medianWait`);
  assert(run.p90CrossingTime >= run.medianCrossingTime, `${label}.p90CrossingTime must be >= medianCrossingTime`);
  assert(run.minX <= run.finalX && run.finalX <= run.maxX, `${label}.finalX must be within [minX, maxX]`);
  assert(run.spawned > 0, `${label}.spawned must be > 0`);
  assert(run.despawned > 0, `${label}.despawned must be > 0`);
  assert(run.horizontalSpeedLanes > 0, `${label}.horizontalSpeedLanes must be > 0`);
}

function canonicalRunMap(runs) {
  const map = new Map();
  runs.forEach((run) => map.set(`${run.difficulty}:${run.seed}:${run.mode}`, run));
  return map;
}

function assertRunCopy(copy, canonical, label) {
  assert(copy && typeof copy === "object" && !Array.isArray(copy), `${label} must be an object`);
  for (const key of ["difficulty", "seed", "mode", ...RUN_FINITE_FIELDS]) {
    if (typeof canonical[key] === "number") sameNumber(copy[key], canonical[key], `${label}.${key}`);
    else assert(copy[key] === canonical[key], `${label}.${key} must equal canonical run value`);
  }
}

function derivedDelta(vertical, lateral) {
  return Object.fromEntries(DELTA_FIELDS.map((field) => [field, lateral[field] - vertical[field]]));
}

function derivedAggregate(pairs) {
  return {
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
  };
}

export function validateReport(report) {
  assert(report && typeof report === "object" && !Array.isArray(report), "report must be an object");
  assert(report.scenario === SCENARIO, `unexpected scenario ${JSON.stringify(report.scenario)}`);
  assert(Array.isArray(report.runs) && report.runs.length === 18,
    `expected exactly 18 runs, found ${Array.isArray(report.runs) ? report.runs.length : "non-array"}`);
  assert(Array.isArray(report.pairedSummary) && report.pairedSummary.length === 3,
    `expected exactly 3 paired summaries, found ${Array.isArray(report.pairedSummary) ? report.pairedSummary.length : "non-array"}`);

  const seeds = [...new Set(report.runs.map((run) => run.seed))];
  assert(seeds.length === 3, `expected exactly 3 seeds, found ${seeds.length}`);
  for (const [index, seed] of seeds.entries()) finiteNumber(seed, `seed[${index}]`);

  const keys = new Set();
  for (const [index, run] of report.runs.entries()) {
    const label = `runs[${index}]`;
    assert(run && typeof run === "object" && !Array.isArray(run), `${label} must be an object`);
    assert(EXPECTED_DIFFICULTIES.includes(run.difficulty), `${label}.difficulty is unexpected: ${JSON.stringify(run.difficulty)}`);
    assert(EXPECTED_MODES.includes(run.mode), `${label}.mode is unexpected: ${JSON.stringify(run.mode)}`);
    assert(seeds.includes(run.seed), `${label}.seed is unexpected: ${JSON.stringify(run.seed)}`);
    validateRun(run, label);
    const key = `${run.difficulty}:${run.seed}:${run.mode}`;
    assert(!keys.has(key), `duplicate run ${key}`);
    keys.add(key);
  }

  for (const difficulty of EXPECTED_DIFFICULTIES) {
    for (const seed of seeds) {
      for (const mode of EXPECTED_MODES) assert(keys.has(`${difficulty}:${seed}:${mode}`), `missing run ${difficulty}:${seed}:${mode}`);
    }
  }

  const runMap = canonicalRunMap(report.runs);
  const summaryDifficulties = report.pairedSummary.map((item) => item.difficulty).sort();
  assert(summaryDifficulties.join(",") === [...EXPECTED_DIFFICULTIES].sort().join(","),
    "paired summaries must cover easy, normal and hard exactly once");

  for (const item of report.pairedSummary) {
    const label = `pairedSummary.${item.difficulty}`;
    assert(item && typeof item === "object" && !Array.isArray(item), `${label} must be an object`);
    assert(Array.isArray(item.pairs) && item.pairs.length === 3, `${label}: expected 3 paired seeds`);
    const pairSeeds = item.pairs.map((pair) => pair.seed).sort((a, b) => a - b);
    const expectedSeeds = [...seeds].sort((a, b) => a - b);
    assert(!pairSeeds.some((seed, index) => seed !== expectedSeeds[index]), `${label}: paired seeds do not match run seeds`);

    const canonicalPairs = [];
    for (const pair of item.pairs) {
      const pairLabel = `${label}.pairs[seed=${pair.seed}]`;
      const vertical = runMap.get(`${item.difficulty}:${pair.seed}:vertical`);
      const lateral = runMap.get(`${item.difficulty}:${pair.seed}:lateral`);
      assert(vertical && lateral, `${pairLabel} does not map to both run modes`);
      assertRunCopy(pair.vertical, vertical, `${pairLabel}.vertical`);
      assertRunCopy(pair.lateral, lateral, `${pairLabel}.lateral`);
      assert(pair.delta && typeof pair.delta === "object" && !Array.isArray(pair.delta), `${pairLabel}.delta is missing`);
      const delta = derivedDelta(vertical, lateral);
      for (const field of DELTA_FIELDS) sameNumber(pair.delta[field], delta[field], `${pairLabel}.delta.${field}`);
      canonicalPairs.push({ vertical, lateral, delta });
    }

    assert(item.aggregate && typeof item.aggregate === "object" && !Array.isArray(item.aggregate), `${label}.aggregate is missing`);
    const aggregate = derivedAggregate(canonicalPairs);
    for (const field of AGGREGATE_FIELDS) sameNumber(item.aggregate[field], aggregate[field], `${label}.aggregate.${field}`);
    assert(Number.isInteger(item.aggregate.verticalCrossings) && item.aggregate.verticalCrossings >= 0,
      `${label}.aggregate.verticalCrossings must be a non-negative integer`);
    assert(Number.isInteger(item.aggregate.lateralCrossings) && item.aggregate.lateralCrossings >= 0,
      `${label}.aggregate.lateralCrossings must be a non-negative integer`);
  }

  return { runs: report.runs.length, summaries: report.pairedSummary.length, seeds };
}

function readNonEmpty(filePath, label) {
  if (!fs.existsSync(filePath)) throw new Error(`${label} is missing: ${path.relative(process.cwd(), filePath)}`);
  const stat = fs.statSync(filePath);
  if (!stat.isFile() || stat.size === 0) throw new Error(`${label} is empty: ${path.relative(process.cwd(), filePath)}`);
  return fs.readFileSync(filePath, "utf8");
}

export function validateArtifacts(baseDir = path.resolve("test-results")) {
  const jsonPath = path.join(baseDir, "horizontal-agency-baseline.json");
  const summaryPath = path.join(baseDir, "horizontal-agency-summary.md");
  const rawJson = readNonEmpty(jsonPath, "JSON artifact");
  const summary = readNonEmpty(summaryPath, "Markdown summary");
  let report;
  try {
    report = JSON.parse(rawJson);
  } catch (error) {
    throw new Error(`JSON artifact is invalid: ${error.message}`);
  }
  const result = validateReport(report);
  assert(summary.includes(SCENARIO), `Markdown summary does not identify scenario ${JSON.stringify(SCENARIO)}`);
  return result;
}

function runCli() {
  try {
    const baseDir = process.argv[2] ? path.resolve(process.argv[2]) : path.resolve("test-results");
    const result = validateArtifacts(baseDir);
    console.log(`Horizontal agency baseline artifact OK: ${result.runs} runs, ${result.summaries} difficulty summaries, scenario "${SCENARIO}".`);
  } catch (error) {
    console.error(`Horizontal agency baseline validation failed: ${error.message}`);
    process.exitCode = 1;
  }
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : "";
if (import.meta.url === invokedPath) runCli();
