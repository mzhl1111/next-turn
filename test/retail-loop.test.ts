import assert from "node:assert/strict";
import test from "node:test";

import {
  ControlledRetailAgent,
  FixedReplaySimulator,
  Tau2RetailTask1Simulator,
  evaluateTau2RetailTask1,
  runConversation,
  tau2RetailTask1Evaluation,
  tau2RetailTask1UserScenario,
  type ControlledRetailBehavior,
} from "../src/index.js";

async function runDynamic(behavior: ControlledRetailBehavior) {
  const run = await runConversation({
    scenario: tau2RetailTask1UserScenario,
    simulator: new Tau2RetailTask1Simulator(),
    agent: new ControlledRetailAgent(behavior),
  });
  return {
    run,
    evaluation: evaluateTau2RetailTask1(run, tau2RetailTask1Evaluation),
  };
}

test("dynamic user closes the controlled happy path", async () => {
  const { run, evaluation } = await runDynamic("correct");

  assert.equal(run.stopReason, "simulator_completed");
  assert.equal(evaluation.passed, true);
  assert.equal(run.toolEvents.at(-1)?.assistantTurn, 3);
});

test("fixed replay closes the same controlled happy path", async () => {
  const simulator = new FixedReplaySimulator([
    "I want the constrained keyboard exchange and a Google Home thermostat; if the keyboard is unavailable, exchange only the thermostat.",
    "My name is Yusuf Rossi and my ZIP is 19122. I don't remember my email.",
    "Yes, I confirm. Please exchange only the thermostat.",
  ]);
  const run = await runConversation({
    scenario: tau2RetailTask1UserScenario,
    simulator,
    agent: new ControlledRetailAgent("correct"),
  });

  assert.equal(
    evaluateTau2RetailTask1(run, tau2RetailTask1Evaluation).passed,
    true,
  );
});

test("detects a success claim without a state-changing write", async () => {
  const { evaluation } = await runDynamic("claim-without-write");

  assert.equal(evaluation.passed, false);
  assert.equal(
    evaluation.assertions.find(({ id }) => id === "business.expected_exchange")
      ?.passed,
    false,
  );
});

test("detects an exchange containing an unapproved keyboard", async () => {
  const { run, evaluation } = await runDynamic("wrong-items");

  assert.match(
    run.messages.find(({ role, turn }) => role === "user" && turn === 3)?.content ?? "",
    /do not exchange the keyboard/i,
  );
  assert.equal(evaluation.passed, false);
  assert.equal(
    evaluation.assertions.find(({ id }) => id === "business.expected_exchange")
      ?.passed,
    false,
  );
});

test("detects a write made before explicit confirmation", async () => {
  const { evaluation } = await runDynamic("write-before-confirmation");

  assert.equal(evaluation.passed, false);
  assert.equal(
    evaluation.assertions.find(
      ({ id }) => id === "process.confirmation_before_write",
    )?.passed,
    false,
  );
  assert.equal(
    evaluation.assertions.find(({ id }) => id === "business.expected_exchange")
      ?.passed,
    true,
  );
});

