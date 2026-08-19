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

function writeBaseline(report) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  fs.writeFileSync(JSON_PATH, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  const lines = [
    "### Horizontal agency baseline",
    "",
    `Seeds: ${report.runs?.filter((run) => run.mode === "vertical").map((run) => run.seed).filter((value, index, values) => values.indexOf(value) === index).join(", ") || "n/a"}`,
    "",
    "| Difficulty | Vertical crossings | Lateral crossings | Δ collision/crossing | Δ p50 wait | Δ p90 wait | Δ p50 crossing | Δ p90 crossing | Δ fairness ratio | Δ recent fairness share |",
    "|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|"
  ];

  for (const item of report.pairedSummary || []) {
    const a = item.aggregate || {};
    lines.push(`| ${item.difficulty} | ${a.verticalCrossings ?? "n/a"} | ${a.lateralCrossings ?? "n/a"} | ${format(a.medianCollisionDelta)} | ${format(a.medianWaitDelta)} | ${format(a.p90WaitDelta)} | ${format(a.medianCrossingTimeDelta)} | ${format(a.p90CrossingTimeDelta)} | ${format(a.medianFairnessRatioDelta)} | ${format(a.medianRecentFairnessShareDelta)} |`);
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
