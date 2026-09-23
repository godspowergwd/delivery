// End-to-end verification of the running DELIVERY SYSTEM stack.
// Usage: node scripts/e2e.mjs
const API = process.env.API_URL || 'http://localhost:4000/api';
const WEB = process.env.WEB_URL || 'http://localhost:5173';

let pass = 0;
let fail = 0;
const failures = [];

function ok(name, detail = '') {
  pass++;
  console.log(`  PASS  ${name}${detail ? ' - ' + detail : ''}`);
}
function bad(name, detail = '') {
  fail++;
  failures.push(`${name}${detail ? ' - ' + detail : ''}`);
  console.log(`  FAIL  ${name}${detail ? ' - ' + detail : ''}`);
}
function check(cond, name, detail = '') {
  if (cond) ok(name, detail);
  else bad(name, detail);
  return !!cond;
}

async function req(path, { method = 'GET', token, body } = {}) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(API + path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  return { status: res.status, data, text };
}

function un(data) {
  if (data && typeof data === 'object' && !Array.isArray(data) && 'data' in data) {
    return data.data;
  }
  return data;
}

function listOf(data) {
  const d = un(data);
  if (Array.isArray(d)) return d;
  if (!d || typeof d !== 'object') return [];
  const keys = [
    'items', 'orders', 'products', 'categories', 'users', 'logs', 'results',
    'receipts', 'addresses', 'notifications', 'reports', 'sessions', 'favorites',
  ];
  for (const k of keys) {
    if (Array.isArray(d[k])) return d[k];
  }
  return [];
}

function tokenOf(res) {
  const d = res.data || {};
  return (
    d.accessToken ||
    d.token ||
    (d.data && (d.data.accessToken || d.data.token)) ||
    (d.tokens && (d.tokens.accessToken || d.tokens.access_token)) ||
    null
  );
}

const section = (t) => console.log(`\n=== ${t} ===`);

const ACCOUNTS = {
  admin: { email: 'admin@deliverysystem.app', password: 'Admin@12345' },
  kitchen: { email: 'kitchen@deliverysystem.app', password: 'Kitchen@12345' },
  customer: { email: 'customer@deliverysystem.app', password: 'Customer@12345' },
  driver: { email: 'driver@deliverysystem.app', password: 'Driver@12345' },
};

// ---------------------------------------------------------------------------
// 1. Health
// ---------------------------------------------------------------------------
async function testHealth() {
  section('1. HEALTH');
  const r = await req('/health');
  check(r.status === 200, 'GET /api/health returns 200', `status=${r.status}`);
  const d = un(r.data) || {};
  check(d.status === 'ok' || d.uptimeSeconds !== undefined, 'health payload reports status=ok');
}

// ---------------------------------------------------------------------------
// 2. Authentication + RBAC
// ---------------------------------------------------------------------------
async function login(role) {
  const a = ACCOUNTS[role];
  const r = await req('/auth/login', {
    method: 'POST',
    body: { email: a.email, password: a.password },
  });
  return { res: r, token: tokenOf(r) };
}

async function testAuth(ctx) {
  section('2. AUTHENTICATION');

  for (const role of ['admin', 'kitchen', 'customer']) {
    const { res, token } = await login(role);
    check(res.status === 200 && !!token, `POST /auth/login (${role}) authenticates`, `status=${res.status}`);
    if (!token) continue;
    ctx.tokens[role] = token;

    const me = await req('/auth/me', { token });
    check(me.status === 200, `GET /auth/me (${role}) returns 200`, `status=${me.status}`);
    const u = un(me.data) || {};
    const userRole = u.role || (u.user && u.user.role);
    check(
      userRole === role.toUpperCase(),
      `GET /auth/me (${role}) reports role=${role.toUpperCase()}`,
      `got=${userRole}`,
    );
  }

  const bad = await req('/auth/login', {
    method: 'POST',
    body: { email: ACCOUNTS.admin.email, password: 'definitely-wrong' },
  });
  check(bad.status === 401 || bad.status === 400, 'POST /auth/login rejects bad password', `status=${bad.status}`);

  const cfg = await req('/auth/config');
  check(cfg.status === 200, 'GET /auth/config returns public auth config', `status=${cfg.status}`);

  const noToken = await req('/orders');
  check(noToken.status === 401, 'GET /orders without token is rejected (401)', `status=${noToken.status}`);
}

// ---------------------------------------------------------------------------
// 3. Catalogue (categories + products)
// ---------------------------------------------------------------------------
async function testCatalogue(ctx) {
  section('3. CATALOGUE');

  const cats = await req('/categories');
  check(cats.status === 200, 'GET /categories returns 200', `status=${cats.status}`);
  const catList = listOf(cats.data);
  check(catList.length > 0, 'seeded categories present', `count=${catList.length}`);
  ctx.categoryId = catList[0] && (catList[0].id || catList[0]._id);

  const prods = await req('/products?page=1&limit=50');
  check(prods.status === 200, 'GET /products returns 200', `status=${prods.status}`);
  const prodList = listOf(prods.data);
  check(prodList.length > 0, 'seeded products present', `count=${prodList.length}`);
  ctx.products = prodList;

  const first =
    prodList.find((p) => p && (p.isAvailable === undefined || p.isAvailable === true)) || prodList[0];
  if (first) {
    ctx.productId = first.id || first._id;
    ctx.productPrice = Number(first.price ?? first.basePrice ?? 0);
    const one = await req(`/products/${ctx.productId}`);
    check(one.status === 200, 'GET /products/:id returns 200', `status=${one.status}`);
  } else {
    bad('seeded products present (need at least one to continue)');
  }

  if (ctx.categoryId) {
    const byCat = await req(`/products?categoryId=${ctx.categoryId}`);
    check(byCat.status === 200, 'GET /products?categoryId filters by category', `status=${byCat.status}`);
  }

  const search = await req('/products?search=' + encodeURIComponent('a'));
  check(search.status === 200, 'GET /products?search performs text search', `status=${search.status}`);
}
// ---------------------------------------------------------------------------
// 4. Customer order lifecycle
// ---------------------------------------------------------------------------
async function testCustomerFlow(ctx) {
  section('4. CUSTOMER ORDER FLOW (create -> kitchen -> deliver)');

  const customer = ctx.tokens.customer;
  const kitchen = ctx.tokens.kitchen;

  const addrs = await req('/addresses', { token: customer });
  check(addrs.status === 200, 'GET /addresses returns 200', `status=${addrs.status}`);
  const addrList = listOf(addrs.data);
  ctx.addressId = addrList[0] && (addrList[0].id || addrList[0]._id);

  if (!ctx.productId) {
    bad('cannot create order: no product available');
    return;
  }

  const fixture = await req('/products', {
    method: 'POST', token: ctx.tokens.admin,
    body: {
      name: `E2E Lifecycle ${Date.now()}`, description: 'Isolated lifecycle test product',
      price: 9.99, categoryId: ctx.categoryId, isAvailable: true, stock: 20,
    },
  });
  const product = un(fixture.data) || {};
  ctx.fixtureProductId = product.id || product.product?.id;
  check(fixture.status === 201 && !!ctx.fixtureProductId,
    'creates isolated stocked lifecycle product', `status=${fixture.status}`);
  if (!ctx.fixtureProductId) return;

  const orderBody = {
    items: [{ productId: ctx.fixtureProductId, quantity: 2 }],
    deliveryAddress: '12 E2E Test Avenue, Unit 4',
    deliveryArea: 'Test District',
    deliveryPhone: '+15550100',
    notes: 'e2e automated order',
    paymentMethod: 'CASH',
  };

  const created = await req('/orders', { method: 'POST', token: customer, body: orderBody });
  check(
    created.status === 200 || created.status === 201,
    'POST /orders creates an order',
    `status=${created.status}${created.status >= 400 ? ' body=' + String(created.text).slice(0, 200) : ''}`,
  );

  const order = un(created.data) || {};
  ctx.orderId = order.id || order._id || (order.order && order.order.id);
  ctx.orderNumber = order.orderNumber || (order.order && order.order.orderNumber);

  if (!ctx.orderId) {
    bad('created order did not return an id - skipping lifecycle');
    return;
  }
  ok('order id returned', String(ctx.orderId));

  const mine = await req('/orders', { token: customer });
  check(mine.status === 200, 'GET /orders (customer) returns 200', `status=${mine.status}`);
  check(listOf(mine.data).length > 0, 'customer order list is non-empty');

  const one = await req(`/orders/${ctx.orderId}`, { token: customer });
  check(one.status === 200, 'GET /orders/:id returns 200', `status=${one.status}`);
  const detail = un(one.data) || {};
  const items = detail.items || (detail.order && detail.order.items);
  check(Array.isArray(items) && items.length > 0, 'order detail includes line items');

  const active = await req('/orders/active', { token: customer });
  check(active.status === 200, 'GET /orders/active returns 200', `status=${active.status}`);

  if (ctx.orderNumber) {
    const track = await req(`/orders/track/${ctx.orderNumber}`, { token: customer });
    check(track.status === 200, 'GET /orders/track/:orderNumber returns 200 (authenticated)', `status=${track.status}`);
  }
}
// ---------------------------------------------------------------------------
// 5. Kitchen queue + status lifecycle
// ---------------------------------------------------------------------------
async function testKitchenFlow(ctx) {
  section('5. KITCHEN QUEUE + STATUS LIFECYCLE');
  const kitchen = ctx.tokens.kitchen;

  const ksum = await req('/kitchen/summary', { token: kitchen });
  check(ksum.status === 200, 'GET /kitchen/summary returns 200', `status=${ksum.status}`);

  const korders = await req('/kitchen/orders', { token: kitchen });
  check(korders.status === 200, 'GET /kitchen/orders returns 200', `status=${korders.status}`);
  const kList = listOf(korders.data);
  check(kList.length > 0, 'kitchen queue is non-empty', `count=${kList.length}`);

  if (!ctx.orderId) {
    bad('cannot advance lifecycle: this run did not create an order');
    return;
  }
  // Never mutate an unrelated order, even if the queue is paginated.
  const oid = ctx.orderId;
  ctx.kitchenOrderId = oid;

  const detail = await req(`/kitchen/orders/${oid}`, { token: kitchen });
  check(detail.status === 200, 'GET /kitchen/orders/:id returns 200', `status=${detail.status}`);

  const steps = ['accept', 'preparing', 'dispatch'];
  for (const action of steps) {
    const r = await req(`/kitchen/orders/${oid}/${action}`, { method: 'POST', token: kitchen });
    const okay = r.status === 200 || r.status === 201;
    check(
      okay,
      `POST /kitchen/orders/:id/${action} advances the order`,
      `status=${r.status}${r.status >= 400 ? ' body=' + String(r.text).slice(0, 160) : ''}`,
    );
    if (!okay) break;
  }

  const after = await req(`/kitchen/orders/${oid}`, { token: kitchen });
  const d = un(after.data) || {};
  const st = d.status || (d.order && d.order.status);
  check(st === 'DELIVERED', 'created order reaches DELIVERED', `status=${st}`);
  ctx.orderStatus = st;
}
// ---------------------------------------------------------------------------
// 5b. Driver delivery flow (claim pool + admin dispatch)
// ---------------------------------------------------------------------------
async function testDriverFlow(ctx) {
  section('5b. DRIVER DELIVERY FLOW');

  const customer = ctx.tokens.customer;
  const kitchen = ctx.tokens.kitchen;
  const admin = ctx.tokens.admin;

  if (!ctx.fixtureProductId || !ctx.categoryId) {
    bad('cannot run driver flow: lifecycle fixture missing');
    return;
  }

  const driverLogin = await req('/auth/login', { method: 'POST', body: ACCOUNTS.driver });
  const driver = tokenOf(driverLogin);
  check(!!driver, 'driver account can log in', `status=${driverLogin.status}`);
  ctx.tokens.driver = driver;
  if (!driver) return;

  // Role protection around the driver surface.
  const rbacSelf = await req('/driver/deliveries', { token: driver });
  check(rbacSelf.status === 200, 'GET /driver/deliveries (driver) returns 200', `status=${rbacSelf.status}`);
  const rbacCustomer = await req('/driver/deliveries', { token: customer });
  check(rbacCustomer.status === 403, 'customer cannot access driver routes (403)', `status=${rbacCustomer.status}`);
  const rbacKitchen = await req('/driver/deliveries', { token: kitchen });
  check(rbacKitchen.status === 403, 'kitchen cannot access driver routes (403)', `status=${rbacKitchen.status}`);
  const rbacUsers = await req('/users', { token: driver });
  check(rbacUsers.status === 403, 'driver cannot GET /users (403)', `status=${rbacUsers.status}`);

  const makeOrder = async (tag) => {
    const created = await req('/orders', {
      method: 'POST',
      token: customer,
      body: {
        // Quantity 2 keeps the subtotal above the configured minOrderTotal.
        items: [{ productId: ctx.fixtureProductId, quantity: 2 }],
        deliveryAddress: `${tag} E2E Delivery Lane, House 7`,
        deliveryArea: 'Test District',
        deliveryPhone: '+15550100',
        paymentMethod: 'CASH',
      },
    });
    const order = un(created.data) || {};
    const id = order.id || order.order?.id;
    check(
      (created.status === 200 || created.status === 201) && !!id,
      `driver flow order ${tag} created`,
      `status=${created.status}`,
    );
    return id;
  };

  const sendOutForDelivery = async (orderId, tag) => {
    for (const action of ['accept', 'preparing', 'ready']) {
      const r = await req(`/kitchen/orders/${orderId}/${action}`, { method: 'POST', token: kitchen });
      if (!(r.status === 200 || r.status === 201)) {
        bad(`kitchen could not move ${tag} to OUT_FOR_DELIVERY`, `status=${r.status} at ${action}`);
        return false;
      }
    }
    return true;
  };

  // --- Pickup pool: driver claims a ready, unassigned order. ---
  const orderA = await makeOrder('A');
  if (orderA && (await sendOutForDelivery(orderA, 'order A'))) {
    const available = await req('/driver/available', { token: driver });
    const pool = listOf(available.data);
    check(
      pool.some((o) => (o.id || o._id) === orderA),
      'claimed pool lists the ready order for drivers',
      `pool=${pool.length}`,
    );

    const claim = await req(`/driver/deliveries/${orderA}/accept`, { method: 'POST', token: driver });
    check(claim.status === 200 || claim.status === 201, 'driver accepts (claims) the delivery', `status=${claim.status}`);

    const mine = await req('/driver/deliveries', { token: driver });
    check(
      listOf(mine.data).some((o) => (o.id || o._id) === orderA),
      'claimed delivery appears in the driver list',
    );

    const pickup = await req(`/driver/deliveries/${orderA}/pickup`, { method: 'POST', token: driver });
    check(pickup.status === 200, 'driver picks up (READY -> OUT_FOR_DELIVERY)', `status=${pickup.status}`);

    const complete = await req(`/driver/deliveries/${orderA}/complete`, { method: 'POST', token: driver });
    check(complete.status === 200, 'driver completes (OUT_FOR_DELIVERY -> DELIVERED)', `status=${complete.status}`);

    const guard = await req(`/driver/deliveries/${orderA}/pickup`, { method: 'POST', token: driver });
    check(guard.status >= 400, 'driver cannot re-pickup a delivered order', `status=${guard.status}`);

    const summary = await req('/driver/summary', { token: driver });
    const s = un(summary.data) || {};
    check(
      summary.status === 200 && (s.completedToday || 0) >= 1,
      'driver summary counts the completed delivery',
      `completedToday=${s.completedToday}`,
    );

    const tracked = await req(`/orders/${orderA}`, { token: customer });
    const t = un(tracked.data) || {};
    check((t.status || t.order?.status) === 'DELIVERED', 'customer sees the delivered status instantly');
  }

  await runDriverDispatchChecks(ctx, { customer, kitchen, admin, driver, makeOrder, sendOutForDelivery });
}

/** Admin dispatch + issue-reporting checks (split out to keep functions small). */
async function runDriverDispatchChecks(ctx, helpers) {
  const { customer, kitchen, admin, driver, makeOrder, sendOutForDelivery } = helpers;

  // --- Admin dispatch: admin assigns a driver, driver runs the delivery. ---
  const orderB = await makeOrder('B');
  if (orderB && (await sendOutForDelivery(orderB, 'order B'))) {
    const drivers = await req('/users?role=DRIVER&pageSize=100', { token: admin });
    const driverList = listOf(drivers.data);
    const driverId = driverList.find((u) => u.isActive)?.id;
    check(!!driverId, 'admin can list driver accounts', `count=${driverList.length}`);

    if (driverId) {
      const assign = await req(`/orders/${orderB}/assign-driver`, {
        method: 'POST',
        token: admin,
        body: { driverId },
      });
      check(
        assign.status === 200 || assign.status === 201,
        'admin dispatches the order to the driver',
        `status=${assign.status}`,
      );

      const mine = await req('/driver/deliveries', { token: driver });
      const assigned = listOf(mine.data).find((o) => (o.id || o._id) === orderB);
      check(!!assigned, 'dispatched order appears in the driver list');

      if (assigned) {
        const pickup = await req(`/driver/deliveries/${orderB}/pickup`, { method: 'POST', token: driver });
        check(pickup.status === 200, 'driver starts the dispatched delivery', `status=${pickup.status}`);
        const complete = await req(`/driver/deliveries/${orderB}/complete`, { method: 'POST', token: driver });
        check(complete.status === 200, 'driver completes the dispatched delivery', `status=${complete.status}`);
      }
    }
  }

  // --- Issue reporting. ---
  const orderC = await makeOrder('C');
  if (orderC && (await sendOutForDelivery(orderC, 'order C'))) {
    await req(`/driver/deliveries/${orderC}/accept`, { method: 'POST', token: driver });
    await req(`/driver/deliveries/${orderC}/pickup`, { method: 'POST', token: driver });
    const issue = await req(`/driver/deliveries/${orderC}/issue`, {
      method: 'POST',
      token: driver,
      body: { note: 'Customer phone unreachable at the gate (e2e)' },
    });
    check(issue.status === 200, 'driver can report a delivery issue', `status=${issue.status}`);

    // Clean up: deliver the held order so no fixture is left dangling.
    const complete = await req(`/driver/deliveries/${orderC}/complete`, { method: 'POST', token: driver });
    check(complete.status === 200, 'held order is completed after the issue report', `status=${complete.status}`);
  }
}

// ---------------------------------------------------------------------------
// 6. Receipts
// ---------------------------------------------------------------------------
async function testReceipts(ctx) {
  section('6. RECEIPTS');
  const customer = ctx.tokens.customer;
  const oid = ctx.kitchenOrderId || ctx.orderId;
  if (!oid) {
    bad('cannot verify receipts: no order available');
    return;
  }

  const r = await req(`/receipts/order/${oid}`, { token: customer });
  check(r.status === 200, 'GET /receipts/order/:orderId returns 200', `status=${r.status}`);

  const html = await req(`/receipts/order/${oid}/html`, { token: customer });
  check(html.status === 200, 'GET /receipts/order/:orderId/html returns 200', `status=${html.status}`);
  check(String(html.text || '').length > 0, 'receipt HTML has content');

  const rc = un(r.data) || {};
  const code = rc.verifyCode || (rc.receipt && rc.receipt.verifyCode);
  if (code) {
    const v = await req(`/receipts/verify/${code}`);
    check(v.status === 200, 'GET /receipts/verify/:verifyCode validates a receipt', `status=${v.status}`);
  } else {
    ok('receipt verify code not exposed on detail payload (public verify skipped)');
  }
}
// ---------------------------------------------------------------------------
// 7. Customer profile features (addresses, favorites, notifications, reorder)
// ---------------------------------------------------------------------------
async function testCustomerFeatures(ctx) {
  section('7. CUSTOMER PROFILE FEATURES');
  const customer = ctx.tokens.customer;

  const me = await req('/users/me', { token: customer });
  check(me.status === 200, 'GET /users/me returns 200', `status=${me.status}`);

  const patched = await req('/users/me', {
    method: 'PATCH',
    token: customer,
    body: { name: 'E2E Customer' },
  });
  check(
    patched.status === 200 || patched.status === 201,
    'PATCH /users/me updates the profile',
    `status=${patched.status}`,
  );

  const created = await req('/addresses', {
    method: 'POST',
    token: customer,
    body: { label: 'E2E Home', line1: '1 Test Street', city: 'Testville', isDefault: false },
  });
  check(
    created.status === 200 || created.status === 201,
    'POST /addresses creates an address',
    `status=${created.status}${created.status >= 400 ? ' body=' + String(created.text).slice(0, 160) : ''}`,
  );
  const addr = un(created.data) || {};
  const aid = addr.id || addr._id || (addr.address && addr.address.id);

  if (aid) {
    const upd = await req(`/addresses/${aid}`, {
      method: 'PATCH',
      token: customer,
      body: { line1: '2 Updated Street' },
    });
    check(upd.status === 200, 'PATCH /addresses/:id updates an address', `status=${upd.status}`);

    const def = await req(`/addresses/${aid}/default`, { method: 'POST', token: customer });
    check(def.status === 200 || def.status === 201, 'POST /addresses/:id/default sets default', `status=${def.status}`);

    const del = await req(`/addresses/${aid}`, { method: 'DELETE', token: customer });
    check(del.status === 200 || del.status === 204, 'DELETE /addresses/:id removes an address', `status=${del.status}`);
  } else {
    bad('address create returned no id');
  }

  if (ctx.productId) {
    const fav = await req(`/favorites/${ctx.productId}`, { method: 'POST', token: customer });
    check(fav.status === 200 || fav.status === 201, 'POST /favorites/:productId adds a favorite', `status=${fav.status}`);
    const favList = await req('/favorites', { token: customer });
    check(favList.status === 200, 'GET /favorites returns 200', `status=${favList.status}`);
    const ids = await req('/favorites/ids', { token: customer });
    check(ids.status === 200, 'GET /favorites/ids returns 200', `status=${ids.status}`);
    const unfav = await req(`/favorites/${ctx.productId}`, { method: 'DELETE', token: customer });
    check(unfav.status === 200 || unfav.status === 204, 'DELETE /favorites/:productId removes a favorite', `status=${unfav.status}`);
  }

  const notes = await req('/notifications', { token: customer });
  check(notes.status === 200, 'GET /notifications returns 200', `status=${notes.status}`);
  const readAll = await req('/notifications/read-all', { method: 'POST', token: customer });
  check(readAll.status === 200 || readAll.status === 201, 'POST /notifications/read-all succeeds', `status=${readAll.status}`);

  if (ctx.kitchenOrderId) {
    const re = await req(`/orders/${ctx.kitchenOrderId}/reorder`, { method: 'POST', token: customer });
    check(
      re.status === 200 || re.status === 201,
      'POST /orders/:id/reorder creates a repeat order',
      `status=${re.status}${re.status >= 400 ? ' body=' + String(re.text).slice(0, 160) : ''}`,
    );
  }
}
// ---------------------------------------------------------------------------
// 8. Admin: analytics, reports, settings, logs, users, catalog CRUD
// ---------------------------------------------------------------------------
async function testAdmin(ctx) {
  section('8. ADMIN');
  const admin = ctx.tokens.admin;

  const ov = await req('/analytics/overview', { token: admin });
  check(ov.status === 200, 'GET /analytics/overview returns 200', `status=${ov.status}`);
  const charts = await req('/analytics/charts?range=7d', { token: admin });
  check(charts.status === 200, 'GET /analytics/charts returns 200', `status=${charts.status}`);
  const search = await req('/analytics/search?q=e2e', { token: admin });
  check(search.status === 200, 'GET /analytics/search returns 200', `status=${search.status}`);

  const prev = await req('/reports/preview?type=DAILY', { token: admin });
  check(prev.status === 200, 'GET /reports/preview returns 200', `status=${prev.status}`);
  const exp = await req('/reports/export?type=DAILY&format=PDF', { token: admin });
  check(exp.status === 200, 'GET /reports/export returns 200', `status=${exp.status}`);
  const gen = await req('/reports/generate', {
    method: 'POST',
    token: admin,
    body: { type: 'DAILY', format: 'PDF' },
  });
  check(
    gen.status === 200 || gen.status === 201,
    'POST /reports/generate creates a report',
    `status=${gen.status}${gen.status >= 400 ? ' body=' + String(gen.text).slice(0, 160) : ''}`,
  );
  const rlist = await req('/reports', { token: admin });
  check(rlist.status === 200, 'GET /reports lists saved reports', `status=${rlist.status}`);

  const set = await req('/settings', { token: admin });
  check(set.status === 200, 'GET /settings returns 200', `status=${set.status}`);
  const setAdmin = await req('/settings/admin', { token: admin });
  check(setAdmin.status === 200, 'GET /settings/admin returns 200', `status=${setAdmin.status}`);
  const setPatch = await req('/settings', {
    method: 'PATCH',
    token: admin,
    body: { currency: 'USD' },
  });
  check(setPatch.status === 200 || setPatch.status === 201, 'PATCH /settings updates settings', `status=${setPatch.status}`);

  const logs = await req('/logs', { token: admin });
  check(logs.status === 200, 'GET /logs returns 200', `status=${logs.status}`);
  const logFilters = await req('/logs/filters', { token: admin });
  check(logFilters.status === 200, 'GET /logs/filters returns 200', `status=${logFilters.status}`);

  const users = await req('/users', { token: admin });
  check(users.status === 200, 'GET /users returns 200', `status=${users.status}`);
  check(listOf(users.data).length >= 3, 'seeded users listed', `count=${listOf(users.data).length}`);

  const email = `e2e-${Date.now()}@deliverysystem.app`;
  const cu = await req('/users', {
    method: 'POST',
    token: admin,
    body: { name: 'E2E Staff', email, password: 'E2e@12345', role: 'KITCHEN' },
  });
  check(
    cu.status === 200 || cu.status === 201,
    'POST /users creates a user',
    `status=${cu.status}${cu.status >= 400 ? ' body=' + String(cu.text).slice(0, 160) : ''}`,
  );
  const nu = un(cu.data) || {};
  const uid = nu.id || nu._id || (nu.user && nu.user.id);
  if (uid) {
    const g = await req(`/users/${uid}`, { token: admin });
    check(g.status === 200, 'GET /users/:id returns 200', `status=${g.status}`);
    const p = await req(`/users/${uid}`, { method: 'PATCH', token: admin, body: { name: 'E2E Staff Renamed' } });
    check(p.status === 200, 'PATCH /users/:id updates a user', `status=${p.status}`);
    const d = await req(`/users/${uid}/disable`, { method: 'POST', token: admin });
    check(d.status === 200 || d.status === 201, 'POST /users/:id/disable disables a user', `status=${d.status}`);
    const a = await req(`/users/${uid}/activate`, { method: 'POST', token: admin });
    check(a.status === 200 || a.status === 201, 'POST /users/:id/activate re-activates a user', `status=${a.status}`);
    const rp = await req(`/users/${uid}/reset-password`, {
      method: 'POST',
      token: admin,
      body: { password: 'Reset@12345' },
    });
    check(rp.status === 200 || rp.status === 201, 'POST /users/:id/reset-password resets a password', `status=${rp.status}`);
    const del = await req(`/users/${uid}`, { method: 'DELETE', token: admin });
    check(del.status === 200 || del.status === 204, 'DELETE /users/:id removes a user', `status=${del.status}`);
  } else {
    bad('user create returned no id');
  }
}

// ---------------------------------------------------------------------------
// 9. Admin catalogue CRUD
// ---------------------------------------------------------------------------
async function testAdminCatalog(ctx) {
  section('9. ADMIN CATALOGUE CRUD');
  const admin = ctx.tokens.admin;

  const cc = await req('/categories', {
    method: 'POST',
    token: admin,
    body: { name: `E2E Cat ${Date.now()}` },
  });
  check(
    cc.status === 200 || cc.status === 201,
    'POST /categories creates a category',
    `status=${cc.status}${cc.status >= 400 ? ' body=' + String(cc.text).slice(0, 160) : ''}`,
  );
  const nc = un(cc.data) || {};
  const cid = nc.id || nc._id || (nc.category && nc.category.id);
  if (cid) {
    const uc = await req(`/categories/${cid}`, {
      method: 'PATCH',
      token: admin,
      body: { name: 'E2E Cat Renamed' },
    });
    check(uc.status === 200, 'PATCH /categories/:id updates a category', `status=${uc.status}`);
    const dc = await req(`/categories/${cid}`, { method: 'DELETE', token: admin });
    check(dc.status === 200 || dc.status === 204, 'DELETE /categories/:id removes a category', `status=${dc.status}`);
  } else {
    bad('category create returned no id');
  }

  if (!ctx.categoryId) {
    bad('no seeded category available for product CRUD');
    return;
  }

  const cp = await req('/products', {
    method: 'POST',
    token: admin,
    body: {
      name: `E2E Product ${Date.now()}`,
      description: 'created by e2e',
      price: 9.99,
      categoryId: ctx.categoryId,
      isAvailable: true,
    },
  });
  check(
    cp.status === 200 || cp.status === 201,
    'POST /products creates a product',
    `status=${cp.status}${cp.status >= 400 ? ' body=' + String(cp.text).slice(0, 200) : ''}`,
  );
  const np = un(cp.data) || {};
  const pid = np.id || np._id || (np.product && np.product.id);
  if (pid) {
    const up = await req(`/products/${pid}`, { method: 'PATCH', token: admin, body: { price: 10.5 } });
    check(up.status === 200, 'PATCH /products/:id updates a product', `status=${up.status}`);
    const st = await req(`/products/${pid}/stock`, { method: 'POST', token: admin, body: { stock: 25 } });
    check(st.status === 200 || st.status === 201, 'POST /products/:id/stock adjusts stock', `status=${st.status}`);
    const dp = await req(`/products/${pid}`, { method: 'DELETE', token: admin });
    check(dp.status === 200 || dp.status === 204, 'DELETE /products/:id removes a product', `status=${dp.status}`);
  } else {
    bad('product create returned no id');
  }
}

// ---------------------------------------------------------------------------
// 10. RBAC enforcement
// ---------------------------------------------------------------------------
async function testRbac(ctx) {
  section('10. RBAC ENFORCEMENT');
  const customer = ctx.tokens.customer;
  const kitchen = ctx.tokens.kitchen;
  const admin = ctx.tokens.admin;

  const c1 = await req('/users', { token: customer });
  check(c1.status === 403, 'customer cannot GET /users (403)', `status=${c1.status}`);

  const c2 = await req('/analytics/overview', { token: customer });
  check(c2.status === 403, 'customer cannot GET /analytics/overview (403)', `status=${c2.status}`);

  const c3 = await req('/settings/admin', { token: customer });
  check(c3.status === 403, 'customer cannot GET /settings/admin (403)', `status=${c3.status}`);

  const k1 = await req('/users', { token: kitchen });
  check(k1.status === 403, 'kitchen cannot GET /users (403)', `status=${k1.status}`);

  const a1 = await req('/users', { token: admin });
  check(a1.status === 200, 'admin can GET /users (200)', `status=${a1.status}`);

  const c4 = await req('/categories', { method: 'POST', token: customer, body: { name: 'nope' } });
  check(c4.status === 403, 'customer cannot POST /categories (403)', `status=${c4.status}`);

  const bogus = await req('/orders', { token: 'not-a-real-token' });
  check(bogus.status === 401, 'invalid token is rejected (401)', `status=${bogus.status}`);
}

// ---------------------------------------------------------------------------
// 11. Web app + PWA assets
// ---------------------------------------------------------------------------
async function webGet(path, binary = false) {
  const res = await fetch(WEB + path);
  const text = binary ? '' : await res.text();
  const type = res.headers.get('content-type') || '';
  return { status: res.status, text, type };
}

async function testPwa() {
  section('11. WEB APP + PWA');

  const root = await webGet('/');
  check(root.status === 200, 'GET / serves the SPA shell', `status=${root.status}`);
  check(/<div id="root">/.test(root.text), 'SPA root mount element is present');
  check(
    /<link[^>]+rel=["']manifest["']/i.test(root.text),
    'index.html links the web app manifest',
  );
  check(
    /name=["']theme-color["']/i.test(root.text),
    'index.html declares theme-color meta',
  );
  check(
    /apple-mobile-web-app-capable|mobile-web-app-capable/i.test(root.text),
    'index.html declares standalone-capable meta tags',
  );
  check(
    /rel=["']apple-touch-icon["']/i.test(root.text),
    'index.html declares an apple-touch-icon',
  );
  check(
    /splash|boot-loader|boot-screen/i.test(root.text),
    'index.html includes a boot splash/loading screen',
  );

  const manifest = await webGet('/manifest.webmanifest');
  check(manifest.status === 200, 'GET /manifest.webmanifest is served', `status=${manifest.status}`);
  let m = null;
  try {
    m = JSON.parse(manifest.text);
  } catch {
    m = null;
  }
  check(!!m, 'manifest is valid JSON');
  if (m) {
    check(!!m.name, 'manifest has name', String(m.name));
    check(!!m.short_name, 'manifest has short_name', String(m.short_name));
    check(!!m.start_url, 'manifest has start_url', String(m.start_url));
    check(m.scope !== undefined, 'manifest has scope', String(m.scope));
    check(
      m.display === 'standalone' || m.display === 'fullscreen',
      'manifest display is standalone/fullscreen',
      String(m.display),
    );
    check(!!m.theme_color, 'manifest has theme_color', String(m.theme_color));
    check(!!m.background_color, 'manifest has background_color', String(m.background_color));
    check(Array.isArray(m.icons) && m.icons.length > 0, 'manifest declares icons', `count=${m.icons ? m.icons.length : 0}`);
    const sizes = (m.icons || []).map((i) => i.sizes);
    check(sizes.includes('192x192'), 'manifest has a 192x192 icon');
    check(sizes.includes('512x512'), 'manifest has a 512x512 icon');
    check(
      (m.icons || []).some((i) => String(i.purpose || '').includes('maskable')),
      'manifest has a maskable icon',
    );
  }

  for (const icon of [
    '/pwa-192x192.png',
    '/pwa-512x512.png',
    '/pwa-64x64.png',
    '/maskable-icon-512x512.png',
    '/apple-touch-icon-180x180.png',
    '/favicon.ico',
  ]) {
    const r = await webGet(icon, true);
    check(r.status === 200, `serves ${icon}`, `status=${r.status}`);
  }

  const offline = await webGet('/offline.html');
  check(offline.status === 200, 'GET /offline.html is served (offline fallback)', `status=${offline.status}`);

  const sw = await webGet('/sw.js');
  if (sw.status === 200 && !/^<!doctype html>/i.test(sw.text)) {
    ok('service worker /sw.js is served');
    check(/workbox|precache/i.test(sw.text), 'service worker includes workbox precache logic');
  } else {
    console.log('  INFO  /sw.js is generated only by `npm run build` (dev server serves the SPA shell for it)');
  }

  const woff = await webGet('/workbox-window.js', true);
  console.log(`  INFO  workbox runtime probe: status=${woff.status}`);
}

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------
async function main() {
  console.log('DELIVERY SYSTEM - end-to-end verification');
  console.log(`API: ${API}`);
  console.log(`WEB: ${WEB}`);

  const ctx = { tokens: {} };

  await testHealth();
  await testAuth(ctx);
  await testCatalogue(ctx);
  try {
    await testCustomerFlow(ctx);
    await testKitchenFlow(ctx);
    await testDriverFlow(ctx);
    await testReceipts(ctx);
    await testCustomerFeatures(ctx);
    await testAdmin(ctx);
    await testAdminCatalog(ctx);
    await testRbac(ctx);
    await testPwa();
  } finally {
    if (ctx.fixtureProductId) {
      // Archive rather than delete so order history remains available, even on failure.
      const cleanup = await req(`/products/${ctx.fixtureProductId}`, {
        method: 'PATCH', token: ctx.tokens.admin,
        body: { isArchived: true, isAvailable: false },
      });
      check(cleanup.status === 200, 'archives lifecycle fixture', `status=${cleanup.status}`);
    }
  }

  console.log('\n============================================');
  console.log(`RESULT: ${pass} passed, ${fail} failed`);
  if (failures.length) {
    console.log('\nFailures:');
    for (const f of failures) console.log(`  - ${f}`);
  }
  console.log('============================================');
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('\nFATAL: e2e run crashed');
  console.error(err);
  process.exit(1);
});