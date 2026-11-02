import { mkdir, writeFile } from "node:fs/promises";
import type { AddressInfo } from "node:net";
import path from "node:path";

import { chromium } from "@playwright/test";

import {
  FixedReplaySimulator,
  PlaywrightChatAdapter,
  Tau2RetailTask1Simulator,
  buildFailureEvidence,
  classifyExperimentOutcome,
  createChatServer,
  evaluateTau2RetailTask1,
  runBrowserConversation,
  summarizeWeekend3,
  tau2RetailTask1Evaluation,
  tau2RetailTask1FixedReplay,
  tau2RetailTask1UserScenario,
  weekend3Configurations,
  type ExperimentInputType,
  type ExperimentRunSummary,
  type FailureEvidence,
  type UserSimulator,
} from "../src/index.js";

const projectDir = path.resolve(import.meta.dirname, "..");
const outputDir = path.resolve(
  projectDir,
  process.env.WEEKEND3_OUTPUT_DIR ?? "artifacts/weekend3",
);
const repetitions = Number(process.env.WEEKEND3_REPETITIONS ?? "5");
const budgetUsd = Number(process.env.WEEKEND3_BUDGET_USD ?? "20");

function invariant(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function simulatorFor(inputType: ExperimentInputType): UserSimulator {
  return inputType === "fixed"
    ? new FixedReplaySimulator(tau2RetailTask1FixedReplay)
    : new Tau2RetailTask1Simulator();
}

async function listen(): Promise<{
  readonly baseUrl: string;
  readonly close: () => Promise<void>;
}> {
  const server = createChatServer({ webRoot: path.join(projectDir, "web/chat") });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address() as AddressInfo;
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      }),
  };
}

function ratio(passed: number, total: number): string {
  return total === 0 ? "0/0" : `${passed}/${total}`;
}

function markdownReport(options: {
  readonly generatedAt: string;
  readonly runs: readonly ExperimentRunSummary[];
  readonly budgetUsd: number;
}): string {
  const { generatedAt, runs, budgetUsd } = options;
  const summary = summarizeWeekend3(runs);
  const inputRows = (["fixed", "dynamic"] satisfies ExperimentInputType[]).map(
    (inputType) => {
      const item = summary.byInput[inputType];
      return `| ${inputType} | ${ratio(item.successes, item.runs)} | ${ratio(item.correctPathPasses, item.correctPathRuns)} | ${ratio(item.errorDetections, item.errorRuns)} | ${item.falsePositives} | ${item.falseNegatives} | ${item.simulatorViolations} | $${item.costUsd.toFixed(4)} | ${(item.durationMs / 1000).toFixed(2)}s |`;
    },
  );
  const configurationRows = weekend3Configurations.map(({ id, expectedPass }) => {
    const item = summary.byConfiguration[id];
    invariant(item !== undefined, `missing summary for ${id}`);
    return `| ${id} | ${expectedPass ? "pass" : "fail"} | ${ratio(item.successes, item.runs)} | ${item.falsePositives} | ${item.falseNegatives} |`;
  });
  return `# Weekend 3 controlled experiment

Generated: ${generatedAt}

This is a derived, deterministic controlled-agent experiment. It is not an
official tau2 leaderboard result and does not call a model API. The five
repetitions measure harness behavior, not model variance or generalization.

## Aggregate

| Input | Successes / runs | Correct paths passed | Errors detected | False positives | False negatives | Simulator violations | Cost | Duration |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
${inputRows.join("\n")}

| Configuration | Expected | Successes / runs | False positives | False negatives |
| --- | --- | ---: | ---: | ---: |
${configurationRows.join("\n")}

- Total runs: ${summary.totals.runs}
- Total observed successes: ${summary.totals.successes}/${summary.totals.runs}
- Correct paths passed: ${summary.totals.correctPathPasses}/${summary.totals.correctPathRuns}
- Intentional errors detected: ${summary.totals.errorDetections}/${summary.totals.errorRuns}
- Budget: $${summary.totals.costUsd.toFixed(4)} used of $${budgetUsd.toFixed(2)}
- Manual review queue: \`review-queue.json\`
`;
}

async function main(): Promise<void> {
  invariant(Number.isInteger(repetitions), "WEEKEND3_REPETITIONS must be an integer");
  invariant(repetitions >= 1 && repetitions <= 5, "repetitions must be between 1 and 5");
  invariant(Number.isFinite(budgetUsd) && budgetUsd > 0, "budget must be positive");

  const evidenceDir = path.join(outputDir, "evidence");
  const traceDir = path.join(outputDir, "traces");
  await Promise.all([
    mkdir(evidenceDir, { recursive: true }),
    mkdir(traceDir, { recursive: true }),
  ]);

  const localServer = await listen();
  const browser = await chromium.launch({ headless: true });
  const runs: ExperimentRunSummary[] = [];
  let accruedCostUsd = 0;

  try {
    for (const inputType of ["fixed", "dynamic"] satisfies ExperimentInputType[]) {
      for (const configuration of weekend3Configurations) {
        for (let repetition = 1; repetition <= repetitions; repetition += 1) {
          invariant(accruedCostUsd <= budgetUsd, "experiment budget exceeded");
          const id = `${inputType}-${configuration.id}-${repetition}`;
          const tracePath = path.join(traceDir, `${id}.zip`);
          const evidencePath = path.join(evidenceDir, `${id}.json`);
          const context = await browser.newContext({ baseURL: localServer.baseUrl });
          await context.tracing.start({
            screenshots: true,
            snapshots: true,
            sources: true,
          });
          const started = performance.now();
          let evidence: FailureEvidence;
          try {
            const page = await context.newPage();
            await page.goto(`/?behavior=${configuration.behavior}`);
            const adapter = new PlaywrightChatAdapter(page, context.request);
            const { run, turnIds } = await runBrowserConversation({
              scenario: tau2RetailTask1UserScenario,
              simulator: simulatorFor(inputType),
              adapter,
              agentName: `controlled-retail:${configuration.behavior}`,
            });
            const evaluation = evaluateTau2RetailTask1(
              run,
              tau2RetailTask1Evaluation,
            );
            evidence = buildFailureEvidence({
              caseId: id,
              run,
              evaluation,
              tracePath: path.relative(projectDir, tracePath),
            });
            const durationMs = performance.now() - started;
            const costUsd = 0;
            accruedCostUsd += costUsd;
            invariant(accruedCostUsd <= budgetUsd, "experiment budget exceeded");
            const runSummary: ExperimentRunSummary = {
              id,
              inputType,
              configurationId: configuration.id,
              repetition,
              expectedPass: configuration.expectedPass,
              observedPass: evidence.passed,
              outcome: classifyExperimentOutcome(
                configuration.expectedPass,
                evidence.passed,
              ),
              simulatorViolation: evidence.failures.some(
                ({ category }) => category === "simulator",
              ),
              durationMs,
              costUsd,
              evidencePath: path.relative(projectDir, evidencePath),
              tracePath: path.relative(projectDir, tracePath),
            };
            runs.push(runSummary);
            await writeFile(
              evidencePath,
              `${JSON.stringify(
                {
                  ...runSummary,
                  turnIds,
                  evidence,
                  usage: { promptTokens: 0, completionTokens: 0, costUsd },
                },
                null,
                2,
              )}\n`,
            );
          } finally {
            await context.tracing.stop({ path: tracePath });
            await context.close();
          }
          process.stdout.write(
            `[${runs.length}/${2 * weekend3Configurations.length * repetitions}] ${id}\n`,
          );
        }
      }
    }
  } finally {
    await browser.close();
    await localServer.close();
  }

  const generatedAt = new Date().toISOString();
  const summary = summarizeWeekend3(runs);
  const result = {
    schemaVersion: 1,
    generatedAt,
    experiment: {
      taskId: "tau2:retail:1",
      repetitions,
      inputTypes: ["fixed", "dynamic"],
      configurations: weekend3Configurations,
      maximumRuns: 60,
      controlledAgent: true,
      modelCalls: false,
    },
    budget: { limitUsd: budgetUsd, usedUsd: summary.totals.costUsd },
    summary,
    runs,
  };
  const reviewQueue = runs
    .filter(
      ({ observedPass, simulatorViolation }) => !observedPass || simulatorViolation,
    )
    .map(({ id, outcome, evidencePath, tracePath }) => ({
      id,
      outcome,
      evidencePath,
      tracePath,
      reviewStatus: "pending",
    }));

  await Promise.all([
    writeFile(
      path.join(outputDir, "results.json"),
      `${JSON.stringify(result, null, 2)}\n`,
    ),
    writeFile(
      path.join(outputDir, "summary.md"),
      markdownReport({ generatedAt, runs, budgetUsd }),
    ),
    writeFile(
      path.join(outputDir, "review-queue.json"),
      `${JSON.stringify(reviewQueue, null, 2)}\n`,
    ),
  ]);

  process.stdout.write(
    `Weekend 3 experiment complete: ${runs.length} runs, ${summary.totals.falsePositives} false positives, ${summary.totals.falseNegatives} false negatives.\n`,
  );
}

await main();
