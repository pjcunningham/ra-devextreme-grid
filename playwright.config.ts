import { defineConfig, devices } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const e2eDbPath = path
  .resolve(__dirname, 'examples/remote-fastapi/backend/data/e2e_customers.db')
  .replace(/\\/g, '/');

export default defineConfig({
  testDir: './tests/e2e',
  testIgnore: 'production-demo.spec.ts',
  globalSetup: './tests/e2e/global-setup.ts',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: 'http://127.0.0.1:5174',
    timezoneId: 'Asia/Tokyo',
    locale: 'en-US',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        timezoneId: 'Asia/Tokyo',
        locale: 'en-US',
      },
    },
  ],
  webServer: [
    {
      command:
        'uv run --directory examples/remote-fastapi/backend uvicorn app.main:app --host 127.0.0.1 --port 8000',
      url: 'http://127.0.0.1:8000/openapi.json',
      reuseExistingServer: !process.env.CI && !process.env.GRID_E2E_FRESH,
      timeout: 120_000,
      env: {
        GRID_DATABASE_URL: `sqlite:///${e2eDbPath}`,
      },
    },
    {
      command: 'pnpm dev:remote-fastapi',
      url: 'http://127.0.0.1:5174',
      reuseExistingServer: !process.env.CI && !process.env.GRID_E2E_FRESH,
      timeout: 120_000,
    },
  ],
});
