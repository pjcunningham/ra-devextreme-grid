import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default async function globalSetup(): Promise<void> {
  if (!process.env.GRID_E2E_FRESH) return;
  const dbFile = path.resolve(
    __dirname,
    '../../examples/remote-fastapi/backend/data/e2e_customers.db'
  );
  if (!fs.existsSync(dbFile) || fs.statSync(dbFile).size === 0) {
    throw new Error(`FastAPI did not create the fresh disposable database: ${dbFile}`);
  }
  const response = await fetch('http://127.0.0.1:8000/api/customers/grid', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ loadOptions: { skip: 0, take: 1, requireTotalCount: true } }),
  });
  const body = await response.json();
  if (!response.ok || body.totalCount !== 100 || body.data?.[0]?.id !== 1) {
    throw new Error(
      `Fresh database did not return the deterministic 100-row seed: ${JSON.stringify(body)}`
    );
  }
  console.log(
    `[isolation] FastAPI created ${dbFile}; deterministic seed totalCount=100, first id=1.`
  );
}
