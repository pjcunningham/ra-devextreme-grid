import { defineConfig, devices } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const database = path
  .resolve(root, 'examples/remote-fastapi/backend/data/e2e_production.db')
  .replace(/\\/g, '/');

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: 'production-demo.spec.ts',
  workers: 1,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:4174',
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command:
        'uv run --directory examples/remote-fastapi/backend uvicorn app.main:app --host 127.0.0.1 --port 8001',
      url: 'http://127.0.0.1:8001/api/health',
      timeout: 120_000,
      reuseExistingServer: false,
      env: { GRID_DATABASE_URL: `sqlite:///${database}` },
    },
    {
      command: 'node tests/e2e/production-server.mjs',
      url: 'http://127.0.0.1:4174',
      timeout: 120_000,
      reuseExistingServer: false,
    },
  ],
});
