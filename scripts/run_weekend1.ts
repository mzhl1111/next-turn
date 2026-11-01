import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  ControlledRetailAgent,
  FixedReplaySimulator,
  Tau2RetailTask1Simulator,
  evaluateTau2RetailTask1,
  runConversation,
  tau2RetailTask1Evaluation,
  tau2RetailTask1UserScenario,
  TAU2_FIXTURE,
  type EvaluationResult,
  type RunRecord,
  type UserSimulator,
} from "../src/index.js";

const projectDir = path.resolve(import.meta.dirname, "..");
const outputDir = path.resolve(
  projectDir,
  process.env.WEEKEND1_OUTPUT_DIR ?? "artifacts/weekend1",
);

interface HarnessRun {
  readonly label: "fixed" | "dynamic";
  readonly sessionId: string;
  readonly run: RunRecord;
  readonly harnessEvaluation: EvaluationResult;
}

interface EnvironmentReplay {
  readonly sessionId: string;
  readonly initialStateHash: string;
  readonly finalStateHash: string;
  readonly initialOrder: Readonly<Record<string, unknown>>;
  readonly finalOrder: Readonly<Record<string, unknown>>;
  readonly toolEvents: readonly Readonly<Record<string, unknown>>[];
  readonly environmentEvaluation: {
    readonly reward: number;
    readonly dbReward: number;
    readonly dbMatch: boolean;
  };
}

const fixedMessages = [
  "I want the constrained keyboard exchange and a Google Home thermostat; if the keyboard is unavailable, exchange only the thermostat.",
  "My name is Yusuf Rossi and my ZIP is 19122. I don't remember my email.",
  "Yes, I confirm. Please exchange only the thermostat.",
] as const;

function invariant(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function runHarness(
  label: HarnessRun["label"],
  simulator: UserSimulator,
): Promise<HarnessRun> {
  const run = await runConversation({
    scenario: tau2RetailTask1UserScenario,
    simulator,
    agent: new ControlledRetailAgent("correct"),
  });
  const harnessEvaluation = evaluateTau2RetailTask1(
    run,
    tau2RetailTask1Evaluation,
  );
  invariant(harnessEvaluation.passed, `${label} harness evaluation failed`);
  return {
    label,
    sessionId: `weekend1-${label}`,
    run,
    harnessEvaluation,
  };
}

async function replayAgainstTau2(
  runs: readonly HarnessRun[],
): Promise<readonly EnvironmentReplay[]> {
  const python = path.join(projectDir, ".venv/bin/python");
  const script = path.join(projectDir, "scripts/replay_tau2_runs.py");
  const dataDir = path.join(projectDir, ".tau2/tau2-bench/data");
  const stdout = await new Promise<string>((resolve, reject) => {
    const child = spawn(python, [script], {
      cwd: projectDir,
      env: {
        ...process.env,
        LITELLM_LOCAL_MODEL_COST_MAP: "True",
        TAU2_DATA_DIR: dataDir,
      },
      stdio: ["pipe", "pipe", "pipe"],
    });
    let output = "";
    let errorOutput = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      output += chunk;
    });
    child.stderr.on("data", (chunk: string) => {
      errorOutput += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve(output);
      else reject(new Error(errorOutput || `tau2 replay exited with code ${code}`));
    });
    child.stdin.end(JSON.stringify({ runs }));
  });
  return (JSON.parse(stdout) as { replays: EnvironmentReplay[] }).replays;
}

function validateIsolation(replays: readonly EnvironmentReplay[]): void {
  invariant(replays.length === 2, "expected two environment replays");
  const [fixed, dynamic] = replays;
  invariant(fixed !== undefined && dynamic !== undefined, "replays are missing");
  invariant(fixed.sessionId !== dynamic.sessionId, "session IDs must be distinct");
  invariant(
    fixed.initialStateHash === dynamic.initialStateHash,
    "sessions did not start from identical benchmark state",
  );
  invariant(
    fixed.initialStateHash !== fixed.finalStateHash,
    "fixed session did not mutate benchmark state",
  );
  invariant(
    dynamic.initialStateHash !== dynamic.finalStateHash,
    "dynamic session did not mutate benchmark state",
  );
  for (const replay of replays) {
    invariant(
      replay.environmentEvaluation.dbReward === 1 &&
        replay.environmentEvaluation.dbMatch,
      `${replay.sessionId} did not match the real tau2 target state`,
    );
  }
}

function markdownSummary(
  generatedAt: string,
  runs: readonly HarnessRun[],
  replays: readonly EnvironmentReplay[],
): string {
  const rows = runs.map((run) => {
    const replay = replays.find(({ sessionId }) => sessionId === run.sessionId);
    invariant(replay !== undefined, `missing replay for ${run.sessionId}`);
    return `| ${run.label} | ${run.run.messages.length} | ${replay.toolEvents.length} | ${replay.environmentEvaluation.dbReward.toFixed(1)} | ${run.run.stopReason} |`;
  });
  return `# Weekend 1 controlled trajectories

Generated: ${generatedAt}

Both sessions started from the same pinned tau2 retail database hash and used
separate environment instances. The recorded tool calls were executed against
real task state, and the upstream database evaluator accepted both final states.

| Input type | Visible messages | Tool events | DB reward | Stop reason |
| --- | ---: | ---: | ---: | --- |
${rows.join("\n")}

- Initial state SHA-256: \`${replays[0]?.initialStateHash}\`
- Upstream: tau2-bench ${TAU2_FIXTURE.tag} at \`${TAU2_FIXTURE.commit}\`
- Full records: \`fixed.json\`, \`dynamic.json\`, and \`trajectories.json\`
`;
}

async function main(): Promise<void> {
  const runs = await Promise.all([
    runHarness("fixed", new FixedReplaySimulator(fixedMessages)),
    runHarness("dynamic", new Tau2RetailTask1Simulator()),
  ]);
  const replays = await replayAgainstTau2(runs);
  validateIsolation(replays);

  const generatedAt = new Date().toISOString();
  const records = runs.map((run) => ({
    ...run,
    environmentReplay: replays.find(
      ({ sessionId }) => sessionId === run.sessionId,
    ),
  }));
  const bundle = {
    schemaVersion: 1,
    generatedAt,
    upstream: TAU2_FIXTURE,
    isolation: {
      separateEnvironmentInstances: true,
      identicalInitialState:
        replays[0]?.initialStateHash === replays[1]?.initialStateHash,
      initialStateHash: replays[0]?.initialStateHash,
    },
    trajectories: records,
  };

  await mkdir(outputDir, { recursive: true });
  await Promise.all([
    ...records.map((record) =>
      writeFile(
        path.join(outputDir, `${record.label}.json`),
        `${JSON.stringify(record, null, 2)}\n`,
      ),
    ),
    writeFile(
      path.join(outputDir, "trajectories.json"),
      `${JSON.stringify(bundle, null, 2)}\n`,
    ),
    writeFile(
      path.join(outputDir, "summary.md"),
      markdownSummary(generatedAt, runs, replays),
    ),
  ]);

  process.stdout.write(
    `Weekend 1 trajectories passed.\nArtifacts: ${outputDir}\nInitial state: ${replays[0]?.initialStateHash}\n`,
  );
}

await main();
