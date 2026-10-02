import test from 'node:test';
import assert from 'node:assert/strict';
import { hasRequiredRoleMix, loadTestSafetyChecks, validateApiRuntimeAttestation } from './loadtest-safety.mjs';

const accounts = [
  { email: 'customer@loadtest.invalid', password: 'Synthetic-Customer-Only', role: 'CUSTOMER' },
  { email: 'driver@loadtest.invalid', password: 'Synthetic-Driver-Only', role: 'DRIVER' },
  { email: 'kitchen@loadtest.invalid', password: 'Synthetic-Kitchen-Only', role: 'KITCHEN' },
  { email: 'admin@loadtest.invalid', password: 'Synthetic-Admin-Only', role: 'ADMIN' },
];

const environment = {
  NODE_ENV: 'development',
  LOAD_TEST_ENV: 'isolated',
  DATABASE_URL: 'postgresql://local:local@127.0.0.1:5433/delivery_loadtest',
  DIRECT_URL: 'postgresql://local:local@127.0.0.1:5433/delivery_loadtest',
  MAPBOX_MOCK: 'true',
  LOAD_TEST_ACCOUNTS_JSON: JSON.stringify(accounts),
};

const argumentsMap = new Map([
  ['allow-writes', 'true'],
  ['confirm-isolated-test-env', 'YES'],
]);

function checks(overrides = {}, options = {}) {
  return loadTestSafetyChecks({
    api: 'http://127.0.0.1:4100/api',
    environment: { ...environment, ...overrides },
    argumentsMap,
    ...options,
  });
}

function checkByName(results, prefix) {
  return results.find((check) => check.name.startsWith(prefix));
}

test('passes only with a local isolated database, mock integrations, synthetic accounts, and explicit consent', () => {
  assert.ok(checks().every((check) => check.passed));
});

test('rejects remote API, database, and direct migration URLs', () => {
  assert.equal(checkByName(checks({}, { api: 'https://api.example.com/api' }), 'API target').passed, false);
  assert.equal(checkByName(checks({ DATABASE_URL: 'postgresql://x:y@db.supabase.co/delivery_loadtest' }), 'Runtime database').passed, false);
  assert.equal(checkByName(checks({ DIRECT_URL: 'postgresql://x:y@db.example.com/delivery_loadtest' }), 'Direct migration').passed, false);
});

test('rejects the general development database even when its host is local', () => {
  const result = checks({ DATABASE_URL: 'postgresql://local:local@localhost:5433/delivery_system' });
  assert.equal(checkByName(result, 'Runtime database').passed, false);
});

test('rejects production/test modes and missing map mock', () => {
  assert.equal(checkByName(checks({ NODE_ENV: 'production' }), 'API environment').passed, false);
  assert.equal(checkByName(checks({ NODE_ENV: 'test' }), 'API environment').passed, false);
  assert.equal(checkByName(checks({ MAPBOX_MOCK: 'false' }), 'Mapbox mock').passed, false);
});

test('rejects configured R2, Mapbox, SMS, and payment credentials', () => {
  for (const name of ['SEED_ADMIN_PASSWORD', 'R2_ACCESS_KEY_ID', 'MAPBOX_ACCESS_TOKEN', 'HUBTEL_API_KEY', 'STRIPE_SECRET_KEY']) {
    assert.equal(checkByName(checks({ [name]: 'configured' }), 'Real Mapbox').passed, false, name);
  }
});

test('rejects missing or non-synthetic role accounts', () => {
  assert.equal(checkByName(checks({ LOAD_TEST_ACCOUNTS_JSON: '' }), 'At least 4 synthetic').passed, false);
  const realAddress = accounts.map((account) => ({ ...account }));
  realAddress[0].email = 'customer@example.com';
  assert.equal(checkByName(checks({ LOAD_TEST_ACCOUNTS_JSON: JSON.stringify(realAddress) }), 'At least 4 synthetic').passed, false);
});

test('preflight does not require write consent, workload execution does', () => {
  const noConsent = new Map();
  const preflight = checks({}, { argumentsMap: noConsent, requireConsent: false });
  assert.ok(preflight.every((check) => check.passed));
  const run = loadTestSafetyChecks({
    api: 'http://127.0.0.1:4100/api',
    environment,
    argumentsMap: noConsent,
  });
  assert.equal(checkByName(run, 'Write traffic').passed, false);
  assert.equal(checkByName(run, 'Isolated-test environment explicitly confirmed').passed, false);
});

test('requires a distinct synthetic login for every virtual user', () => {
  const threeRoles = accounts.slice(0, 3);
  const result = loadTestSafetyChecks({
    api: 'http://127.0.0.1:4100/api',
    environment: { ...environment, LOAD_TEST_ACCOUNTS_JSON: JSON.stringify(threeRoles) },
    argumentsMap,
    requiredUsers: 4,
  });
  assert.equal(checkByName(result, 'At least 4 synthetic').passed, false);
});

test('rejects repeated email identities even when the account list is long enough', () => {
  const duplicateAccounts = accounts.map((account, index) => ({
    ...account,
    email: index === 3 ? accounts[0].email : account.email,
  }));
  const result = checks({ LOAD_TEST_ACCOUNTS_JSON: JSON.stringify(duplicateAccounts) });
  assert.equal(checkByName(result, 'At least 4 synthetic').passed, false);
});

test('runtime attestation must match the live target port and safe API process', () => {
  const attestation = {
    pid: 123,
    port: 4100,
    startedAt: 1_000,
    loadTestSafe: true,
    mapboxMock: true,
    loadTestAccountCount: 500,
  };
  assert.equal(validateApiRuntimeAttestation(attestation, 4100, 2_000, true).valid, true);
  assert.equal(validateApiRuntimeAttestation(attestation, 4100, 301_001, true).valid, false);
  assert.equal(validateApiRuntimeAttestation(attestation, 4101, 2_000, true).valid, false);
  assert.equal(validateApiRuntimeAttestation(attestation, 4100, 2_000, false).valid, false);
  assert.equal(validateApiRuntimeAttestation({ ...attestation, loadTestSafe: false }, 4100, 2_000, true).valid, false);
  assert.equal(validateApiRuntimeAttestation(attestation, 4100, 90_000_000, true).valid, false);
});

test('requires a balanced role mix for large runs', () => {
  const skewed = Array.from({ length: 500 }, (_value, index) => ({
    role: index < 497 ? 'CUSTOMER' : ['DRIVER', 'KITCHEN', 'ADMIN'][index - 497],
  }));
  assert.equal(hasRequiredRoleMix(skewed, 500), false);
  const balanced = Array.from({ length: 500 }, (_value, index) => ({
    role: index < 300 ? 'CUSTOMER' : ['DRIVER', 'KITCHEN', 'ADMIN'][(index - 300) % 3],
  }));
  assert.equal(hasRequiredRoleMix(balanced, 500), true);
});

test('rejects remote PostgreSQL host overrides hidden in URI query parameters', () => {
  const result = checks({
    DATABASE_URL: 'postgresql://local:local@localhost/delivery_loadtest?host=remote.example.com',
  });
  assert.equal(checkByName(result, 'Runtime database').passed, false);
});