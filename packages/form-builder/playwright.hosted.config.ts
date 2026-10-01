import { defineConfig } from "@playwright/test";
import { loadHostedEnvironment } from "./tests/hosted-environment";

const hostedEnvironment = loadHostedEnvironment();

export default defineConfig({
  testDir: "./tests",
  testMatch: "form-library.hosted.ts",
  timeout: 240_000,
  workers: 1,
  use: {
    baseURL: "http://127.0.0.1:3200",
    channel: "chrome",
    headless: true,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "pnpm --filter web exec next dev --hostname 127.0.0.1 --port 3200",
    url: "http://127.0.0.1:3200/login",
    reuseExistingServer: false,
    timeout: 180_000,
    env: { ...process.env, ...hostedEnvironment },
  },
});
