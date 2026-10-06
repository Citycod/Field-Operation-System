import { defineConfig } from "@playwright/test";
import { loadHostedEnvironment } from "./tests/hosted-environment";

const hostedEnvironment = loadHostedEnvironment();

export default defineConfig({
  testDir: "./tests",
  testMatch: "responsive.hosted.ts",
  timeout: 600_000,
  expect: { timeout: 60_000 },
  workers: 1,
  fullyParallel: false,
  use: {
    baseURL: "http://127.0.0.1:3204",
    channel: "chrome",
    headless: true,
    screenshot: "only-on-failure",
    trace: "off",
  },
  webServer: {
    command: "pnpm --filter web exec next dev --hostname 127.0.0.1 --port 3204",
    url: "http://127.0.0.1:3204/login",
    reuseExistingServer: false,
    timeout: 180_000,
    env: { ...process.env, ...hostedEnvironment },
  },
});
