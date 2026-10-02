#!/usr/bin/env node
/**
 * Controlled load test: ~500 virtual users against a LOCAL API instance.
 *
 * Safety rails (all enforced in code):
 *   1. The target must be a loopback URL. The harness refuses any remote host,
 *      so production can never be attacked by accident.
 *   2. A dedicated loopback test database, explicit isolated-test marker,
 *      mock maps, absent provider credentials, and synthetic accounts are
 *      checked before the first request. Runtime health is checked before load.
 *   3. Each virtual user sends its own X-Forwarded-For value, so with
 *      TRUST_PROXY_HOPS=1 every simulated device gets its own rate-limit bucket,
 *      exactly like real users behind one proxy. Per-endpoint limits therefore
 *      behave the same way they would in production.
 *
 * Usage:
 *   npm run load:preflight
 *   npm run load:500 -- --allow-writes=true --confirm-isolated-test-env=YES
 */
import { monitorEventLoopDelay, performance } from 'node:perf_hooks';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { Client } from 'pg';
import {
  loadApiEnvironment,
  hasRequiredRoleMix,
  readApiRuntimeAttestation,
  loadTestSafetyChecks,
  reportLoadTestSafety,
} from './loadtest-safety.mjs';

const webRequire = createRequire(new URL('../apps/web/package.json', import.meta.url));
const { io } = webRequire('socket.io-client');

/* ----------------------------- arguments --------------------------------- */

const args = new Map();
for (let i = 2; i < process.argv.length; i += 1) {
  const item = process.argv[i];
  if (item.startsWith('--')) {
    const [key, inline] = item.slice(2).split('=');
    args.set(key, inline ?? process.argv[i + 1] ?? 'true');
    if (inline === undefined) i += 1;
  }
}

const API = String(args.get('api') ?? 'http://127.0.0.1:4100/api').replace(/\/+$/, '');
const USERS = Math.max(1, Number(args.get('users') ?? 500));
const DURATION_MS = Math.max(5_000, Number(args.get('duration') ?? 60) * 1000);
const runtimeEnv = loadApiEnvironment();
const DATABASE_URL = runtimeEnv.DATABASE_URL;
const preflightOnly = args.get('preflight') === 'true';
const runtimeAttestation = readApiRuntimeAttestation(API);
const safetyChecks = loadTestSafetyChecks({
  api: API,
  environment: runtimeEnv,
  argumentsMap: args,
  requireConsent: !preflightOnly,
  requiredUsers: USERS,
  runtimeAttestation,
  requireRuntimeAttestation: true,
});
if (!reportLoadTestSafety(safetyChecks, { preflight: preflightOnly })) process.exit(2);
if (preflightOnly) process.exit(0);

console.log(`[loadtest] target=${API} users=${USERS} duration=${DURATION_MS / 1000}s`);

/* ------------------------------- metrics --------------------------------- */

const latencies = new Map();
const statuses = new Map();
const failures = [];
const workloadLatencies = new Map();
const workloadStatuses = new Map();
let requests = 0;
let startedAt = 0;
let mockSearches = 0;
let workloadActive = false;
let workloadRequests = 0;
let workloadFailures = 0;
let workloadSocketMessages = 0;
let workloadSocketFailures = 0;

function record(endpoint, status, ms, failure) {
  requests += 1;
  const bucket = latencies.get(endpoint) ?? [];
  bucket.push(ms);
  latencies.set(endpoint, bucket);
  statuses.set(String(status), (statuses.get(String(status)) ?? 0) + 1);
  if (failure) failures.push({ endpoint, status, phase: workloadActive ? 'workload' : 'setup', ...failure });
  if (workloadActive) {
    workloadRequests += 1;
    if (failure) workloadFailures += 1;
    const workloadBucket = workloadLatencies.get(endpoint) ?? [];
    workloadBucket.push(ms);
    workloadLatencies.set(endpoint, workloadBucket);
    workloadStatuses.set(String(status), (workloadStatuses.get(String(status)) ?? 0) + 1);
  }
}

function percentile(sorted, p) {
  if (sorted.length === 0) return 0;
  const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, index)];
}

/** Unique virtual IP per user so rate limiting keys on the simulated device. */
function virtualIp(index) {
  return `10.${(index >> 16) & 255}.${(index >> 8) & 255}.${index & 255}`;
}

async function call(path, { method = 'GET', token, body, ip, headers = {} } = {}) {
  const endpoint = `${method} ${path}`;
  const started = performance.now();
  try {
    const response = await fetch(`${API}${path}`, {
      method,
      headers: {
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        'X-Forwarded-For': ip,
        ...headers,
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await response.text();
    let json = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }
    const ms = performance.now() - started;
    const failure =
      response.status >= 400
        ? {
            message: String(json?.error?.message ?? text).slice(0, 160),
            code: json?.error?.code ?? null,
          }
        : null;
    record(endpoint, response.status, ms, failure);
    return { status: response.status, json, ms };
  } catch (error) {
    const ms = performance.now() - started;
    record(endpoint, 0, ms, { message: error.message.slice(0, 160), code: 'NETWORK' });
    return { status: 0, json: null, ms };
  }
}

function socketEvent(socket, event, payload) {
  const started = performance.now();
  return new Promise((resolve) => {
    let settled = false;
    const finish = (accepted) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      const status = accepted ? 200 : 'WS_REJECTED';
      const failure = accepted ? null : { message: 'Socket event was rejected.', code: 'SOCKET_EVENT_REJECTED' };
      record(`WS ${event}`, status, performance.now() - started, failure);
      if (workloadActive) {
        workloadSocketMessages += 1;
        if (!accepted) workloadSocketFailures += 1;
      }
      resolve({ accepted, status });
    };
    const timer = setTimeout(() => finish(false), 5_000);
    socket.emit(event, payload, finish);
  });
}

async function connectSockets(pool) {
  const SOCKET_URL = API.replace(/\/api\/?$/, '');
  const results = await Promise.all(pool.map((account) => new Promise((resolve) => {
    const socket = io(SOCKET_URL, {
      auth: { token: account.token },
      transports: ['websocket'],
      reconnection: false,
      timeout: 8_000,
    });
    socket.once('connect', () => resolve({ account, socket }));
    socket.once('connect_error', () => {
      socket.disconnect();
      resolve({ account, socket: null });
    });
  })));
  const connected = results.filter((result) => result.socket);
  if (connected.length !== pool.length) {
    for (const result of connected) result.socket.disconnect();
    console.error(
      `[loadtest] REFUSING workload: only ${connected.length}/${pool.length} synthetic websocket sessions connected; ` +
        'no virtual-user workload was started.',
    );
    process.exit(1);
  }
  return connected.map((result) => result.socket);
}

/* ----------------------------- login pool -------------------------------- */

const ACCOUNTS = JSON.parse(runtimeEnv.LOAD_TEST_ACCOUNTS_JSON);

async function loginPool() {
  const tokens = [];
  for (const account of ACCOUNTS) {
    const result = await call('/auth/login', {
      method: 'POST',
      body: { email: account.email, password: account.password },
      ip: virtualIp(2000 + tokens.length),
    });
    if (result.status === 200 && result.json?.accessToken) {
      tokens.push({
        id: result.json.user?.id,
        email: account.email,
        role: result.json.user?.role ?? 'CUSTOMER',
        token: result.json.accessToken,
      });
    } else {
      console.log(
        `[loadtest] login skipped for synthetic ${account.role} account: status=${result.status} ` +
          `${result.json?.error?.message ?? ''}`,
      );
    }
  }
  const readyRoles = new Set(tokens.map((account) => account.role));
  if (
    tokens.length < USERS ||
    new Set(tokens.map((account) => account.id)).size < USERS ||
    !hasRequiredRoleMix(tokens, USERS)
  ) {
    console.error(
      `[loadtest] synthetic login pool is incomplete (${tokens.length}/${USERS}); ` +
        'no workload was started.',
    );
    process.exit(1);
  }
  console.log(`[loadtest] login pool ready: ${tokens.length}/${ACCOUNTS.length} accounts`);
  return tokens;
}

/* --------------------------- virtual users -------------------------------- */

const GEOSPOTS = [
  { latitude: 5.5774, longitude: -0.3104 },
  { latitude: 5.6037, longitude: -0.2513 },
  { latitude: 5.5571, longitude: -0.3186 },
  { latitude: 5.6155, longitude: -0.1978 },
];
const SEARCH_TERMS = ['Mallam Junction', 'Gbawe Road', 'Kwashieman', 'Ofankor', 'Achimota'];

const idle = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const jitter = (min, max) => min + Math.random() * (max - min);

const catalogue = { products: [], categories: [] };

async function warmCatalogue(token) {
  const [products, categories] = await Promise.all([
    call('/products?pageSize=12', { token, ip: virtualIp(4001) }),
    call('/categories?pageSize=10', { token, ip: virtualIp(4002) }),
  ]);
  catalogue.products = products.json?.items ?? [];
  catalogue.categories = categories.json?.items ?? [];
}

/** One realistic interaction for a virtual user of the given role. */
async function act(role, token, index, userIndex, socket, context) {
  const ip = virtualIp(userIndex);
  const spot = GEOSPOTS[userIndex % GEOSPOTS.length];
  const roll = Math.random();

  if (role === 'DRIVER') {
    if (roll < 0.5) {
      await call('/driver/deliveries', { token, ip });
    } else if (roll < 0.65) {
      await call('/driver/summary', { token, ip });
    } else if (roll < 0.9) {
      const location = {
          latitude: spot.latitude + Math.random() * 0.01,
          longitude: spot.longitude + Math.random() * 0.01,
          accuracy: 12,
          heading: Math.round(Math.random() * 359),
          speed: 8,
        };
      if (socket?.connected) await socketEvent(socket, 'driver:location', location);
      else await call('/driver/location', { method: 'POST', token, ip, body: location });
    } else {
      await call('/driver/location', { token, ip });
    }
    return;
  }

  if (role === 'KITCHEN') {
    if (roll < 0.6) {
      await call('/kitchen/orders?status=RECEIVED,ACCEPTED,PREPARING,READY', { token, ip });
    } else if (roll < 0.85) {
      await call('/kitchen/summary', { token, ip });
    } else {
      await call('/settings/restaurant-status', { token, ip });
    }
    return;
  }

  if (role === 'ADMIN') {
    if (roll < 0.4) {
      await call('/orders?pageSize=20', { token, ip });
    } else if (roll < 0.6) {
      await call('/analytics/overview', { token, ip });
    } else if (roll < 0.75) {
      await call('/analytics/charts?period=daily', { token, ip });
    } else if (roll < 0.9) {
      await call('/logs?pageSize=50', { token, ip });
    } else {
      await call('/reports/preview', { token, ip });
    }
    return;
  }

  // CUSTOMER traffic: browse, search, order, track.
  if (roll < 0.34) {
    await call('/products?pageSize=12', { token, ip });
  } else if (roll < 0.44) {
    await call('/categories?pageSize=10', { token, ip });
  } else if (roll < 0.54) {
    await call('/orders?pageSize=20', { token, ip });
  } else if (roll < 0.61) {
    if (context.orderId) {
      await call(`/orders/${context.orderId}/tracking`, { token, ip });
      if (socket?.connected) await socketEvent(socket, 'order:subscribe', context.orderId);
    } else {
      await call('/orders/active', { token, ip });
    }
  } else if (roll < 0.7) {
    const term = SEARCH_TERMS[index % SEARCH_TERMS.length];
    const result = await call(`/geo/search?q=${encodeURIComponent(term)}`, { token, ip });
    if (result.status === 200 && JSON.stringify(result.json).includes('Mock address')) {
      mockSearches += 1;
    }
  } else if (roll < 0.76) {
    await call(
      `/geo/check-zone?latitude=${spot.latitude}&longitude=${spot.longitude}`,
      { token, ip },
    );
  } else if (roll < 0.82) {
    const other = GEOSPOTS[(userIndex + 1) % GEOSPOTS.length];
    await call(
      `/geo/directions?fromLatitude=${spot.latitude}&fromLongitude=${spot.longitude}` +
        `&toLatitude=${other.latitude}&toLongitude=${other.longitude}`,
      { token, ip },
    );
  } else if (roll < 0.87) {
    await call('/notifications?pageSize=20', { token, ip });
  } else if (roll < 0.91) {
    await call('/favorites', { token, ip });
  } else if (roll < 0.97) {
    const product = catalogue.products[index % Math.max(1, catalogue.products.length)];
    if (product) {
      const result = await call('/orders', {
        method: 'POST',
        token,
        ip,
        body: {
          items: [{ productId: product.id, quantity: 1 }],
          deliveryAddress: 'Mallam Junction, Gbawe Road, Accra',
          deliveryArea: 'Malam',
          deliveryPhone: '+233201234567',
          paymentMethod: 'CASH',
          deliveryLatitude: spot.latitude,
          deliveryLongitude: spot.longitude,
          deliveryLocationSource: 'search',
          idempotencyKey: randomUUID(),
        },
      });
      if (result.status === 201 && result.json?.order?.id) context.orderId = result.json.order.id;
    }
  } else {
    await call('/settings', { token, ip });
  }
}

async function runVirtualUsers(pool, sockets) {
  let running = true;
  let completed = 0;

  const workers = Array.from({ length: USERS }, async (_value, userIndex) => {
    const account = pool[userIndex % pool.length];
    const socket = sockets[userIndex % sockets.length];
    const context = { orderId: null };
    let iteration = 0;
    // Ramp the users in over ~5s so the test starts like a real session flood.
    await idle(Math.random() * 5_000);
    while (running) {
      iteration += 1;
      await act(account.role, account.token, iteration, userIndex, socket, context);
      completed += 1;
      await idle(jitter(400, 1_400));
    }
  });

  await idle(DURATION_MS);
  running = false;
  await Promise.allSettled(workers);
  return completed;
}

/* -------------------------- database samples ------------------------------ */

async function dbProbe() {
  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();
  try {
    const activity = await client.query(
      "select count(*)::int as n from pg_stat_activity where datname = current_database()",
    );
    const one = performance.now();
    await client.query('select 1');
    const selectOne = performance.now() - one;
    const orders = performance.now();
    await client.query('select count(*) from "Order"');
    const countOrders = performance.now() - orders;
    return {
      connections: activity.rows[0].n,
      select1Ms: Number(selectOne.toFixed(2)),
      countOrdersMs: Number(countOrders.toFixed(2)),
    };
  } finally {
    await client.end();
  }
}

/* --------------------------------- main ----------------------------------- */

const health = await call('/health', { ip: virtualIp(9999) });
if (health.status !== 200) {
  console.error(`[loadtest] API is not healthy (status=${health.status}) - aborting.`);
  process.exit(1);
}
const locationMetricsBefore = health.json?.driverLocationMetrics ?? null;
if (
  health.json?.loadTestSafe !== true || health.json?.mapboxMock !== true ||
  health.json?.loadTestAccountCount < USERS
) {
  console.error(
    '[loadtest] REFUSING to run: API runtime safety attestation is incomplete or account count ' +
      'is below the virtual-user count. One liveness probe was sent; no workload traffic or ' +
      'database probe was generated.',
  );
  process.exit(2);
}

const pool = await loginPool();
await warmCatalogue(pool[0].token);
const sockets = await connectSockets(pool);
console.log(
  `[loadtest] catalogue: ${catalogue.products.length} products, ` +
    `${catalogue.categories.length} categories`,
);

const dbBefore = await dbProbe();
const memoryBefore = process.memoryUsage();
const cpuBefore = process.cpuUsage();
const eventLoop = monitorEventLoopDelay({ resolution: 20 });
eventLoop.enable();

const samples = [];
const sampler = setInterval(() => {
  void dbProbe().then((sample) => samples.push({ at: Date.now(), ...sample })).catch(() => undefined);
}, 10_000);

console.log(`[loadtest] starting ${USERS} virtual users for ${DURATION_MS / 1000}s...`);
startedAt = performance.now();
workloadActive = true;
const completed = await runVirtualUsers(pool, sockets);
workloadActive = false;
const elapsedSec = (performance.now() - startedAt) / 1000;
clearInterval(sampler);
eventLoop.disable();
for (const socket of sockets) socket.disconnect();

const dbAfter = await dbProbe();
const memoryAfter = process.memoryUsage();
const cpuAfter = process.cpuUsage(cpuBefore);
const healthAfter = await call('/health', { ip: virtualIp(9999) });
const locationMetricsAfter = healthAfter.json?.driverLocationMetrics ?? null;

/* -------------------------------- report ---------------------------------- */

const allLatencies = [...workloadLatencies.values()].flat().sort((a, b) => a - b);
const sampleConnections = samples.map((sample) => sample.connections);
const summary = {
  users: USERS,
  durationSeconds: Number(elapsedSec.toFixed(1)),
  iterationsCompleted: completed,
  requests: workloadRequests,
  setupRequests: requests - workloadRequests,
  setupFailures: failures.length - workloadFailures,
  requestsPerSecond: Number((workloadRequests / elapsedSec).toFixed(1)),
  latencyMs: {
    avg: Number(
      (allLatencies.reduce((sum, value) => sum + value, 0) / Math.max(1, allLatencies.length)).toFixed(1),
    ),
    p50: Number(percentile(allLatencies, 50).toFixed(1)),
    p90: Number(percentile(allLatencies, 90).toFixed(1)),
    p95: Number(percentile(allLatencies, 95).toFixed(1)),
    p99: Number(percentile(allLatencies, 99).toFixed(1)),
    max: Number((allLatencies[allLatencies.length - 1] ?? 0).toFixed(1)),
  },
  statusCodes: Object.fromEntries([...workloadStatuses.entries()].sort((a, b) => Number(a[0]) - Number(b[0]))),
  http4xx: [...workloadStatuses.entries()]
    .filter(([status]) => status.startsWith('4'))
    .reduce((sum, [, count]) => sum + count, 0),
  http5xx: [...workloadStatuses.entries()]
    .filter(([status]) => status.startsWith('5'))
    .reduce((sum, [, count]) => sum + count, 0),
  errorRatePercent: Number(((workloadFailures / Math.max(1, workloadRequests)) * 100).toFixed(2)),
  websocket: {
    connectedUsers: sockets.length,
    eventsAcknowledgedOrRejected: workloadSocketMessages,
    rejectedOrTimedOut: workloadSocketFailures,
    eventsPerSecond: Number((workloadSocketMessages / elapsedSec).toFixed(2)),
  },
  cpu: {
    userMs: Number((cpuAfter.user / 1_000).toFixed(1)),
    systemMs: Number((cpuAfter.system / 1_000).toFixed(1)),
  },
  eventLoopDelayMs: {
    mean: Number((eventLoop.mean / 1e6 || 0).toFixed(2)),
    p95: Number((eventLoop.percentile(95) / 1e6 || 0).toFixed(2)),
    max: Number((eventLoop.max / 1e6 || 0).toFixed(2)),
  },
  driverLocation: locationMetricsBefore && locationMetricsAfter
    ? Object.fromEntries(['updates', 'persisted', 'skipped', 'activeDeliveryQueries'].map((key) => [
        key,
        locationMetricsAfter[key] - locationMetricsBefore[key],
      ]))
    : null,
  mockMap: { mockSearchAnswers: mockSearches, confirmedMocked: mockSearches > 0 },
  database: {
    connectionsBefore: dbBefore.connections,
    connectionsAfter: dbAfter.connections,
    connectionsPeak: Math.max(dbAfter.connections, ...sampleConnections),
    select1Ms: [dbBefore.select1Ms, dbAfter.select1Ms],
    countOrdersMs: [dbBefore.countOrdersMs, dbAfter.countOrdersMs],
    samples,
  },
  processMemoryMb: {
    rssAfter: Number((memoryAfter.rss / 1024 / 1024).toFixed(0)),
    heapUsedDeltaMb: Number(
      (((memoryAfter.heapUsed - memoryBefore.heapUsed) / 1024 / 1024) || 0).toFixed(1),
    ),
  },
};

summary.byEndpoint = [...workloadLatencies.entries()]
  .map(([endpoint, values]) => {
    const sorted = [...values].sort((a, b) => a - b);
    return {
      endpoint,
      count: sorted.length,
      p50: Number(percentile(sorted, 50).toFixed(1)),
      p95: Number(percentile(sorted, 95).toFixed(1)),
      p99: Number(percentile(sorted, 99).toFixed(1)),
    };
  })
  .sort((a, b) => b.count - a.count);

summary.failuresSample = failures.filter((failure) => failure.phase === 'workload').slice(0, 25);

console.log('\n================ 500-USER LOAD TEST RESULT ================');
console.log(JSON.stringify(summary, null, 2));
console.log('===========================================================\n');



















