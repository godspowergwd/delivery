#!/usr/bin/env node
import { loadApiEnvironment } from './loadtest-safety.mjs';
import { isLoopbackDatabaseUrl } from '../packages/shared/dist/load-test-safety.js';

const environment = loadApiEnvironment();
const localRuntime = isLoopbackDatabaseUrl(environment.DATABASE_URL);
const localDirect = !environment.DIRECT_URL || isLoopbackDatabaseUrl(environment.DIRECT_URL);

if (
  environment.NODE_ENV === 'production' ||
  process.env.NODE_ENV === 'production' ||
  !localRuntime ||
  !localDirect
) {
  console.error('[db-safety] REFUSING: developer database commands require non-production loopback DATABASE_URL and DIRECT_URL.');
  process.exit(2);
}
