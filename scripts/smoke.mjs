#!/usr/bin/env node
/**
 * End-to-end smoke test against the running API (http://localhost:4000)
 * and the running web server (http://localhost:5173).
 *
 *   node scripts/smoke.mjs
 *
 * Exercises: health, auth (login/me/refresh), catalogue, cart -> checkout ->
 * order lifecycle, kitchen queue + status transitions, receipts, admin CRUD,
 * analytics, reports, settings, logs, notifications, favorites, realtime and
 * the PWA assets served by the web app.
 */
const BASE = process.env.SMOKE_BASE_URL ?? 'http://localhost:4000/api';
const WEB = process.env.SMOKE_WEB_URL ?? 'http://localhost:5173';

let pass = 0;
let fail = 0;
const failures = [];

function ok(name, detail = '') {
  pass += 1;
  console.log(`  + ${name}${detail ? ` -- ${detail}` : ''}`);
}

function bad(name, detail = '') {
  fail += 1;
  failures.push(`${name}${detail ? ` -- ${detail}` : ''}`);
  console.log(`  x ${name}${detail ? ` -- ${detail}` : ''}`);
}

async function req(method, path, { token, body, raw } = {}) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  return { status: res.status, json, text, headers: res.headers, raw };
}

async function check(name, fn) {
  try {
    const detail = await fn();
    ok(name, typeof detail === 'string' ? detail : '');
  } catch (err) {
    bad(name, err.message);
  }
}

function expectStatus(res, expected, label) {
  const allowed = Array.isArray(expected) ? expected : [expected];
  if (!allowed.includes(res.status)) {
    throw new Error(
      `${label}: expected ${allowed.join('/')} got ${res.status} :: ${String(res.text).slice(0, 220)}`,
    );
  }
}

function expect(cond, msg) {
  if (!cond) throw new Error(msg);
}

const section = (t) => console.log(`\n=== ${t} ===`);

function listOf(res) {
  return res.json?.items ?? res.json?.data?.items ?? res.json?.data ?? res.json;
}

function entityOf(res) {
  return res.json?.item ?? res.json?.data?.item ?? res.json?.data ?? res.json;
}

async function main() {
  console.log(`Smoke testing API ${BASE}\nSmoke testing WEB ${WEB}\n`);

  /* ------------------------------------------------------------------ */
  section('health');
  await check('GET /health', async () => {
    const res = await req('GET', '/health');
    expectStatus(res, 200, '/health');
    expect(res.json?.status === 'ok', 'status not ok');
    return `uptime ${res.json?.uptimeSeconds}s`;
  });

  /* ------------------------------------------------------------------ */
  section('auth');
  const accounts = [
    { label: 'admin', email: 'admin@delivery.test', password: 'Admin123!' },
    { label: 'customer', email: 'customer@delivery.test', password: 'Customer123!' },
    { label: 'kitchen', email: 'kitchen@delivery.test', password: 'Kitchen123!' },
  ];
  const tokens = {};

  for (const acct of accounts) {
    await check(`POST /auth/login (${acct.label})`, async () => {
      const res = await req('POST', '/auth/login', {
        body: { email: acct.email, password: acct.password },
      });
      expectStatus(res, 200, 'login');
      const token = res.json?.accessToken ?? res.json?.token ?? res.json?.data?.accessToken;
      expect(token, `no access token: ${String(res.text).slice(0, 200)}`);
      const user = res.json?.user ?? res.json?.data?.user;
      tokens[acct.label] = token;
      return `role=${user?.role ?? '?'}`;
    });
  }

  await check('POST /auth/refresh', async () => {
    const res = await req('POST', '/auth/login', {
      body: { email: accounts[0].email, password: accounts[0].password },
    });
    const refreshToken =
      res.json?.refreshToken ?? res.json?.data?.refreshToken ?? res.json?.session?.refreshToken;
    if (!refreshToken) return 'no refresh token issued (skipped)';
    const r2 = await req('POST', '/auth/refresh', { body: { refreshToken } });
    expectStatus(r2, 200, 'refresh');
    return 'rotated';
  });

  await check('GET /auth/me', async () => {
    const res = await req('GET', '/auth/me', { token: tokens.admin });
    expectStatus(res, 200, '/auth/me');
    const u = entityOf(res);
    return `email=${u?.email ?? '?'}`;
  });

  await check('GET /auth/me rejects anonymous', async () => {
    const res = await req('GET', '/auth/me');
    expect(res.status === 401 || res.status === 403, `expected 401/403 got ${res.status}`);
    return `status ${res.status}`;
  });