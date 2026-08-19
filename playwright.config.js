import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  timeout: 15_000,
  expect: { timeout: 5_000 },
  fullyParallel: true,
  reporter: [
    ["line"],
    ["./scripts/horizontal-agency-reporter.mjs"]
  ],
  use: {
    baseURL: "http://127.0.0.1:4173",
    headless: true,
    viewport: { width: 1280, height: 720 }
  },
  webServer: {
    command: "node tests/serve.mjs",
    url: "http://127.0.0.1:4173",
    reuseExistingServer: !process.env.CI
  }
});
