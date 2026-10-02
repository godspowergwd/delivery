import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { isIsolatedLoadTestDatabaseUrl, isLoopbackHostname } from '@delivery/shared';

const apiRequire = createRequire(new URL('../apps/api/package.json', import.meta.url));
const { parse: parseEnv } = apiRequire('dotenv');
const apiEnvPath = fileURLToPath(new URL('../apps/api/.env', import.meta.url));

export function loadApiEnvironment(processEnvironment = process.env) {
  let fileEnvironment = {};
  try {
    fileEnvironment = parseEnv(readFileSync(apiEnvPath));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  return { ...fileEnvironment, ...processEnvironment };
}

export function validateApiRuntimeAttestation(attestation, port, now, processAlive) {
  const ageMs = now - attestation?.startedAt;
  return {
    valid: Boolean(
      processAlive && Number.isInteger(attestation?.port) && attestation.port === port &&
      ageMs >= 0 && ageMs <= 5 * 60 * 1_000 &&
      attestation.loadTestSafe === true && attestation.mapboxMock === true
    ),
    loadTestAccountCount: attestation?.loadTestAccountCount ?? 0,
  };
}

export function readApiRuntimeAttestation(api, now = Date.now()) {
  try {
    const url = new URL(api);
    const port = Number(url.port || 80);
    const path = fileURLToPath(new URL(`../apps/api/.load-test-runtime-${port}.json`, import.meta.url));
    const attestation = JSON.parse(readFileSync(path, 'utf8'));
    let processAlive = false;
    try {
      process.kill(attestation.pid, 0);
      processAlive = true;
    } catch (error) {
      processAlive = error?.code === 'EPERM';
    }
    return validateApiRuntimeAttestation(attestation, port, now, processAlive);
  } catch {
    return { valid: false, loadTestAccountCount: 0 };
  }
}

function apiUrlIsLoopback(value) {
  try {
    const url = new URL(value);
    return (
      url.protocol === 'http:' &&
      isLoopbackHostname(url.hostname) &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash &&
      /^\/api\/?$/.test(url.pathname)
    );
  } catch {
    return false;
  }
}

export function hasRequiredRoleMix(accounts, requiredUsers) {
  if (!Array.isArray(accounts)) return false;
  const counts = new Map();
  for (const account of accounts) counts.set(account.role, (counts.get(account.role) ?? 0) + 1);
  const roles = ['CUSTOMER', 'DRIVER', 'KITCHEN', 'ADMIN'];
  if (roles.some((role) => (counts.get(role) ?? 0) < 1)) return false;
  if (requiredUsers < 8) return true;
  return (
    (counts.get('CUSTOMER') ?? 0) >= Math.ceil(requiredUsers * 0.6) &&
    ['DRIVER', 'KITCHEN', 'ADMIN'].every((role) => (counts.get(role) ?? 0) >= Math.floor(requiredUsers * 0.1))
  );
}

function syntheticAccountsAreValid(value, requiredUsers) {
  if (!value) return false;
  try {
    const accounts = JSON.parse(value);
    if (!Array.isArray(accounts) || accounts.length < requiredUsers) return false;
    const emails = new Set();
    for (const account of accounts) {
      if (
        !account ||
        typeof account.email !== 'string' ||
        !/@loadtest\.invalid$/i.test(account.email) ||
        typeof account.password !== 'string' ||
        account.password.length < 12 ||
        !['CUSTOMER', 'DRIVER', 'KITCHEN', 'ADMIN'].includes(account.role)
      ) return false;
      const email = account.email.toLowerCase();
      if (emails.has(email)) return false;
      emails.add(email);
    }
    return hasRequiredRoleMix(accounts, requiredUsers);
  } catch {
    return false;
  }
}

function hasProviderCredentials(environment) {
  const providerKey = /^(?:SEED_.*_PASSWORD|R2_(?:ACCOUNT_ID|ACCESS_KEY_ID|SECRET_ACCESS_KEY|BUCKET_NAME)|MAPBOX_(?:ACCESS_TOKEN|TOKEN)|VITE_MAPBOX_TOKEN|HUBTEL_|SMS_|TWILIO_|STRIPE_|PAYSTACK_|FLUTTERWAVE_|PAYMENT_|MOMO_)/i;
  return Object.entries(environment).some(
    ([key, value]) => providerKey.test(key) && Boolean(value?.trim()),
  );
}

export function loadTestSafetyChecks({
  api,
  environment,
  argumentsMap,
  requireConsent = true,
  requiredUsers = 4,
  runtimeAttestation,
  requireRuntimeAttestation = false,
}) {
  const databaseUrl = environment.DATABASE_URL;
  const directUrl = environment.DIRECT_URL;
  const apiValid = apiUrlIsLoopback(api);
  const databaseLocal = isIsolatedLoadTestDatabaseUrl(databaseUrl);
  const directDatabaseLocal = !directUrl || isIsolatedLoadTestDatabaseUrl(directUrl);
  const providerCredentialsAbsent = !hasProviderCredentials(environment);
  const checks = [
    {
      name: 'API target is a loopback HTTP /api URL',
      passed: apiValid,
      remediation: 'Use http://127.0.0.1:<port>/api, localhost, or [::1], with no URL credentials or query string.',
    },
    {
      name: 'API environment is development, not production or test mode',
      passed: environment.NODE_ENV === 'development',
      remediation: 'Set NODE_ENV=development on the API and harness; production and test modes are refused.',
    },
    {
      name: 'Explicit isolated-test environment marker is set',
      passed: environment.LOAD_TEST_ENV === 'isolated',
      remediation: 'Set LOAD_TEST_ENV=isolated only in an explicitly isolated API environment.',
    },
    {
      name: 'Runtime database is loopback and has a dedicated test name',
      passed: databaseLocal,
      remediation: 'Point DATABASE_URL to a local database named with a _loadtest or _test suffix.',
    },
    {
      name: 'Direct migration database is also isolated',
      passed: directDatabaseLocal,
      remediation: 'Unset DIRECT_URL or point it to the same isolated local load-test database.',
    },
    {
      name: 'Mapbox mock mode is enabled',
      passed: ['true', '1'].includes(environment.MAPBOX_MOCK),
      remediation: 'Set MAPBOX_MOCK=true in the API environment; production cannot enable this mode.',
    },
    {
      name: 'Real Mapbox, R2, SMS, and payment credentials are absent',
      passed: providerCredentialsAbsent,
      remediation: 'Remove provider credentials from this isolated API environment before load testing.',
    },
    {
      name: `At least ${requiredUsers} synthetic role accounts are configured`,
      passed: syntheticAccountsAreValid(environment.LOAD_TEST_ACCOUNTS_JSON, requiredUsers),
      remediation: `Configure ${requiredUsers} unique synthetic @loadtest.invalid accounts with a realistic customer/driver/kitchen/admin mix.`,
    },
  ];
  if (requireRuntimeAttestation) {
    checks.push({
      name: 'Actual API process attests this isolated runtime before HTTP traffic',
      passed: runtimeAttestation?.valid === true && runtimeAttestation.loadTestAccountCount >= requiredUsers,
      remediation: 'Restart the API from this isolated configuration; its local startup attestation must match the requested port and virtual-user count.',
    });
  }
  if (requireConsent) {
    checks.push(
      {
        name: 'Write traffic explicitly authorized',
        passed: argumentsMap.get('allow-writes') === 'true',
        remediation: 'Pass --allow-writes=true only after verifying this is a disposable isolated database.',
      },
      {
        name: 'Isolated-test environment explicitly confirmed',
        passed: argumentsMap.get('confirm-isolated-test-env') === 'YES',
        remediation: 'Pass --confirm-isolated-test-env=YES only after verifying isolation independently.',
      },
    );
  }
  return checks;
}

export function reportLoadTestSafety(checks, { preflight = false } = {}) {
  for (const check of checks) {
    console.log(`[loadtest] ${check.passed ? 'PASS' : 'FAIL'} ${check.name}`);
    if (!check.passed) console.error(`[loadtest]   ${check.remediation}`);
  }
  const failed = checks.some((check) => !check.passed);
  if (failed) {
    console.error('[loadtest] REFUSING: configuration is not safe for this workload.');
    console.error('[loadtest] Zero HTTP requests and zero database connections were generated.');
  } else if (preflight) {
    console.log('[loadtest] Environment preflight passed; no HTTP requests or database connections were made.');
    console.log('[loadtest] Workload execution still requires explicit write consent and isolation confirmation.');
  }
  return !failed;
}