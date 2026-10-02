import { isIsolatedLoadTestDatabaseUrl, isLoopbackDatabaseUrl, isLoopbackHostname } from '@delivery/shared';
import {
  loadApiEnvironment,
  loadTestSafetyChecks,
  readApiRuntimeAttestation,
  reportLoadTestSafety,
} from './loadtest-safety.mjs';

function cliArguments() {
  const result = new Map();
  for (let index = 2; index < process.argv.length; index += 1) {
    const value = process.argv[index];
    if (!value.startsWith('--')) continue;
    const [key, inline] = value.slice(2).split('=');
    result.set(key, inline ?? process.argv[index + 1] ?? 'true');
    if (inline === undefined) index += 1;
  }
  return result;
}

function refuse(message) {
  console.error(`[safety] REFUSING: ${message}`);
  console.error('[safety] Zero workload requests and zero database writes were generated.');
  process.exit(2);
}

export function requireLocalReadOnlyDatabase(databaseUrl, nodeEnvironment = process.env.NODE_ENV) {
  if (nodeEnvironment === 'production' || !isLoopbackDatabaseUrl(databaseUrl)) {
    refuse('database diagnostics require a non-production loopback PostgreSQL URL.');
  }
}

export function requireIsolatedDatabase(environment = loadApiEnvironment()) {
  if (
    environment.NODE_ENV !== 'development' ||
    environment.LOAD_TEST_ENV !== 'isolated' ||
    !isIsolatedLoadTestDatabaseUrl(environment.DATABASE_URL) ||
    (environment.DIRECT_URL && !isIsolatedLoadTestDatabaseUrl(environment.DIRECT_URL))
  ) {
    refuse('direct database writes require NODE_ENV=development, LOAD_TEST_ENV=isolated, and loopback _loadtest/_test database URLs.');
  }
  return environment;
}

export function testAccountsByRole(environment) {
  const accounts = JSON.parse(environment.LOAD_TEST_ACCOUNTS_JSON);
  return Object.fromEntries(['CUSTOMER', 'DRIVER', 'KITCHEN', 'ADMIN'].map((role) => [
    role,
    accounts.find((account) => account.role === role),
  ]));
}

export async function requireIsolatedTestApi(api, web) {
  const environment = loadApiEnvironment();
  const flags = cliArguments();
  const runtimeAttestation = readApiRuntimeAttestation(api);
  const checks = loadTestSafetyChecks({
    api,
    environment,
    argumentsMap: flags,
    requireConsent: true,
    requiredUsers: 4,
    runtimeAttestation,
    requireRuntimeAttestation: true,
  });
  if (!reportLoadTestSafety(checks)) process.exit(2);

  if (web) {
    let url;
    try {
      url = new URL(web);
    } catch {
      refuse('web target URL is invalid.');
    }
    if (url.protocol !== 'http:' || !isLoopbackHostname(url.hostname)) {
      refuse('web target must be an HTTP loopback URL.');
    }
  }

  return { environment, accounts: testAccountsByRole(environment) };
}