import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const database = path.join(root, 'examples/remote-fastapi/backend/data/e2e_production.db');
const databaseFiles = [database, `${database}-journal`, `${database}-wal`, `${database}-shm`];
const require = createRequire(import.meta.url);

for (const file of databaseFiles) fs.rmSync(file, { force: true });
let exitCode = 1;
try {
  const result = spawnSync(
    process.execPath,
    [
      require.resolve('@playwright/test/cli'),
      'test',
      '--config',
      'playwright.production.config.ts',
    ],
    { cwd: root, stdio: 'inherit' }
  );
  if (result.error) throw result.error;
  exitCode = result.status ?? 1;
} finally {
  for (const file of databaseFiles) fs.rmSync(file, { force: true });
}
process.exitCode = exitCode;
