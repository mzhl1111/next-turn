import assert from "node:assert/strict";
import test from "node:test";

import {
  classifyExperimentOutcome,
  summarizeWeekend3,
  type ExperimentRunSummary,
} from "../src/index.js";

function run(
  id: string,
  inputType: ExperimentRunSummary["inputType"],
  configurationId: string,
  expectedPass: boolean,
  observedPass: boolean,
): ExperimentRunSummary {
  return {
    id,
    inputType,
    configurationId,
    repetition: 1,
    expectedPass,
    observedPass,
    outcome: classifyExperimentOutcome(expectedPass, observedPass),
    simulatorViolation: false,
    durationMs: 10,
    costUsd: 0,
    evidencePath: `${id}.json`,
    tracePath: `${id}.zip`,
  };
}

test("summarizes successes separately from error detection", () => {
  const summary = summarizeWeekend3([
    run("dynamic-normal", "dynamic", "normal", true, true),
    run("fixed-order", "fixed", "question-order", true, false),
    run("dynamic-error", "dynamic", "wrong-items", false, false),
    run("fixed-error", "fixed", "wrong-items", false, true),
  ]);

  assert.equal(summary.totals.successes, 2);
  assert.equal(summary.totals.truePositives, 1);
  assert.equal(summary.totals.trueNegatives, 1);
  assert.equal(summary.totals.falsePositives, 1);
  assert.equal(summary.totals.falseNegatives, 1);
  assert.equal(summary.totals.correctPathPasses, 1);
  assert.equal(summary.totals.errorDetections, 1);
});
