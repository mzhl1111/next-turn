const $ = (selector) => document.querySelector(selector);

function formatNumber(value) {
  return new Intl.NumberFormat("en-US").format(value ?? 0);
}

function textElement(tag, className, content) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  element.textContent = content;
  return element;
}

function renderMetric(label, value) {
  const metric = textElement("div", "metric", "");
  metric.append(textElement("div", "metric-label", label));
  metric.append(textElement("div", "metric-value", value));
  return metric;
}

function renderMessage(message) {
  const isTool = message.role === "tool" || message.toolCalls.length > 0;
  const event = textElement("div", `event ${isTool ? "tool" : message.role}`, "");
  event.dataset.category = isTool ? "tools" : "dialogue";
  event.append(textElement("div", "event-role", isTool ? "tool" : message.role));
  event.append(textElement("div", "event-node", ""));
  const body = textElement("div", "message", message.displayContent || "Tool request");

  for (const call of message.toolCalls) {
    const callElement = textElement("div", "tool-call", `→ ${call.name}`);
    callElement.title = JSON.stringify(call.arguments, null, 2);
    body.append(callElement);
  }
  if (message.role === "tool" && message.content !== message.displayContent) {
    const details = document.createElement("details");
    details.append(textElement("summary", "", "Inspect raw tool output"));
    details.append(textElement("pre", "", message.content));
    body.append(details);
  }
  event.append(body);
  return event;
}

async function load() {
  const response = await fetch("/api/run");
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? "Unable to load run");

  $("#goal").textContent = data.scenario.goal;
  $("#reward").textContent = Number(data.run.reward ?? 0).toFixed(1);
  const status = $("#run-status");
  status.classList.toggle("pass", data.run.reward === 1 && data.run.dbMatch === true);
  status.lastChild.textContent = data.run.reward === 1 ? " Run passed" : " Run needs review";

  const metrics = [
    ["Model", String(data.run.agentModel).replace("openrouter/", "")],
    ["Duration", `${Number(data.run.durationSeconds).toFixed(1)} sec`],
    ["Model calls", formatNumber(data.run.modelCalls)],
    ["Total tokens", formatNumber(data.run.totals.prompt + data.run.totals.completion)],
    ["Actual cost", `$${Number(data.run.totals.cost).toFixed(6)}`],
  ];
  $("#metrics").replaceChildren(...metrics.map(([label, value]) => renderMetric(label, value)));

  const factEntries = [
    ...Object.entries(data.scenario.knownFacts),
    ["Unknown", data.scenario.unknownFacts.join(", ")],
  ];
  $("#facts").replaceChildren(
    ...factEntries.map(([label, value]) => {
      const fact = textElement("div", "fact", "");
      fact.append(textElement("span", "", label.replace(/([A-Z])/g, " $1")));
      fact.append(textElement("strong", "", value));
      return fact;
    }),
  );
  $("#constraints").replaceChildren(
    ...data.scenario.constraints.map((constraint) => textElement("li", "", constraint)),
  );

  $("#actions").replaceChildren(
    ...data.actions.map((action) => {
      const row = textElement("div", "action", "");
      row.append(textElement("span", "action-check", action.matched ? "✓" : "×"));
      row.append(textElement("span", "action-name", action.name));
      row.append(textElement("span", "action-type", action.type));
      row.title = JSON.stringify(action.arguments, null, 2);
      return row;
    }),
  );
  $("#timeline").replaceChildren(...data.messages.map(renderMessage));
}

$("#filters").addEventListener("click", (event) => {
  const button = event.target.closest("button[data-filter]");
  if (!button) return;
  for (const item of document.querySelectorAll("#filters button")) item.classList.remove("active");
  button.classList.add("active");
  const filter = button.dataset.filter;
  for (const item of document.querySelectorAll(".event")) {
    item.classList.toggle("hidden", filter !== "all" && item.dataset.category !== filter);
  }
});

load().catch((error) => {
  $("#timeline").replaceChildren(
    textElement("div", "error-state", `Could not load task 1: ${error.message}`),
  );
  $("#run-status").lastChild.textContent = " Load failed";
});

