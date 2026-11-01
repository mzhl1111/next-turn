import assert from "node:assert/strict";
import test from "node:test";

import {
  collectOpenRouterStream,
  streamOpenRouterText,
} from "../src/llm/openrouter.js";

async function* fakeStream() {
  yield {
    model: "z-ai/glm-5.3-flash",
    choices: [{ delta: { content: "There are " } }],
  };
  yield {
    model: "z-ai/glm-5.3-flash",
    choices: [{ delta: { content: "three." } }],
    usage: {
      promptTokens: 14,
      completionTokens: 5,
      completionTokensDetails: { reasoningTokens: 2 },
      totalTokens: 19,
      cost: 0.00001,
    },
  };
}

test("collects streamed text and final usage", async () => {
  const result = await collectOpenRouterStream(fakeStream());

  assert.deepEqual(result, {
    model: "z-ai/glm-5.3-flash",
    text: "There are three.",
    usage: {
      promptTokens: 14,
      completionTokens: 5,
      reasoningTokens: 2,
      totalTokens: 19,
      costUsd: 0.00001,
    },
  });
});

test("rejects a live request before network access when the key is missing", async () => {
  await assert.rejects(
    streamOpenRouterText({
      apiKey: "",
      messages: [{ role: "user", content: "hello" }],
    }),
    /OPENROUTER_API_KEY is required/,
  );
});

