import { cleanDisposableDatabase } from './global-setup';

export default function globalTeardown(): void {
  cleanDisposableDatabase();
}
