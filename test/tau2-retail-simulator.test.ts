import assert from "node:assert/strict";
import test from "node:test";

import {
  Tau2RetailTask1Simulator,
  tau2RetailTask1Evaluation,
  tau2RetailTask1UserScenario,
  type VisibleMessage,
} from "../src/index.js";

const simulator = new Tau2RetailTask1Simulator();

async function replyTo(content: string) {
  const messages: VisibleMessage[] = [
    { id: "assistant-1", role: "assistant", content, turn: 1 },
  ];
  return simulator.next({
    scenario: tau2RetailTask1UserScenario,
    messages,
    userTurn: 2,
  });
}

test("answers combined identity questions without inventing email", async () => {
  const decision = await replyTo(
    "What is your full name, ZIP code, and email address?",
  );

  assert.equal(decision.kind, "message");
  if (decision.kind !== "message") return;
  assert.match(decision.content, /Yusuf Rossi/);
  assert.match(decision.content, /19122/);
  assert.match(decision.content, /don't remember my email/i);
});

test("rejects a keyboard exchange that has not satisfied every constraint", async () => {
  const decision = await replyTo(
    "I found a compact keyboard with clicky switches. Shall I proceed with both exchanges?",
  );

  assert.equal(decision.kind, "message");
  if (decision.kind !== "message") return;
  assert.match(decision.content, /do not exchange the keyboard/i);
  assert.match(decision.content, /clicky, RGB, and full size/i);
});

test("confirms a thermostat-only exchange", async () => {
  const decision = await replyTo(
    "No keyboard meets every requirement. Shall I proceed with only the thermostat?",
  );

  assert.equal(decision.kind, "message");
  if (decision.kind !== "message") return;
  assert.match(decision.content, /Yes, I confirm/);
  assert.match(decision.content, /leave the keyboard unchanged/);
});

test("keeps hidden evaluator IDs out of simulator-visible scenario", () => {
  const visible = JSON.stringify(tau2RetailTask1UserScenario);
  const hidden = tau2RetailTask1Evaluation.expectedExchange;

  for (const id of [...hidden.itemIds, ...hidden.newItemIds]) {
    assert.equal(visible.includes(id), false);
  }
  assert.equal(visible.includes(hidden.paymentMethodId), false);
});

