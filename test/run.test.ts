import assert from "node:assert/strict";
import test from "node:test";

import {
  FixedReplaySimulator,
  runConversation,
  type TargetAgent,
  type UserScenario,
  type UserSimulator,
} from "../src/index.js";

const scenario: UserScenario = {
  id: "test-scenario",
  version: "1",
  goal: "finish a test conversation",
  knownFacts: { name: "Yusuf" },
  unknownFacts: ["email"],
  constraints: ["do not invent unknown facts"],
  maxUserTurns: 3,
};

const echoAgent: TargetAgent = {
  name: "echo",
  async respond(input) {
    const latest = input.messages.at(-1);
    return {
      content: `received: ${latest?.content ?? ""}`,
      toolEvents: [],
    };
  },
};

test("records fixed replay messages and private simulator rationale", async () => {
  const result = await runConversation({
    scenario,
    simulator: new FixedReplaySimulator(["hello", "thanks"]),
    agent: echoAgent,
  });

  assert.equal(result.stopReason, "simulator_completed");
  assert.deepEqual(
    result.messages.map(({ role, content }) => ({ role, content })),
    [
      { role: "user", content: "hello" },
      { role: "assistant", content: "received: hello" },
      { role: "user", content: "thanks" },
      { role: "assistant", content: "received: thanks" },
    ],
  );
  assert.match(result.simulatorDecisions[0]?.decision.rationale ?? "", /replayed/);
  assert.equal(
    result.messages.some((message) => message.content.includes("replayed")),
    false,
  );
});

test("enforces the scenario user-turn limit", async () => {
  const simulator: UserSimulator = {
    name: "never-stops",
    async next() {
      return { kind: "message", content: "continue", rationale: "test" };
    },
  };

  const result = await runConversation({ scenario, simulator, agent: echoAgent });

  assert.equal(result.stopReason, "max_user_turns");
  assert.equal(result.messages.filter(({ role }) => role === "user").length, 3);
});

test("classifies simulator failures without blaming the agent", async () => {
  const simulator: UserSimulator = {
    name: "broken-simulator",
    async next() {
      throw new Error("invalid structured output");
    },
  };

  const result = await runConversation({ scenario, simulator, agent: echoAgent });

  assert.equal(result.stopReason, "simulator_error");
  assert.deepEqual(result.error, {
    source: "simulator",
    message: "invalid structured output",
  });
  assert.deepEqual(result.messages, []);
});

