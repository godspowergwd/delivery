#!/usr/bin/env node
/** Read-focused smoke checks against an explicitly isolated local API. */
import { requireIsolatedTestApi } from './test-safety.mjs';

const API = process.env.SMOKE_BASE_URL ?? 'http://127.0.0.1:4100/api';
const { accounts } = await requireIsolatedTestApi(API);

let passed = 0;
let failed = 0;

async function request(path, { token, method = 'GET', body } = {}) {
  const response = await fetch(`${API}${path}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try {
    data = await response.json();
  } catch {
    data = null;
  }
  return { response, data };
}

async function check(label, work) {
  try {
    const detail = await work();
    passed += 1;
    console.log(`[PASS] ${label}${detail ? `: ${detail}` : ''}`);
  } catch (error) {
    failed += 1;
    console.error(`[FAIL] ${label}: ${error instanceof Error ? error.message : 'request failed'}`);
  }
}

async function login(account) {
  const { response, data } = await request('/auth/login', {
    method: 'POST',
    body: { email: account.email, password: account.password },
  });
  if (!response.ok || !data?.accessToken || !data?.user?.id) {
    throw new Error(`synthetic login returned HTTP ${response.status}`);
  }
  return data;
}

const health = await request('/health');
if (!health.response.ok || health.data?.status !== 'ok') {
  console.error(`[smoke] API liveness failed (HTTP ${health.response.status}); no other checks will run.`);
  process.exit(1);
}

await check('API liveness', () => health.data.status === 'ok' ? 'healthy' : Promise.reject(new Error('unexpected status')));
await check('API readiness', async () => {
  const { response, data } = await request('/ready');
  if (!response.ok || data?.status !== 'ready') throw new Error(`HTTP ${response.status}`);
  return 'database probe ready';
});

const sessions = {};
for (const role of ['CUSTOMER', 'DRIVER', 'KITCHEN', 'ADMIN']) {
  await check(`${role} synthetic login`, async () => {
    sessions[role] = await login(accounts[role]);
    if (sessions[role].user.role !== role) throw new Error('role mismatch');
    return 'authenticated';
  });
}

if (sessions.CUSTOMER) {
  await check('authenticated customer profile', async () => {
    const { response, data } = await request('/auth/me', { token: sessions.CUSTOMER.accessToken });
    if (!response.ok || data?.user?.id !== sessions.CUSTOMER.user.id) throw new Error(`HTTP ${response.status}`);
    return 'own profile only';
  });
  await check('customer catalogue read', async () => {
    const { response, data } = await request('/products?pageSize=5', { token: sessions.CUSTOMER.accessToken });
    if (!response.ok || !Array.isArray(data?.items)) throw new Error(`HTTP ${response.status}`);
    return `${data.items.length} products`;
  });
  await check('customer category read', async () => {
    const { response, data } = await request('/categories?pageSize=10', { token: sessions.CUSTOMER.accessToken });
    if (!response.ok || !Array.isArray(data?.items)) throw new Error(`HTTP ${response.status}`);
    return `${data.items.length} categories`;
  });
  await check('anonymous protected-order rejection', async () => {
    const { response, data } = await request('/orders?pageSize=1');
    if (response.status !== 401 && response.status !== 403) throw new Error(`HTTP ${response.status}`);
    return data?.error?.code ?? 'denied';
  });
  await check('customer order-history read', async () => {
    const { response, data } = await request('/orders?pageSize=5', { token: sessions.CUSTOMER.accessToken });
    if (!response.ok || !Array.isArray(data?.items)) throw new Error(`HTTP ${response.status}`);
    return 'scoped order history';
  });
}

if (sessions.DRIVER) {
  await check('driver delivery-list read', async () => {
    const { response, data } = await request('/driver/deliveries', { token: sessions.DRIVER.accessToken });
    if (!response.ok || !Array.isArray(data?.data)) throw new Error(`HTTP ${response.status}`);
    return 'assigned deliveries';
  });
}

if (sessions.KITCHEN) {
  await check('kitchen summary read', async () => {
    const { response } = await request('/kitchen/summary', { token: sessions.KITCHEN.accessToken });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return 'summary available';
  });
  await check('kitchen order-queue read', async () => {
    const { response, data } = await request('/kitchen/orders?pageSize=5', { token: sessions.KITCHEN.accessToken });
    if (!response.ok || !Array.isArray(data?.items)) throw new Error(`HTTP ${response.status}`);
    return 'queue available';
  });
}

if (sessions.ADMIN) {
  await check('admin analytics read', async () => {
    const { response } = await request('/analytics/overview', { token: sessions.ADMIN.accessToken });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return 'overview available';
  });
}

for (const [role, session] of Object.entries(sessions)) {
  if (!session?.accessToken) continue;
  await check(`${role} synthetic session logout`, async () => {
    const { response } = await request('/auth/logout', {
      method: 'POST',
      token: session.accessToken,
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return 'isolated session revoked';
  });
}

console.log(`[smoke] ${passed} passed, ${failed} failed; only isolated synthetic sessions were created/revoked. No orders, customer accounts, uploads, or settings changed.`);
process.exit(failed === 0 ? 0 : 1);