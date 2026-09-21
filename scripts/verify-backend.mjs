#!/usr/bin/env node
/**
 * End-to-end verification of the backend hardening:
 *   1. email + username sign-in against PostgreSQL,
 *   2. support phone read from /api/settings (public),
 *   3. admin-only PATCH /api/settings with immediate propagation,
 *   4. logout invalidates the token instantly.
 *
 * Usage: node scripts/verify-backend.mjs [apiUrl]
 */
const API = (process.argv[2] ?? 'http://127.0.0.1:4000/api').replace(/\/+$/, '');

let pass = 0;
let fail = 0;
function check(condition, name, detail = '') {
  if (condition) {
    pass += 1;
    console.log(`  PASS  ${name}${detail ? ` - ${detail}` : ''}`);
  } else {
    fail += 1;
    console.log(`  FAIL  ${name}${detail ? ` - ${detail}` : ''}`);
  }
}

async function call(path, options = {}) {
  const response = await fetch(`${API}${path}`, {
    method: options.method ?? 'GET',
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
      ...(options.csrf ? { 'x-csrf-token': options.csrf } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  return { status: response.status, data };
}

// 1. Sign in with an email address and with a username.
const adminLogin = await call('/auth/login', {
  method: 'POST',
  body: { email: 'admin@deliverysystem.app', password: 'Admin@12345' },
});
check(adminLogin.status === 200, 'admin signs in with an email address', `status=${adminLogin.status}`);
check(adminLogin.data?.user?.username === 'admin', 'admin account exposes its username', `username=${adminLogin.data?.user?.username}`);

const cashierLogin = await call('/auth/login', {
  method: 'POST',
  body: { email: 'cashier', password: 'Cashier@12345' },
});
check(cashierLogin.status === 200, 'cashier signs in with a username only', `status=${cashierLogin.status}`);
check(cashierLogin.data?.user?.role === 'KITCHEN', 'cashier lands on the operations role', `role=${cashierLogin.data?.user?.role}`);

const wrongPassword = await call('/auth/login', {
  method: 'POST',
  body: { email: 'cashier', password: 'not-my-password' },
});
check(wrongPassword.status === 401, 'wrong password is rejected', `status=${wrongPassword.status}`);

// 2. Public support block comes from the database.
const supportBefore = await call('/settings/support');
check(supportBefore.status === 200, 'public support endpoint answers without a token', `status=${supportBefore.status}`);
const originalPhone = supportBefore.data?.support?.supportPhone;
check(Boolean(originalPhone), 'support phone is served from the database', `phone=${originalPhone}`);

// 3. Only an admin may change settings, and the change is live immediately.
const anonymousPatch = await call('/settings', { method: 'PATCH', body: { supportPhone: '+233 24 000 0000' } });
check(anonymousPatch.status === 401, 'anonymous PATCH /settings is rejected', `status=${anonymousPatch.status}`);

const cashierPatch = await call('/settings', {
  method: 'PATCH',
  body: { supportPhone: '+233 24 000 0000' },
  token: cashierLogin.data?.accessToken,
});
check(cashierPatch.status === 403, 'non-admin PATCH /settings is rejected', `status=${cashierPatch.status}`);

const invalidPhone = await call('/settings', {
  method: 'PATCH',
  body: { supportPhone: 'nope' },
  token: adminLogin.data?.accessToken,
});
check(invalidPhone.status === 400, 'invalid support phone is rejected', `status=${invalidPhone.status}`);

const updated = await call('/settings', {
  method: 'PATCH',
  body: { supportPhone: '+233 24 555 0100' },
  token: adminLogin.data?.accessToken,
});
check(updated.status === 200, 'admin updates the support phone', `status=${updated.status}`);
check(updated.data?.settings?.supportPhone === '+233 24 555 0100', 'PATCH response carries the new phone');

const supportAfter = await call('/settings/support');
check(
  supportAfter.data?.support?.supportPhone === '+233 24 555 0100',
  'public support endpoint reflects the change immediately (no redeploy)',
  `phone=${supportAfter.data?.support?.supportPhone}`,
);

const reverted = await call('/settings', {
  method: 'PATCH',
  body: { supportPhone: originalPhone },
  token: adminLogin.data?.accessToken,
});
check(reverted.data?.settings?.supportPhone === originalPhone, 'support phone restored for local runs');

// 4. Logout kills the session immediately.
const meBefore = await call('/auth/me', { token: cashierLogin.data?.accessToken });
check(meBefore.status === 200, 'token works before signing out', `status=${meBefore.status}`);

const logout = await call('/auth/logout', {
  method: 'POST',
  token: cashierLogin.data?.accessToken,
  csrf: cashierLogin.data?.csrfToken,
});
check(logout.status === 200, 'logout succeeds', `status=${logout.status}`);

const meAfter = await call('/auth/me', { token: cashierLogin.data?.accessToken });
check(meAfter.status === 401, 'token is dead immediately after logout', `status=${meAfter.status}`);

console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
