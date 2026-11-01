import {
  DEFAULT_OPENROUTER_MODEL,
  streamOpenRouterText,
} from "../src/llm/openrouter.js";

const result = await streamOpenRouterText({
  model: process.env.OPENROUTER_MODEL ?? DEFAULT_OPENROUTER_MODEL,
  maxCompletionTokens: 128,
  temperature: 0,
  messages: [
    {
      role: "user",
      content:
        "How many times does the letter r appear in the word strawberry? Answer briefly.",
    },
  ],
});

process.stdout.write(`${result.text}\n`);
process.stdout.write(
  `${JSON.stringify({ model: result.model, usage: result.usage }, null, 2)}\n`,
);

