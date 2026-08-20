import fs from "node:fs";
import path from "node:path";

const SCENARIO = "paired vertical vs lateral agency baseline";
const OUTPUT_DIR = path.resolve("test-results");
const JSON_PATH = path.join(OUTPUT_DIR, "horizontal-agency-baseline.json");
const SUMMARY_PATH = path.join(OUTPUT_DIR, "horizontal-agency-summary.md");

function format(value, digits = 3) {
  if (!Number.isFinite(value)) return String(value ?? "n/a");
  return Number(value).toFixed(digits);
}

function formatSeed(seed) {
  if (!Number.isInteger(seed)) return String(seed ?? "n/a");
  return `${seed} (0x${seed.toString(16).toUpperCase()})`;
}

function writeBaseline(report) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  fs.writeFileSync(JSON_PATH, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  const verticalRuns = report.runs?.filter((run) => run.mode === "vertical") || [];
  const seeds = verticalRuns
    .map((run) => run.seed)
    .filter((value, index, values) => values.indexOf(value) === index);

  const lines = [
    "### Horizontal agency baseline",
    "",
    `Scenario: \`${SCENARIO}\``,
    `Seeds: ${seeds.map(formatSeed).join(", ") || "n/a"}`,
    "",
    "#### Aggregate by difficulty",
    "",
    "| Difficulty | Vertical crossings | Lateral crossings | Δ collision/crossing | Δ p50 wait | Δ p90 wait | Δ p50 crossing | Δ p90 crossing | Δ fairness ratio | Δ recent fairness share |",
    "|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|"
  ];

  for (const item of report.pairedSummary || []) {
    const a = item.aggregate || {};
    lines.push(`| ${item.difficulty} | ${a.verticalCrossings ?? "n/a"} | ${a.lateralCrossings ?? "n/a"} | ${format(a.medianCollisionDelta)} | ${format(a.medianWaitDelta)} | ${format(a.p90WaitDelta)} | ${format(a.medianCrossingTimeDelta)} | ${format(a.p90CrossingTimeDelta)} | ${format(a.medianFairnessRatioDelta)} | ${format(a.medianRecentFairnessShareDelta)} |`);
  }

  lines.push(
    "",
    "#### Per-seed runs",
    "",
    "| Difficulty | Seed | Mode | Crossings | Collision/crossing | Near-misses | p50 wait | p90 wait | p50 crossing | p90 crossing | Fairness ratio | Fairness windows | Crossings during fairness | Crossings recent fairness | Recent fairness share |",
    "|---|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|"
  );

  for (const item of report.pairedSummary || []) {
    for (const pair of item.pairs || []) {
      for (const run of [pair.vertical, pair.lateral]) {
        if (!run) continue;
        lines.push(`| ${item.difficulty} | ${formatSeed(pair.seed)} | ${run.mode} | ${run.crossings ?? "n/a"} | ${format(run.collisionPerCrossing)} | ${run.nearMisses ?? "n/a"} | ${format(run.medianWait)} | ${format(run.p90Wait)} | ${format(run.medianCrossingTime)} | ${format(run.p90CrossingTime)} | ${format(run.fairnessRatio)} | ${run.fairnessWindows ?? "n/a"} | ${run.crossingsDuringFairness ?? "n/a"} | ${run.crossingsRecentFairness ?? "n/a"} | ${format(run.recentFairnessShare)} |`);
      }
    }
  }

  lines.push(
    "",
    "#### Per-seed lateral − vertical deltas",
    "",
    "| Difficulty | Seed | Δ crossings | Δ collision/crossing | Δ near-misses | Δ p50 wait | Δ p90 wait | Δ p50 crossing | Δ p90 crossing | Δ fairness ratio | Δ fairness windows | Δ crossings during fairness | Δ crossings recent fairness | Δ recent fairness share |",
    "|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|"
  );

  for (const item of report.pairedSummary || []) {
    for (const pair of item.pairs || []) {
      const d = pair.delta || {};
      lines.push(`| ${item.difficulty} | ${formatSeed(pair.seed)} | ${format(d.crossings)} | ${format(d.collisionPerCrossing)} | ${format(d.nearMisses)} | ${format(d.medianWait)} | ${format(d.p90Wait)} | ${format(d.medianCrossingTime)} | ${format(d.p90CrossingTime)} | ${format(d.fairnessRatio)} | ${format(d.fairnessWindows)} | ${format(d.crossingsDuringFairness)} | ${format(d.crossingsRecentFairness)} | ${format(d.recentFairnessShare)} |`);
    }
  }

  lines.push("", `Machine-readable artifact: \`${path.relative(process.cwd(), JSON_PATH)}\``);
  fs.writeFileSync(SUMMARY_PATH, `${lines.join("\n")}\n`, "utf8");
}

export default class HorizontalAgencyReporter {
  constructor() {
    this.buffer = "";
    this.written = false;
  }

  onStdOut(chunk) {
    if (this.written) return;
    this.buffer += Buffer.isBuffer(chunk) ? chunk.toString("utf8") : String(chunk);
    const lines = this.buffer.split(/\r?\n/);
    this.buffer = lines.pop() || "";
    for (const line of lines) this.#capture(line);
  }

  onEnd() {
    if (!this.written && this.buffer) this.#capture(this.buffer);
  }

  #capture(line) {
    const start = line.indexOf("{\"scenario\":");
    if (start < 0) return;
    try {
      const parsed = JSON.parse(line.slice(start));
      if (parsed.scenario !== SCENARIO) return;
      writeBaseline(parsed);
      this.written = true;
    } catch {
      // Ignore unrelated or partial stdout chunks; a complete JSON line is expected later.
    }
  }
}
