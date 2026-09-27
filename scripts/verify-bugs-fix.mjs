#!/usr/bin/env node
/**
 * Live verification for the two production bug fixes:
 *
 *  BUG 1 — Kitchen -> Backend -> Database -> Driver real-time sync:
 *    a driver socket connected BEFORE the kitchen acts must receive the
 *    order:updated event (and the driver notification) the moment the kitchen
 *    dispatches, and a fresh GET /driver/available must list the order with no
 *    manual refresh. Existing claim/complete behaviour must keep working.
 *
 *  BUG 2 — Login & autofill:
 *    the same backend endpoint signs in with Email + Password OR Username +
 *    Password, bad credentials are rejected, a brand-new account can be
 *    registered and signed back in (credentials persisted), and every
 *    auth form (page + popup/modal) carries the standard type/name/autocomplete
 *    attributes in identifier-then-password order.
 *
 * Every step is a real HTTP/socket call against the running API — nothing stubbed.
 *
 * Usage: node scripts/verify-bugs-fix.mjs [apiUrl]
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { io } from 'socket.io-client';

const API = (process.argv[2] ?? 'http://127.0.0.1:4000/api').replace(/\/+$/, '');
const SOCKET_URL = API.replace(/\/api$/, '');
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

let pass = 0;
let fail = 0;
const failures = [];

function check(condition, name, detail = '') {
  if (condition) {
    pass += 1;
    console.log(`  PASS  ${name}${detail ? ` - ${detail}` : ''}`);
  } else {
    fail += 1;
    failures.push(name);
    console.log(`  FAIL  ${name}${detail ? ` - ${detail}` : ''}`);
  }
}

async function call(path, options = {}) {
  const response = await fetch(`${API}${path}`, {
    method: options.method ?? 'GET',
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
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

const login = async (identifier, password, { expectOk = true } = {}) => {
  const res = await call('/auth/login', { method: 'POST', body: { email: identifier, password } });
  if (expectOk && res.status !== 200) {
    throw new Error(`login failed for ${identifier}: ${res.status} ${JSON.stringify(res.data)}`);
  }
  return { status: res.status, token: res.data?.accessToken, user: res.data?.user, data: res.data };
};

const list = (payload) => payload?.items ?? payload?.data ?? payload?.orders ?? [];
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/* -------------------------------------------------------------------------- */
/* BUG 2 — authentication: username OR email, credential persistence           */
/* -------------------------------------------------------------------------- */
console.log('\n=== BUG 2a. LOGIN WITH EMAIL OR USERNAME (same backend) ===');
const emailLogin = await login('driver@deliverysystem.app', 'Driver@12345', { expectOk: false });
check(emailLogin.status === 200, 'Email + Password signs in', `status=${emailLogin.status}`);
check(Boolean(emailLogin.token), 'access token issued for email login');

const usernameLogin = await login('driver', 'Driver@12345', { expectOk: false });
check(usernameLogin.status === 200, 'Username + Password signs in via the same endpoint', `status=${usernameLogin.status}`);
check(
  usernameLogin.user?.id === emailLogin.user?.id,
  'both identifiers resolve to the SAME account',
  `${usernameLogin.user?.id} vs ${emailLogin.user?.id}`,
);
check(usernameLogin.user?.role === 'DRIVER', 'role survives identifier switching', `role=${usernameLogin.user?.role}`);

const badPassword = await login('driver', 'WrongPassword1', { expectOk: false });
check(badPassword.status === 401, 'wrong password is rejected', `status=${badPassword.status}`);
const unknownUser = await login('no-such-user-xyz', 'Whatever123', { expectOk: false });
check(unknownUser.status === 401, 'unknown identifier is rejected', `status=${unknownUser.status}`);

console.log('\n=== BUG 2b. NEW ACCOUNT CREATION SAVES CREDENTIALS ===');
const stamp = Date.now();
const newEmail = `bugfix.verify.${stamp}@example.com`;
const newPassword = 'Verify@12345';
const registerRes = await call('/auth/register', {
  method: 'POST',
  body: { name: 'Bugfix Verify', email: newEmail, phone: '+233201112233', password: newPassword },
});
check(
  registerRes.status === 201,
  'signup creates the account',
  `status=${registerRes.status} ${JSON.stringify(registerRes.data).slice(0, 160)}`,
);
const relogin = await login(newEmail, newPassword, { expectOk: false });
check(relogin.status === 200, 'password-manager style re-login with saved credentials works', `status=${relogin.status}`);
check(relogin.user?.email === newEmail, 'new account profile round-trips', `email=${relogin.user?.email}`);
const dupe = await call('/auth/register', {
  method: 'POST',
  body: { name: 'Bugfix Verify', email: newEmail, phone: '+233201112233', password: newPassword },
});
check(dupe.status === 409, 'duplicate signup is refused (no silent credential overwrite)', `status=${dupe.status}`);

/* -------------------------------------------------------------------------- */
/* BUG 2 — static audit of every auth form's autofill attributes               */
/* -------------------------------------------------------------------------- */
console.log('\n=== BUG 2c. FORM ATTRIBUTES (type / name / id / autocomplete) ===');
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');

/** Asserts identifier-then-password order, correct types and autocomplete tokens. */
function auditLoginForm(rel, { idPrefix }) {
  const src = read(rel);
  const identifierAt = src.indexOf('autoComplete="username"');
  const passwordAt = src.indexOf('autoComplete="current-password"');

  check(src.includes('<form') && src.includes('autoComplete="on"'), `${rel}: form is autofill-enabled`);
  check(identifierAt > -1, `${rel}: identifier field uses autoComplete="username"`);
  check(passwordAt > -1, `${rel}: password field uses autoComplete="current-password"`);
  check(
    identifierAt > -1 && passwordAt > -1 && identifierAt < passwordAt,
    `${rel}: identifier comes BEFORE password (password managers fill in order)`,
  );
  check(
    src.includes(`id="${idPrefix}-identifier"`) && src.includes(`id="${idPrefix}-password"`),
    `${rel}: stable distinct ids for both fields`,
  );
  check(/name="username"/.test(src), `${rel}: identifier name="username"`);
  check(/name="password"/.test(src), `${rel}: password name="password"`);
  // The identifier must be a text field (accepts email OR username), never type=email
  // (which blocks username sign-in) and never type=password (which swaps the two).
  const identifierBlock =
    identifierAt > -1 ? src.slice(src.lastIndexOf('<Input', identifierAt), src.indexOf('/>', identifierAt)) : '';
  check(identifierBlock.includes('type="text"'), `${rel}: identifier is type="text" (email OR username accepted)`);
  check(!identifierBlock.includes('type="password"'), `${rel}: identifier is never type="password"`);
  const passwordBlock =
    passwordAt > -1 ? src.slice(src.lastIndexOf('<Input', passwordAt), src.indexOf('/>', passwordAt)) : '';
  check(passwordBlock.includes('type="password"'), `${rel}: password is type="password"`);
  check(
    passwordBlock.includes('type="password"') && !passwordBlock.includes('autoComplete="email"'),
    `${rel}: password never carries the email autocomplete token`,
  );
}

auditLoginForm('apps/web/src/pages/Login.tsx', { idPrefix: 'login' });
auditLoginForm('apps/web/src/components/AuthSheet.tsx', { idPrefix: 'authsheet' });

{
  const rel = 'apps/web/src/pages/Register.tsx';
  const src = read(rel);
  const emailAt = src.indexOf('autoComplete="email"');
  const pwAt = src.indexOf('autoComplete="new-password"');
  check(emailAt > -1, `${rel}: email field uses autoComplete="email"`);
  check(/type="email"/.test(src) && /name="email"/.test(src), `${rel}: email field type="email" name="email"`);
  check(pwAt > -1, `${rel}: password field uses autoComplete="new-password"`);
  check(
    src.slice(src.lastIndexOf('<Input', pwAt), src.indexOf('/>', pwAt)).includes('type="password"'),
    `${rel}: password is type="password"`,
  );
  check(emailAt > -1 && pwAt > -1 && emailAt < pwAt, `${rel}: password field comes AFTER the identity fields`);
  check(/autoComplete="name"/.test(src) && /autoComplete="tel"/.test(src), `${rel}: name and phone carry their own autocomplete tokens`);
}

/* -------------------------------------------------------------------------- */
/* BUG 1 — kitchen -> backend -> database -> driver, in real time              */
/* -------------------------------------------------------------------------- */
console.log('\n=== BUG 1a. SESSIONS + DRIVER SOCKET (connected BEFORE dispatch) ===');
const customerToken = (await login('customer@deliverysystem.app', 'Customer@12345')).token;
const kitchenToken = (await login('kitchen@deliverysystem.app', 'Kitchen@12345')).token;
const driverToken = (await login('driver@deliverysystem.app', 'Driver@12345')).token;
check(Boolean(customerToken && kitchenToken && driverToken), 'all three roles sign in');

const events = { orderUpdated: [], notifications: [] };
const socket = io(SOCKET_URL, {
  auth: { token: driverToken },
  transports: ['websocket', 'polling'],
  reconnection: false,
  timeout: 8000,
});
socket.on('order:updated', (payload) => events.orderUpdated.push({ at: Date.now(), payload }));
socket.on('notification:new', (payload) => events.notifications.push({ at: Date.now(), payload }));
socket.on('connect_error', (err) => console.log(`        socket connect_error: ${err.message}`));

const connected = await new Promise((resolve) => {
  const timer = setTimeout(() => resolve(false), 8000);
  socket.on('connect', () => {
    clearTimeout(timer);
    resolve(true);
  });
});
check(connected, 'driver socket connects and authenticates', `id=${socket.id}`);

console.log('\n=== BUG 1b. PLACE AN ORDER AND DISPATCH IT FROM THE KITCHEN ===');
const products = await call('/products', { token: customerToken });
const product = list(products.data).find((p) => p.isAvailable && !p.isArchived) ?? list(products.data)[0];
check(Boolean(product?.id), 'menu has a product to order', `product=${product?.name}`);

const created = await call('/orders', {
  method: 'POST',
  token: customerToken,
  body: {
    items: [{ productId: product.id, quantity: 1, notes: 'Realtime sync check' }],
    deliveryAddress: 'Malam Junction, Gbawe Road, Accra',
    deliveryArea: 'Malam',
    deliveryPhone: '+233201234567',
    notes: 'Verification order for kitchen -> driver sync',
    paymentMethod: 'CASH',
    deliveryLatitude: 5.5764,
    deliveryLongitude: -0.2902,
  },
});
check(created.status === 200 || created.status === 201, 'customer places an order', `status=${created.status}`);
const orderId = created.data?.order?.id;
const orderNumber = created.data?.order?.orderNumber;
check(Boolean(orderId), 'order persisted by the backend', `order=${orderNumber}`);

const kitchenQueue = await call('/kitchen/orders?status=RECEIVED', { token: kitchenToken });
check(list(kitchenQueue.data).some((o) => o.id === orderId), 'order reached the kitchen queue (database sync)');

const step = (path) => call(`/kitchen/orders/${orderId}/${path}`, { method: 'POST', body: { note: 'ok' }, token: kitchenToken });
const acceptRes = await step('accept');
check(acceptRes.status === 200, 'kitchen accepts the order', `status=${acceptRes.status}`);
const servingRes = await step('preparing');
check(servingRes.status === 200, 'kitchen starts serving', `status=${servingRes.status}`);

const dispatchStartedAt = Date.now();
const dispatchRes = await step('dispatch');
check(
  dispatchRes.status === 200 && dispatchRes.data?.order?.status === 'OUT_FOR_DELIVERY',
  'kitchen marks OUT FOR DELIVERY (Ready for delivery)',
  `status=${dispatchRes.status}`,
);


console.log('\n=== BUG 1c. DRIVER RECEIVES IT IMMEDIATELY (no refresh) ===');
/** Waits up to `ms` for a predicate over an event list; returns the matching event. */
async function waitFor(listRef, predicate, ms) {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    const hit = listRef.find(predicate);
    if (hit) return hit;
    await sleep(50);
  }
  return null;
}

const ofdEvent = await waitFor(
  events.orderUpdated,
  (e) => e.payload?.order?.id === orderId && e.payload?.order?.status === 'OUT_FOR_DELIVERY',
  5000,
);
check(Boolean(ofdEvent), 'driver socket got order:updated = OUT_FOR_DELIVERY without any refresh');
check(
  ofdEvent ? ofdEvent.at - dispatchStartedAt <= 3000 : false,
  'event delivered within 3 seconds of the kitchen action',
  ofdEvent ? `${ofdEvent.at - dispatchStartedAt} ms` : 'never',
);

const driverNotif = await waitFor(
  events.notifications,
  (e) =>
    e.payload?.notification?.orderId === orderId ||
    String(e.payload?.notification?.title ?? '').includes(orderNumber ?? ' '),
  5000,
);
check(
  Boolean(driverNotif),
  'driver also receives the "New delivery" push notification',
  driverNotif?.payload?.notification?.title ?? '',
);

const pool = await call('/driver/available', { token: driverToken });
check(
  pool.status === 200 && list(pool.data).some((o) => o.id === orderId),
  'a fresh GET /driver/available lists the new order',
  `pool=${list(pool.data).length}`,
);

const earlierStatuses = events.orderUpdated.filter(
  (e) => e.payload?.order?.id === orderId && e.payload?.order?.status !== 'OUT_FOR_DELIVERY',
);
console.log(
  `        info: driver socket also saw ${earlierStatuses.length} earlier transition event(s): ${earlierStatuses.map((e) => e.payload.order.status).join(', ') || 'none'}`,
);

console.log('\n=== BUG 1d. EXISTING DRIVER FLOW STILL WORKS ===');
const accept = await call(`/driver/deliveries/${orderId}/accept`, { method: 'POST', token: driverToken });
check(accept.status === 200, 'driver claims the delivery', `status=${accept.status}`);
const afterClaim = await call('/driver/available', { token: driverToken });
check(!list(afterClaim.data).some((o) => o.id === orderId), 'claimed order leaves the open pool');
const mine = await call('/driver/deliveries?status=ACCEPTED,PREPARING,READY,OUT_FOR_DELIVERY', { token: driverToken });
check(list(mine.data).some((o) => o.id === orderId), 'claimed order appears in the driver Active tab');
const complete = await call(`/driver/deliveries/${orderId}/complete`, { method: 'POST', token: driverToken });
check(
  complete.status === 200 && complete.data?.data?.status === 'DELIVERED',
  'driver completes the delivery',
  `status=${complete.status}`,
);
const history = await call('/driver/deliveries?status=DELIVERED', { token: driverToken });
check(list(history.data).some((o) => o.id === orderId), 'completed delivery stays in driver history');

// The claim/complete flow above must also have streamed to the socket.
const deliveredEvent = await waitFor(
  events.orderUpdated,
  (e) => e.payload?.order?.id === orderId && e.payload?.order?.status === 'DELIVERED',
  3000,
);
check(Boolean(deliveredEvent), 'driver socket keeps streaming follow-up status changes');

socket.disconnect();

console.log('\n----------------------------------------');
console.log(`PASSED ${pass} / ${pass + fail}`);
if (fail > 0) {
  console.log('FAILED CHECKS:');
  for (const name of failures) console.log(`  - ${name}`);
  process.exitCode = 1;
}

