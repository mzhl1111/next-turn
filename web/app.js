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

function percent(numerator, denominator) {
  return denominator === 0 ? 0 : Math.round((numerator / denominator) * 100);
}

function renderInputComparison(label, aggregate) {
  const score = percent(aggregate.correctPathPasses, aggregate.correctPathRuns);
  const row = textElement("div", "comparison-row", "");
  const heading = textElement("div", "comparison-heading", "");
  heading.append(textElement("strong", "", label));
  heading.append(
    textElement(
      "span",
      "",
      `${aggregate.correctPathPasses}/${aggregate.correctPathRuns} correct paths`,
    ),
  );
  const track = textElement("div", "bar-track", "");
  const fill = textElement("div", "bar-fill", "");
  fill.style.width = `${score}%`;
  track.append(fill);
  row.append(heading, track);
  row.append(
    textElement(
      "p",
      "comparison-note",
      `${aggregate.errorDetections}/${aggregate.errorRuns} intentional errors detected · ${aggregate.falseNegatives} false negatives`,
    ),
  );
  return row;
}

function renderConfiguration(id, configuration, aggregate) {
  const card = textElement("div", "configuration", "");
  const expected = configuration.expectedPass ? "correct path" : "injected error";
  card.append(textElement("span", "configuration-id", id.replaceAll("-", " ")));
  card.append(
    textElement(
      "strong",
      aggregate.falsePositives + aggregate.falseNegatives === 0 ? "classified" : "path-sensitive",
    ),
  );
  card.append(
    textElement(
      "small",
      "",
      `${expected} · ${aggregate.successes}/${aggregate.runs} observed passes`,
    ),
  );
  if (aggregate.falseNegatives > 0) card.classList.add("warning");
  return card;
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

async function fetchJson(url) {
  const response = await fetch(url);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? `Unable to load ${url}`);
  return data;
}

async function loadExperiment() {
  const { results, review } = await fetchJson("/api/weekend3");
  const totals = results.summary.totals;
  const dynamic = results.summary.byInput.dynamic;
  const fixed = results.summary.byInput.fixed;
  const dynamicAccuracy = percent(
    dynamic.truePositives + dynamic.trueNegatives,
    dynamic.runs,
  );
  $("#dynamic-score").textContent = `${dynamicAccuracy}%`;
  $("#experiment-summary").textContent =
    `Across ${totals.runs} controlled browser runs, dynamic input passed every correct path and detected every injected error. Fixed replay missed ${fixed.falseNegatives} reasonable path variations.`;
  const status = $("#experiment-status");
  status.classList.add("pass");
  status.lastChild.textContent = " Experiment complete";

  const metrics = [
    ["Runs", formatNumber(totals.runs)],
    ["Dynamic correct paths", `${dynamic.correctPathPasses}/${dynamic.correctPathRuns}`],
    ["Errors detected", `${totals.errorDetections}/${totals.errorRuns}`],
    ["False positives", formatNumber(totals.falsePositives)],
    ["Cost", `$${Number(totals.costUsd).toFixed(4)}`],
  ];
  $("#experiment-metrics").replaceChildren(
    ...metrics.map(([label, value]) => renderMetric(label, value)),
  );
  $("#input-comparison").replaceChildren(
    renderInputComparison("Dynamic", dynamic),
    renderInputComparison("Fixed replay", fixed),
  );

  const configurationById = Object.fromEntries(
    results.experiment.configurations.map((item) => [item.id, item]),
  );
  $("#configuration-matrix").replaceChildren(
    ...Object.entries(results.summary.byConfiguration).map(([id, aggregate]) =>
      renderConfiguration(id, configurationById[id], aggregate),
    ),
  );

  const reviewed = Number(review?.reviewedRuns ?? 0);
  const pending = Number(review?.pendingRuns ?? 0);
  const reviewItems = [
    ["Reviewed", `${reviewed}/${reviewed + pending}`],
    ["Pending", String(pending)],
    ["Simulator violations", String(review?.simulatorViolations ?? 0)],
    ["False negatives", String(totals.falseNegatives)],
  ];
  $("#review-summary").replaceChildren(
    ...reviewItems.map(([label, value]) => {
      const item = textElement("div", "review-item", "");
      item.append(textElement("span", "", label), textElement("strong", "", value));
      return item;
    }),
  );
}

async function loadRun() {
  const requestedRun = new URLSearchParams(location.search).get("run");
  const data = await fetchJson(`/api/run${requestedRun ? `?id=${encodeURIComponent(requestedRun)}` : ""}`);

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
  if (data.archiveId) {
    const url = new URL(location.href);
    url.searchParams.set("run", data.archiveId);
    history.replaceState(null, "", url);
  }
}

async function loadRunSelector() {
  const { runs } = await fetchJson("/api/runs?limit=1000");
  const selector = $("#run-selector");
  if (runs.length === 0) {
    selector.closest(".run-picker").hidden = true;
    return;
  }
  const selected = new URLSearchParams(location.search).get("run") ?? runs[0].id;
  selector.replaceChildren(
    ...runs.map((run) => {
      const option = document.createElement("option");
      option.value = run.id;
      option.textContent = `${run.outcome ?? run.status} · ${new Date(run.createdAt).toLocaleString()}`;
      option.selected = run.id === selected;
      return option;
    }),
  );
  selector.addEventListener("change", () => {
    const url = new URL(location.href);
    url.searchParams.set("run", selector.value);
    location.assign(url);
  });
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

loadExperiment().catch((error) => {
  $("#experiment-summary").textContent = `Could not load Weekend 3: ${error.message}`;
  $("#experiment-status").lastChild.textContent = " Load failed";
});

loadRunSelector().catch(() => {
  $("#run-selector").closest(".run-picker").hidden = true;
});

loadRun().catch((error) => {
  $("#timeline").replaceChildren(
    textElement("div", "error-state", `Could not load task 1: ${error.message}`),
  );
  $("#run-status").lastChild.textContent = " Load failed";
});
