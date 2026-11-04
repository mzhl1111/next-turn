const shell = document.querySelector("[data-conversation-shell]");
const messages = document.querySelector("[data-messages]");
const runStatus = document.querySelector("[data-run-status]");
const sessionState = document.querySelector("[data-session-state]");
const runModel = document.querySelector("[data-run-model]");
const runGoal = document.querySelector("[data-run-goal]");
const runMetrics = document.querySelector("[data-run-metrics]");

function messageElement(message) {
  const node = document.createElement("article");
  node.className = "message";
  node.dataset.role = message.role;
  node.dataset.messageIndex = String(message.index);
  node.textContent = message.displayContent;
  return node;
}

function metricElement(label, value) {
  const metric = document.createElement("div");
  metric.className = "replay-metric";
  const name = document.createElement("span");
  name.textContent = label;
  const result = document.createElement("strong");
  result.textContent = value;
  metric.append(name, result);
  return metric;
}

async function loadRun() {
  const requestedRun = new URLSearchParams(location.search).get("run");
  const response = await fetch(`/api/run${requestedRun ? `?id=${encodeURIComponent(requestedRun)}` : ""}`);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? "Unable to load the latest run");

  const passed = data.run.reward === 1 && data.run.dbMatch === true;
  const visibleMessages = data.messages.filter(
    (message) =>
      (message.role === "user" || message.role === "assistant") &&
      message.displayContent.trim().length > 0,
  );
  const totalTokens = data.run.totals.prompt + data.run.totals.completion;

  shell.dataset.source = data.source;
  shell.dataset.reward = String(data.run.reward);
  shell.dataset.dbMatch = String(data.run.dbMatch);
  shell.dataset.messageCount = String(visibleMessages.length);
  runStatus.textContent = passed ? "real run passed" : "real run needs review";
  sessionState.textContent = passed ? "passed · reward 1.0" : "needs review";
  runModel.textContent = `OpenRouter · ${String(data.run.agentModel).replace("openrouter/", "")}`;
  runGoal.textContent = data.scenario.goal;
  runMetrics.replaceChildren(
    metricElement("Duration", `${Number(data.run.durationSeconds).toFixed(1)} sec`),
    metricElement("Model calls", String(data.run.modelCalls)),
    metricElement("Total tokens", new Intl.NumberFormat("en-US").format(totalTokens)),
    metricElement("Actual cost", `$${Number(data.run.totals.cost).toFixed(6)}`),
  );
  messages.replaceChildren(...visibleMessages.map(messageElement));
  if (data.archiveId) {
    const url = new URL(location.href);
    url.searchParams.set("run", data.archiveId);
    history.replaceState(null, "", url);
    const dashboard = document.querySelector(".replay-footer a");
    dashboard.href = `/?run=${encodeURIComponent(data.archiveId)}`;
  }
}

loadRun().catch((error) => {
  runStatus.textContent = "load failed";
  sessionState.textContent = "error";
  messages.textContent = error instanceof Error ? error.message : String(error);
});
