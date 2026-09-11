import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import process from 'node:process';
import console from 'node:console';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const database = path.join(root, 'examples/remote-fastapi/backend/data/e2e_customers.db');
const files = [database, `${database}-journal`, `${database}-wal`, `${database}-shm`];
const require = createRequire(import.meta.url);

function clean(strict) {
  for (const file of files) {
    try {
      fs.rmSync(file, { force: true });
    } catch (error) {
      const message = `Cannot remove disposable E2E database artifact ${file}: ${error.message}`;
      if (strict) throw new Error(message, { cause: error });
      console.warn(message);
    }
  }
}

async function freePort(port) {
  await new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', (error) =>
      reject(
        new Error(
          `Fresh E2E requires port ${port} to be free: ${error.message}. No process was terminated.`
        )
      )
    );
    server.listen(port, '127.0.0.1', () => server.close(resolve));
  });
}

await freePort(8000);
await freePort(5174);
clean(true);
if (files.some((file) => fs.existsSync(file)))
  throw new Error(`Fresh E2E database still exists: ${database}`);
console.log(`[isolation] Ports 8000/5174 free; database absent before server startup: ${database}`);
let exitCode = 1;
try {
  const result = spawnSync(
    process.execPath,
    [require.resolve('@playwright/test/cli'), 'test', ...process.argv.slice(2)],
    {
      cwd: root,
      stdio: 'inherit',
      env: { ...process.env, GRID_E2E_FRESH: '1' },
    }
  );
  if (result.error) throw result.error;
  exitCode = result.status ?? 1;
} finally {
  // Playwright has stopped its webServer process trees before this cleanup.
  clean(false);
  const removed = files.every((file) => !fs.existsSync(file));
  console.log(`[isolation] Database removed after server shutdown: ${removed} (${database})`);
  if (!removed) console.warn('[isolation] Fresh teardown could not be confirmed.');
}
process.exitCode = exitCode;
