import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  timeout: 60_000,
  workers: 1,
  use: {
    baseURL: "http://127.0.0.1:3100",
    channel: "chrome",
    headless: true,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "pnpm --filter web exec next dev --hostname 127.0.0.1 --port 3100",
    url: "http://127.0.0.1:3100/dev/form-builder",
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
