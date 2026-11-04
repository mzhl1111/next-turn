import { existsSync } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import { join, relative, resolve } from "node:path";

import { SqliteRunStore } from "../src/storage/sqlite.js";
import type { FinalizeRunInput, RunDescriptor } from "../src/storage/types.js";

const projectDir = resolve(import.meta.dirname, "..");
const store = new SqliteRunStore(
  resolve(projectDir, process.env.NEXT_TURN_STORE_DIR ?? "artifacts/archive"),
);

function object(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null
    ? value as Record<string, unknown>
    : {};
}

function tau2Final(record: Record<string, unknown>): FinalizeRunInput {
  const simulation = object(Array.isArray(record.simulations) ? record.simulations[0] : undefined);
  const reward = object(simulation.reward_info).reward;
  const termination = String(simulation.termination_reason ?? "unknown");
  if (termination === "timeout" || simulation.error) {
    return {
      status: "failed",
      outcome: "infrastructure_error",
      terminationReason: termination,
      record,
    };
  }
  return {
    status: "completed",
    outcome: reward === 1 ? "pass" : "fail",
    terminationReason: termination,
    record,
  };
}

async function main(): Promise<void> {
  let created = 0;
  let existing = 0;
  try {
    const evidenceDir = join(projectDir, "artifacts/weekend3/evidence");
    if (existsSync(evidenceDir)) {
      for (const filename of await readdir(evidenceDir)) {
        if (!filename.endsWith(".json")) continue;
        const path = join(evidenceDir, filename);
        const record = JSON.parse(await readFile(path, "utf8")) as Record<string, unknown>;
        const tracePath = typeof record.tracePath === "string"
          ? resolve(projectDir, record.tracePath)
          : undefined;
        const observedPass = record.observedPass === true;
        const inputType = String(record.inputType ?? "unknown");
        const descriptor: RunDescriptor = {
          source: "weekend3",
          sourceIdentity: relative(projectDir, path),
          experimentId: "weekend3-controlled-matrix",
          scenario: { id: "tau2:retail:1", version: "v1.0.1" },
          adapter: { name: "playwright-chat", version: "1" },
          simulator: { name: inputType },
          metadata: {
            configurationId: record.configurationId,
            repetition: record.repetition,
          },
        };
        const result = await store.import({
          importKey: `file:${relative(projectDir, path)}`,
          descriptor,
          final: {
            status: "completed",
            outcome: observedPass ? "pass" : "fail",
            terminationReason: String(object(record.evidence).stopReason ?? "imported"),
            record,
          },
          artifacts: [
            { name: "evidence.json", path, redactJson: true },
            ...(tracePath && existsSync(tracePath)
              ? [{ name: "trace.zip", path: tracePath, mediaType: "application/zip" }]
              : []),
          ],
        });
        result.created ? created += 1 : existing += 1;
      }
    }

    const simulations = join(projectDir, ".tau2/tau2-bench/data/simulations");
    if (existsSync(simulations)) {
      for (const entry of await readdir(simulations, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        const path = join(simulations, entry.name, "results.json");
        if (!existsSync(path)) continue;
        const record = JSON.parse(await readFile(path, "utf8")) as Record<string, unknown>;
        const simulation = object(Array.isArray(record.simulations) ? record.simulations[0] : undefined);
        const info = object(record.info);
        const descriptor: RunDescriptor = {
          source: "tau2",
          sourceIdentity: relative(projectDir, path),
          experimentId: entry.name,
          scenario: {
            id: `tau2:retail:${String(simulation.task_id ?? "unknown")}`,
            version: "v1.0.1",
          },
          adapter: { name: "tau2-text-runtime", version: "v1.0.1" },
          simulator: {
            name: "tau2-user-simulator",
            model: String(object(info.user_info).llm ?? "unknown"),
          },
          metadata: {
            agentModel: object(info.agent_info).llm,
            seed: simulation.seed,
          },
        };
        const result = await store.import({
          importKey: `file:${relative(projectDir, path)}`,
          descriptor,
          final: tau2Final(record),
          artifacts: [{
            name: "results.json",
            path,
            mediaType: "application/json",
            redactJson: true,
          }],
        });
        result.created ? created += 1 : existing += 1;
      }
    }
    process.stdout.write(`Archived ${created} new runs; ${existing} already existed.\n`);
  } finally {
    store.close();
  }
}

await main();
