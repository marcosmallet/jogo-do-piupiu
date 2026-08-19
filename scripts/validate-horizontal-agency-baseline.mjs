import fs from "node:fs";
import path from "node:path";

const SCENARIO = "paired vertical vs lateral agency baseline";
const EXPECTED_DIFFICULTIES = ["easy", "normal", "hard"];
const EXPECTED_MODES = ["vertical", "lateral"];
const baseDir = process.argv[2] ? path.resolve(process.argv[2]) : path.resolve("test-results");
const jsonPath = path.join(baseDir, "horizontal-agency-baseline.json");
const summaryPath = path.join(baseDir, "horizontal-agency-summary.md");

function fail(message) {
  console.error(`Horizontal agency baseline validation failed: ${message}`);
  process.exit(1);
}

function readNonEmpty(filePath, label) {
  if (!fs.existsSync(filePath)) fail(`${label} is missing: ${path.relative(process.cwd(), filePath)}`);
  const stat = fs.statSync(filePath);
  if (!stat.isFile() || stat.size === 0) fail(`${label} is empty: ${path.relative(process.cwd(), filePath)}`);
  return fs.readFileSync(filePath, "utf8");
}

const rawJson = readNonEmpty(jsonPath, "JSON artifact");
const summary = readNonEmpty(summaryPath, "Markdown summary");

let report;
try {
  report = JSON.parse(rawJson);
} catch (error) {
  fail(`JSON artifact is invalid: ${error.message}`);
}

if (report.scenario !== SCENARIO) fail(`unexpected scenario ${JSON.stringify(report.scenario)}`);
if (!Array.isArray(report.runs) || report.runs.length !== 18) {
  fail(`expected exactly 18 runs, found ${Array.isArray(report.runs) ? report.runs.length : "non-array"}`);
}
if (!Array.isArray(report.pairedSummary) || report.pairedSummary.length !== 3) {
  fail(`expected exactly 3 paired summaries, found ${Array.isArray(report.pairedSummary) ? report.pairedSummary.length : "non-array"}`);
}

const seeds = [...new Set(report.runs.map((run) => run.seed))];
if (seeds.length !== 3) fail(`expected exactly 3 seeds, found ${seeds.length}`);

const keys = new Set();
for (const run of report.runs) {
  if (!EXPECTED_DIFFICULTIES.includes(run.difficulty)) fail(`unexpected difficulty ${JSON.stringify(run.difficulty)}`);
  if (!EXPECTED_MODES.includes(run.mode)) fail(`unexpected mode ${JSON.stringify(run.mode)}`);
  if (!seeds.includes(run.seed)) fail(`unexpected seed ${JSON.stringify(run.seed)}`);
  const key = `${run.difficulty}:${run.seed}:${run.mode}`;
  if (keys.has(key)) fail(`duplicate run ${key}`);
  keys.add(key);
}

for (const difficulty of EXPECTED_DIFFICULTIES) {
  for (const seed of seeds) {
    for (const mode of EXPECTED_MODES) {
      const key = `${difficulty}:${seed}:${mode}`;
      if (!keys.has(key)) fail(`missing run ${key}`);
    }
  }
}

const summaryDifficulties = report.pairedSummary.map((item) => item.difficulty).sort();
if (summaryDifficulties.join(",") !== [...EXPECTED_DIFFICULTIES].sort().join(",")) {
  fail("paired summaries must cover easy, normal and hard exactly once");
}

for (const item of report.pairedSummary) {
  if (!Array.isArray(item.pairs) || item.pairs.length !== 3) fail(`${item.difficulty}: expected 3 paired seeds`);
  const pairSeeds = item.pairs.map((pair) => pair.seed).sort((a, b) => a - b);
  const expectedSeeds = [...seeds].sort((a, b) => a - b);
  if (pairSeeds.some((seed, index) => seed !== expectedSeeds[index])) fail(`${item.difficulty}: paired seeds do not match run seeds`);
  if (!item.aggregate || typeof item.aggregate !== "object") fail(`${item.difficulty}: aggregate is missing`);
}

if (!summary.includes(SCENARIO)) fail(`Markdown summary does not identify scenario ${JSON.stringify(SCENARIO)}`);

console.log(`Horizontal agency baseline artifact OK: ${report.runs.length} runs, ${report.pairedSummary.length} difficulty summaries, scenario "${SCENARIO}".`);
