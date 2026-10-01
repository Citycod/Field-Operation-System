import { defineConfig } from '@playwright/test';
import { loadHostedEnvironment } from './tests/hosted-environment';

const hostedEnvironment = loadHostedEnvironment();

export default defineConfig({
  testDir: './tests',
  testMatch: 'auth-lifecycle.hosted.ts',
  timeout: 600_000,
  expect: { timeout: 60_000 },
  workers: 1,
  fullyParallel: false,
  use: {
    baseURL: 'http://localhost:3201',
    channel: 'chrome',
    headless: true,
    screenshot: 'only-on-failure',
    trace: 'off',
  },
  webServer: {
    command: 'pnpm --filter web exec next dev --hostname 127.0.0.1 --port 3201',
    url: 'http://localhost:3201/login',
    reuseExistingServer: false,
    timeout: 180_000,
    env: { ...process.env, ...hostedEnvironment },
  },
});
