const shell = document.querySelector("[data-chat-shell]");
const form = document.querySelector("[data-composer]");
const input = document.querySelector("#message");
const messages = document.querySelector("[data-messages]");
const emptyState = document.querySelector("[data-empty-state]");
const state = document.querySelector("[data-session-state]");
const behaviorLabel = document.querySelector("[data-behavior-label]");
const button = form.querySelector("button");
const behavior = new URLSearchParams(location.search).get("behavior") ?? "correct";
let sessionId;
let turnNumber = 1;

function messageElement(message, turnId, status = "complete") {
  const node = document.createElement("article");
  node.className = "message";
  node.dataset.messageId = message.id;
  node.dataset.role = message.role;
  node.dataset.turnId = turnId;
  node.dataset.turnNumber = String(message.turn);
  node.dataset.turnStatus = status;
  node.textContent = message.content;
  return node;
}

async function start() {
  const response = await fetch("/api/sessions", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ behavior }),
  });
  if (!response.ok) throw new Error("Could not create a chat session");
  const session = await response.json();
  sessionId = session.sessionId;
  shell.dataset.sessionId = sessionId;
  shell.dataset.chatReady = "true";
  behaviorLabel.textContent = behavior.replaceAll("-", " ");
  state.textContent = "ready";
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const content = input.value.trim();
  if (!content || !sessionId) return;
  const turnId = shell.dataset.nextTurnId;
  const userMessage = { id: `user-${turnId}`, role: "user", content, turn: turnNumber };
  emptyState?.remove();
  messages.append(messageElement(userMessage, turnId));
  const pending = messageElement(
    { id: `assistant-${turnId}`, role: "assistant", content: "Waiting for a complete response…", turn: turnNumber },
    turnId,
    "pending",
  );
  messages.append(pending);
  input.value = "";
  button.disabled = true;
  state.textContent = "running";
  messages.scrollTop = messages.scrollHeight;

  try {
    const response = await fetch(`/api/sessions/${encodeURIComponent(sessionId)}/messages`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ turnId, content }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error ?? "Turn failed");
    pending.replaceWith(messageElement(result.assistantMessage, result.turnId));
    turnNumber += 1;
    shell.dataset.nextTurnId = `turn-${turnNumber}`;
    state.textContent = "ready";
  } catch (error) {
    pending.textContent = error instanceof Error ? error.message : String(error);
    pending.dataset.turnStatus = "error";
    state.textContent = "error";
  } finally {
    button.disabled = false;
    messages.scrollTop = messages.scrollHeight;
  }
});

start().catch((error) => {
  state.textContent = "error";
  behaviorLabel.textContent = error instanceof Error ? error.message : String(error);
});
