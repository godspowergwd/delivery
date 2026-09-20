import fs from 'node:fs';
import { REPORT_DIR } from '../config/env';

/** Generated reports (PDF/Excel) live in apps/api/storage. */
export function ensureReportDir(): void {
  if (!fs.existsSync(REPORT_DIR)) {
    fs.mkdirSync(REPORT_DIR, { recursive: true });
  }
}