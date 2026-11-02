import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./test/e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  outputDir: "artifacts/weekend2/test-results",
  reporter: [["line"]],
  use: {
    baseURL: "http://127.0.0.1:4174",
    screenshot: "only-on-failure",
    video: "off",
    trace: "off",
  },
  webServer: {
    command: "npm run dev:chat",
    url: "http://127.0.0.1:4174/health",
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
