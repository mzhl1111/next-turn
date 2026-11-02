import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { expect, test } from "@playwright/test";

import {
  PlaywrightChatAdapter,
  Tau2RetailTask1Simulator,
  buildFailureEvidence,
  evaluateTau2RetailTask1,
  runBrowserConversation,
  tau2RetailTask1Evaluation,
  tau2RetailTask1UserScenario,
  type ControlledRetailBehavior,
  type EvidenceCategory,
  type FailureEvidence,
} from "../../src/index.js";

interface MatrixCase {
  readonly id: string;
  readonly behavior: ControlledRetailBehavior;
  readonly shouldPass: boolean;
  readonly expectedFailure?: EvidenceCategory;
}

const cases: readonly MatrixCase[] = [
  { id: "normal", behavior: "correct", shouldPass: true },
  {
    id: "question-order",
    behavior: "correct-question-order",
    shouldPass: true,
  },
  {
    id: "split-questions",
    behavior: "correct-split-questions",
    shouldPass: true,
  },
  {
    id: "wrong-items",
    behavior: "wrong-items",
    shouldPass: false,
    expectedFailure: "business",
  },
  {
    id: "claim-without-write",
    behavior: "claim-without-write",
    shouldPass: false,
    expectedFailure: "business",
  },
  {
    id: "write-before-confirmation",
    behavior: "write-before-confirmation",
    shouldPass: false,
    expectedFailure: "process",
  },
];

test("Weekend 2 browser matrix", async ({ browser, baseURL }) => {
  const resolvedBaseUrl = baseURL ?? "http://127.0.0.1:4174";
  const root = path.resolve("artifacts/weekend2");
  const evidenceDir = path.join(root, "evidence");
  const traceDir = path.join(root, "traces");
  const screenshotDir = path.join(root, "screenshots");
  await Promise.all([
    mkdir(evidenceDir, { recursive: true }),
    mkdir(traceDir, { recursive: true }),
    mkdir(screenshotDir, { recursive: true }),
  ]);
  const results: FailureEvidence[] = [];

  for (const matrixCase of cases) {
    const tracePath = path.join(traceDir, `${matrixCase.id}.zip`);
    const context = await browser.newContext(
      matrixCase.id === "split-questions"
        ? {
            baseURL: resolvedBaseUrl,
            viewport: { width: 390, height: 844 },
          }
        : { baseURL: resolvedBaseUrl },
    );
    await context.tracing.start({ screenshots: true, snapshots: true, sources: true });
    let evidence: FailureEvidence | undefined;
    try {
      const page = await context.newPage();
      await page.goto(`/?behavior=${matrixCase.behavior}`);
      const adapter = new PlaywrightChatAdapter(page, context.request);
      const { run, turnIds } = await runBrowserConversation({
        scenario: tau2RetailTask1UserScenario,
        simulator: new Tau2RetailTask1Simulator(),
        adapter,
        agentName: `controlled-retail:${matrixCase.behavior}`,
      });
      const evaluation = evaluateTau2RetailTask1(
        run,
        tau2RetailTask1Evaluation,
      );
      evidence = buildFailureEvidence({
        caseId: matrixCase.id,
        run,
        evaluation,
        tracePath: path.relative(process.cwd(), tracePath),
      });
      await expect(page.locator("body")).not.toContainText(
        "exchange_delivered_order_items",
      );
      await expect(page.locator("body")).not.toContainText("payment_method_id");
      if (matrixCase.id === "normal" || matrixCase.id === "split-questions") {
        await page.screenshot({
          path: path.join(
            screenshotDir,
            matrixCase.id === "normal" ? "desktop.png" : "mobile.png",
          ),
          fullPage: true,
        });
      }
      await writeFile(
        path.join(evidenceDir, `${matrixCase.id}.json`),
        `${JSON.stringify({ ...evidence, turnIds }, null, 2)}\n`,
      );
    } finally {
      await context.tracing.stop({ path: tracePath });
      await context.close();
    }

    expect(evidence, `${matrixCase.id} did not produce evidence`).toBeDefined();
    expect(evidence?.passed).toBe(matrixCase.shouldPass);
    if (matrixCase.expectedFailure) {
      expect(
        evidence?.failures.some(
          ({ category }) => category === matrixCase.expectedFailure,
        ),
      ).toBe(true);
    }
    results.push(evidence as FailureEvidence);
  }

  const rows = results.map(
    (result) =>
      `| ${result.caseId} | ${result.passed ? "pass" : "detected failure"} | ${result.failures.map(({ category }) => category).join(", ") || "none"} | \`${result.tracePath}\` |`,
  );
  await writeFile(
    path.join(root, "summary.md"),
    `# Weekend 2 browser matrix\n\n| Case | Verdict | Failure categories | Trace |\n| --- | --- | --- | --- |\n${rows.join("\n")}\n`,
  );
});
