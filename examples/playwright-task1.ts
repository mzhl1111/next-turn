import { chromium } from "@playwright/test";

import {
  PlaywrightChatAdapter,
  Tau2RetailTask1Simulator,
  evaluateTau2RetailTask1,
  runBrowserConversation,
  tau2RetailTask1Evaluation,
  tau2RetailTask1UserScenario,
} from "../src/index.js";

const baseURL = process.env.NEXT_TURN_CHAT_URL ?? "http://127.0.0.1:4174";
const screenshotPath = process.env.NEXT_TURN_SCREENSHOT_PATH;
const browser = await chromium.launch({ headless: true });

try {
  const context = await browser.newContext({ baseURL });
  const page = await context.newPage();
  await page.goto("/?behavior=correct-question-order");
  const adapter = new PlaywrightChatAdapter(page, context.request);
  const { run, turnIds } = await runBrowserConversation({
    scenario: tau2RetailTask1UserScenario,
    simulator: new Tau2RetailTask1Simulator(),
    adapter,
    agentName: "controlled-retail:correct-question-order",
  });
  const evaluation = evaluateTau2RetailTask1(run, tau2RetailTask1Evaluation);
  process.stdout.write(
    `${JSON.stringify(
      {
        passed: evaluation.passed,
        stopReason: run.stopReason,
        turnIds,
        assertions: evaluation.assertions,
      },
      null,
      2,
    )}\n`,
  );
  if (screenshotPath) {
    await page.locator("[data-messages]").evaluate((element) => {
      element.style.maxHeight = "none";
      element.style.overflow = "visible";
    });
    await page.locator(".page-shell").screenshot({ path: screenshotPath });
  }
  await context.close();
} finally {
  await browser.close();
}
