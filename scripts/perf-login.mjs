#!/usr/bin/env node
/**
 * Local performance harness for the authentication endpoints.
 *
 * It creates two throw-away accounts in the database named by DATABASE_URL:
 *   perf.legacy@test.local -> bcrypt cost 12 (the work factor used before this change)
 *   perf.fast@test.local   -> bcrypt cost 10 (the configured default)
 * and then times POST /api/auth/login and POST /api/auth/logout for both, so the
 * before/after numbers come from the same machine and the same database.
 *
 * Usage: node scripts/perf-login.mjs [apiUrl]
 */
import bcrypt from 'bcryptjs';
import { Client } from 'pg';

const API = (process.argv[2] ?? 'http://127.0.0.1:4000/api').replace(/\/+$/, '');
const PASSWORD = 'Perf@12345';
const connectionString =
  process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@127.0.0.1:5433/delivery_system';
const ROUNDS = [1, 2, 3];

const CASES = [
  { email: 'perf.legacy@test.local', rounds: 12 },
  { email: 'perf.fast@test.local', rounds: 10 },
];

const { hostname, port, pathname } = new URL(connectionString);
console.log(`[perf] database ${hostname}:${port}${pathname} | api ${API}`);

const client = new Client({ connectionString });
await client.connect();
try {
  for (const testCase of CASES) {
    const hash = await bcrypt.hash(PASSWORD, testCase.rounds);
    await client.query(
      `insert into "User" (id, name, email, username, "passwordHash", role, "isActive", "isProtected", "createdAt", "updatedAt")
       values ($1, $2, $3, null, $4, 'CUSTOMER', true, false, now(), now())
       on conflict (email) do update set "passwordHash" = excluded."passwordHash", "isActive" = true`,
      [`perf-${testCase.rounds}`, `Perf cost ${testCase.rounds}`, testCase.email, hash],
    );
    testCase.hash = hash;
  }

  for (const testCase of CASES) {
    const cost = Number.parseInt(testCase.hash.slice(4, 6), 10);
    const loginTimes = [];
    let lastTokens = null;

    for (const _run of ROUNDS) {
      const startedAt = performance.now();
      const response = await fetch(`${API}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: testCase.email, password: PASSWORD, rememberMe: false }),
      });
      const elapsed = performance.now() - startedAt;
      if (!response.ok) throw new Error(`login failed (${response.status}) for ${testCase.email}`);
      lastTokens = await response.json();
      loginTimes.push(Math.round(elapsed));
    }

    const startedAt = performance.now();
    const logoutResponse = await fetch(`${API}/auth/logout`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${lastTokens.accessToken}`,
        ...(lastTokens.csrfToken ? { 'x-csrf-token': lastTokens.csrfToken } : {}),
      },
    });
    const logoutMs = Math.round(performance.now() - startedAt);
    if (!logoutResponse.ok) throw new Error(`logout failed (${logoutResponse.status})`);

    console.log(
      `[perf] cost ${cost}: login ${loginTimes.join('/')} ms | logout ${logoutMs} ms | role=${lastTokens.user.role} username=${lastTokens.user.username ?? '-'}`,
    );
  }
} finally {
  await client.end();
}
