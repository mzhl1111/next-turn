import { createReadStream, existsSync } from "node:fs";
import { readdir, readFile, stat } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, resolve } from "node:path";

import { tau2RetailTask1UserScenario } from "../src/scenarios/tau2-retail-task-1.js";

const projectDir = resolve(import.meta.dirname, "..");
const webDir = join(projectDir, "web");
const simulationsDir = join(
  projectDir,
  ".tau2",
  "tau2-bench",
  "data",
  "simulations",
);
const weekend3Results = join(projectDir, "artifacts", "weekend3", "results.json");
const weekend3Review = join(
  projectDir,
  "artifacts",
  "weekend3",
  "review-summary.json",
);
const port = Number(process.env.PORT ?? 4173);

interface JsonObject {
  [key: string]: unknown;
}

function asObject(value: unknown): JsonObject {
  return typeof value === "object" && value !== null ? (value as JsonObject) : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asNumber(value: unknown): number {
  return typeof value === "number" ? value : 0;
}

async function findLatestResults(): Promise<string> {
  const override = process.env.TAU2_RESULTS_FILE;
  if (override) return resolve(override);
  if (!existsSync(simulationsDir)) {
    throw new Error("No tau2 simulations found. Run npm run run:tau2:openrouter first.");
  }

  const candidates: { path: string; modified: number }[] = [];
  for (const entry of await readdir(simulationsDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const path = join(simulationsDir, entry.name, "results.json");
    if (!existsSync(path)) continue;
    candidates.push({ path, modified: (await stat(path)).mtimeMs });
  }
  candidates.sort((left, right) => right.modified - left.modified);
  const latest = candidates[0];
  if (!latest) throw new Error("No results.json exists under the tau2 simulations directory.");
  return latest.path;
}

function toolResultSummary(content: string): string {
  try {
    const parsed = asObject(JSON.parse(content));
    if (typeof parsed.name === "string" && parsed.variants) {
      return `${parsed.name} · ${Object.keys(asObject(parsed.variants)).length} variants`;
    }
    if (typeof parsed.order_id === "string") {
      const status = typeof parsed.status === "string" ? parsed.status : "order";
      return `${parsed.order_id} · ${status}`;
    }
  } catch {
    // Non-JSON tool results are already concise.
  }
  return content.length > 96 ? `${content.slice(0, 93)}...` : content;
}

function presentResults(payload: JsonObject, source: string): JsonObject {
  const simulation = asObject(asArray(payload.simulations)[0]);
  const info = asObject(payload.info);
  const rewardInfo = asObject(simulation.reward_info);
  const messages = asArray(simulation.messages).map((item, index) => {
    const message = asObject(item);
    const role = typeof message.role === "string" ? message.role : "unknown";
    const content = typeof message.content === "string" ? message.content : "";
    const calls = asArray(message.tool_calls).map((call) => {
      const value = asObject(call);
      return {
        name: value.name,
        arguments: value.arguments,
      };
    });
    return {
      index: index + 1,
      role,
      content,
      displayContent: role === "tool" ? toolResultSummary(content) : content,
      toolCalls: calls,
    };
  });

  const usageMessages = asArray(simulation.messages).filter(
    (item) => asObject(item).usage !== null && asObject(item).usage !== undefined,
  );
  const totals = usageMessages.reduce<{
    prompt: number;
    completion: number;
    reasoning: number;
    cost: number;
  }>(
    (result, item) => {
      const message = asObject(item);
      const usage = asObject(message.usage);
      const rawUsage = asObject(asObject(message.raw_data).usage);
      const completionDetails = asObject(rawUsage.completion_tokens_details);
      result.prompt += asNumber(usage.prompt_tokens);
      result.completion += asNumber(usage.completion_tokens);
      result.reasoning += asNumber(completionDetails.reasoning_tokens);
      result.cost += asNumber(rawUsage.cost);
      return result;
    },
    { prompt: 0, completion: 0, reasoning: 0, cost: 0 },
  );

  return {
    source,
    scenario: tau2RetailTask1UserScenario,
    run: {
      taskId: simulation.task_id,
      reward: rewardInfo.reward,
      dbMatch: asObject(rewardInfo.db_check).db_match,
      terminationReason: simulation.termination_reason,
      durationSeconds: simulation.duration,
      messageCount: messages.length,
      modelCalls: usageMessages.length,
      agentModel: asObject(info.agent_info).llm,
      userModel: asObject(info.user_info).llm,
      seed: simulation.seed,
      totals,
    },
    actions: asArray(rewardInfo.action_checks).map((item) => {
      const check = asObject(item);
      const action = asObject(check.action);
      return {
        name: action.name,
        type: check.tool_type,
        matched: check.action_match,
        arguments: action.arguments,
      };
    }),
    messages,
  };
}

const mimeTypes: Record<string, string> = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
};

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url ?? "/", `http://${request.headers.host}`);
    if (url.pathname === "/health") {
      response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ status: "ok" }));
      return;
    }
    if (url.pathname === "/api/weekend3") {
      if (!existsSync(weekend3Results)) {
        throw new Error("No Weekend 3 results found. Run npm run run:weekend3 first.");
      }
      const results = JSON.parse(await readFile(weekend3Results, "utf8"));
      const review = existsSync(weekend3Review)
        ? JSON.parse(await readFile(weekend3Review, "utf8"))
        : null;
      response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ results, review }));
      return;
    }
    if (url.pathname === "/api/run") {
      const source = await findLatestResults();
      const payload = asObject(JSON.parse(await readFile(source, "utf8")));
      response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify(presentResults(payload, source)));
      return;
    }

    const requested = url.pathname === "/" ? "index.html" : url.pathname.slice(1);
    const path = join(webDir, requested);
    if (!path.startsWith(webDir) || !existsSync(path)) {
      response.writeHead(404).end("Not found");
      return;
    }
    response.writeHead(200, {
      "Content-Type": mimeTypes[extname(path)] ?? "application/octet-stream",
    });
    createReadStream(path).pipe(response);
  } catch (error) {
    response.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
    response.end(
      JSON.stringify({ error: error instanceof Error ? error.message : String(error) }),
    );
  }
});

server.listen(port, "127.0.0.1", () => {
  process.stdout.write(`Task 1 dashboard: http://127.0.0.1:${port}\n`);
});
