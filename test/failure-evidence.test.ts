import assert from "node:assert/strict";
import test from "node:test";

import { buildFailureEvidence, type RunRecord } from "../src/index.js";

const baseRun: RunRecord = {
  scenario: { id: "scenario", version: "1" },
  simulator: "simulator",
  agent: "agent",
  messages: [],
  simulatorDecisions: [],
  toolEvents: [],
  stopReason: "simulator_completed",
};

test("failure evidence keeps business and harness categories separate", () => {
  const evidence = buildFailureEvidence({
    caseId: "case",
    run: {
      ...baseRun,
      stopReason: "harness_error",
      error: { source: "harness", message: "turn response timed out" },
    },
    evaluation: {
      passed: false,
      assertions: [
        {
          id: "business.expected_exchange",
          category: "business",
          passed: false,
          evidence: "no write",
        },
      ],
    },
    tracePath: "trace.zip",
  });

  assert.deepEqual(
    evidence.failures.map(({ category }) => category),
    ["business", "harness"],
  );
});
