import { defineConfig, devices } from '@playwright/test';
import 'dotenv/config';

const isCI = !!process.env.CI;

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  workers: isCI ? 1 : undefined,
  reporter: [[isCI ? 'github' : 'list'], ['html', { open: 'never' }]],
  use: {
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'local',
      use: {
        ...devices['Desktop Chrome'],
        baseURL: process.env.LOCAL_URL ?? 'http://localhost:5173',
      },
    },
    {
      name: 'staging',
      use: {
        ...devices['Desktop Chrome'],
        baseURL: process.env.STAGING_URL,
      },
    },
  ],
});