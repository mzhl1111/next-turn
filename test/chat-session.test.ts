import assert from "node:assert/strict";
import test from "node:test";

import { ChatSession } from "../src/browser/chat-session.js";

test("chat sessions record completed turns and hidden tool events", async () => {
  const session = new ChatSession("correct");
  const first = await session.send("turn-1", "I need help with an exchange.");

  assert.equal(first.status, "complete");
  assert.equal(first.turnId, "turn-1");
  assert.equal(session.record().messages.length, 2);
  assert.equal(session.record().toolEvents.length, 0);
});

test("chat sessions reject duplicate turn IDs", async () => {
  const session = new ChatSession("correct");
  await session.send("turn-1", "First message");

  await assert.rejects(
    session.send("turn-1", "Duplicate message"),
    /non-empty and unique/,
  );
});
