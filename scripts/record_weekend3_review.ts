import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import type { ExperimentRunSummary } from "../src/index.js";

const projectDir = path.resolve(import.meta.dirname, "..");
const outputDir = path.resolve(
  projectDir,
  process.env.WEEKEND3_OUTPUT_DIR ?? "artifacts/weekend3",
);

interface QueueItem {
  readonly id: string;
  readonly outcome: string;
  readonly evidencePath: string;
  readonly tracePath: string;
  readonly reviewStatus: string;
}

const reviewNotes: Readonly<Record<string, string>> = {
  "fixed:question-order":
    "Confirmed false negative: fixed replay exhausted its confirmation before the reordered agent requested it, so no exchange write followed the final proposal.",
  "fixed:split-questions":
    "Confirmed false negative: fixed replay could not adapt its three messages to split identity questions and stopped before the final confirmation write.",
  "fixed:wrong-items":
    "Confirmed true negative: the evaluator rejected the exchange containing the unauthorized keyboard.",
  "fixed:claim-without-write":
    "Confirmed true negative: the visible success claim had no exchange write.",
  "fixed:write-before-confirmation":
    "Confirmed true negative: the trace contains a pre-confirmation write and a duplicate exchange write.",
  "dynamic:wrong-items":
    "Confirmed true negative: the dynamic user rejected the keyboard, but the agent submitted both items; business and sequencing checks failed.",
  "dynamic:claim-without-write":
    "Confirmed true negative: the visible success claim had no exchange write.",
  "dynamic:write-before-confirmation":
    "Confirmed true negative: the exchange write occurred before the dynamic user explicitly confirmed the final scope.",
};

async function main(): Promise<void> {
  const results = JSON.parse(
    await readFile(path.join(outputDir, "results.json"), "utf8"),
  ) as { runs: ExperimentRunSummary[] };
  const queue = JSON.parse(
    await readFile(path.join(outputDir, "review-queue.json"), "utf8"),
  ) as QueueItem[];
  const runsById = new Map(results.runs.map((run) => [run.id, run]));
  const reviewedAt = new Date().toISOString();
  const reviewed = queue.map((item) => {
    const run = runsById.get(item.id);
    if (!run) throw new Error(`missing run ${item.id}`);
    const key = `${run.inputType}:${run.configurationId}`;
    const note = reviewNotes[key];
    if (!note) throw new Error(`no manual review note for ${key}`);
    return { ...item, reviewStatus: "reviewed", reviewedAt, note };
  });
  const groups = Object.entries(reviewNotes).map(([signature, note]) => ({
    signature,
    count: reviewed.filter((item) => {
      const run = runsById.get(item.id);
      return run && `${run.inputType}:${run.configurationId}` === signature;
    }).length,
    note,
  }));
  const summary = {
    reviewedAt,
    reviewedRuns: reviewed.length,
    pendingRuns: reviewed.filter(({ reviewStatus }) => reviewStatus !== "reviewed")
      .length,
    simulatorViolations: results.runs.filter(({ simulatorViolation }) => simulatorViolation)
      .length,
    groups,
  };
  await Promise.all([
    writeFile(
      path.join(outputDir, "review-queue.json"),
      `${JSON.stringify(reviewed, null, 2)}\n`,
    ),
    writeFile(
      path.join(outputDir, "review-summary.json"),
      `${JSON.stringify(summary, null, 2)}\n`,
    ),
  ]);
  process.stdout.write(`Recorded manual review for ${reviewed.length} runs.\n`);
}

await main();
