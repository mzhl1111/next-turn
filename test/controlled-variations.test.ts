import assert from "node:assert/strict";
import test from "node:test";

import {
  ControlledRetailAgent,
  Tau2RetailTask1Simulator,
  evaluateTau2RetailTask1,
  runConversation,
  tau2RetailTask1Evaluation,
  tau2RetailTask1UserScenario,
  type ControlledRetailBehavior,
} from "../src/index.js";

for (const behavior of [
  "correct-question-order",
  "correct-split-questions",
] satisfies ControlledRetailBehavior[]) {
  test(`dynamic user passes ${behavior}`, async () => {
    const run = await runConversation({
      scenario: tau2RetailTask1UserScenario,
      simulator: new Tau2RetailTask1Simulator(),
      agent: new ControlledRetailAgent(behavior),
    });

    assert.equal(run.stopReason, "simulator_completed");
    assert.equal(
      evaluateTau2RetailTask1(run, tau2RetailTask1Evaluation).passed,
      true,
    );
    assert.equal(run.messages.filter(({ role }) => role === "user").length, 4);
  });
}
