import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function cleanDisposableDatabase(): void {
  const dbFile = path.resolve(
    __dirname,
    '../../examples/remote-fastapi/backend/data/e2e_customers.db'
  );
  const candidateFiles = [dbFile, `${dbFile}-journal`, `${dbFile}-wal`, `${dbFile}-shm`];
  for (const file of candidateFiles) {
    if (fs.existsSync(file)) {
      try {
        fs.unlinkSync(file);
      } catch {
        // Ignore removal errors if file is temporarily locked
      }
    }
  }
}

export default function globalSetup(): void {
  cleanDisposableDatabase();
}
