#!/usr/bin/env node
/**
 * Complete end-to-end verification of the Waakye App order lifecycle.
 *
 *   customer places order -> database -> kitchen accepts -> serving ->
 *   out for delivery -> driver receives -> driver accepts -> driver completes ->
 *   customer sees DELIVERED -> history
 *
 * Every step is a real HTTP call against the running API and the real database.
 * Nothing is stubbed and nothing is injected into frontend state.
 *
 * Usage: node scripts/verify-lifecycle.mjs [apiUrl]
 */
const API = (process.argv[2] ?? 'http://127.0.0.1:4000/api').replace(/\/+$/, '');

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

const login = async (email, password) => {
  const res = await call('/auth/login', { method: 'POST', body: { email, password } });
  if (res.status !== 200) throw new Error(`login failed for ${email}: ${res.status} ${JSON.stringify(res.data)}`);
  return res.data.token ?? res.data.accessToken;
};

/** List endpoints are either paginated ({ items }) or plain ({ data } / { orders }). */
const list = (payload) => payload?.items ?? payload?.data ?? payload?.orders ?? [];

console.log('\n=== 0. AUTHENTICATION ===');
const customerToken = await login('customer@deliverysystem.app', 'Customer@12345');
const kitchenToken = await login('kitchen@deliverysystem.app', 'Kitchen@12345');
const driverToken = await login('driver@deliverysystem.app', 'Driver@12345');
const adminToken = await login('admin@deliverysystem.app', 'Admin@12345');
check(Boolean(customerToken && kitchenToken && driverToken && adminToken), 'all four roles sign in');

console.log('\n=== 1. BROWSE THE MENU ===');
const products = await call('/products', { token: customerToken });
const productList = list(products.data);
check(products.status === 200, 'menu loads for the customer', `status=${products.status}`);
check(Array.isArray(productList) && productList.length > 0, 'menu has products', `count=${productList.length}`);
const available = productList.filter((p) => p.isAvailable && !p.isArchived);
check(available.length > 0, 'at least one product is available');
const product = available[0] ?? { price: 0, id: '' };
check(typeof product.price === 'number' && product.price > 0, 'price comes from the backend', `price=${product.price}`);

console.log('\n=== 2. PLACE A REAL ORDER ===');
// A real Malam / Gbawe point roughly 700 m from the kitchen anchor.
const orderBody = {
  items: [{ productId: product.id, quantity: 2, notes: 'Extra shito' }],
  deliveryAddress: 'Malam Junction, Gbawe Road, Accra',
  deliveryArea: 'Malam',
  deliveryPhone: '+233201234567',
  notes: 'Blue gate opposite the pharmacy',
  paymentMethod: 'CASH',
  deliveryLatitude: 5.5764,
  deliveryLongitude: -0.2902,
};
const created = await call('/orders', { method: 'POST', body: orderBody, token: customerToken });
check(
  created.status === 200 || created.status === 201,
  'order accepted by the API',
  `status=${created.status} ${JSON.stringify(created.data).slice(0, 220)}`,
);
const order = created.data?.order;
check(Boolean(order?.id), 'order has a unique id');
check(/^DS-\d{6}-\d{4}$/.test(order?.orderNumber ?? ''), 'order number generated', order?.orderNumber);
check(order?.status === 'RECEIVED', 'new order starts at ORDER PLACED', `status=${order?.status}`);
check(order?.items?.length === 1 && order?.items?.[0]?.quantity === 2, 'items and quantities persisted');
check(order?.deliveryLatitude === 5.5764 && order?.deliveryLongitude === -0.2902, 'delivery coordinates persisted');
check(order?.deliveryPhone === '+233201234567', 'customer phone persisted');
check(order?.notes === 'Blue gate opposite the pharmacy', 'delivery notes persisted');
const expectedSubtotal = Number((product.price * 2).toFixed(2));
check(Math.abs(order?.subtotal - expectedSubtotal) < 0.01, 'subtotal calculated server-side', `${order?.subtotal} vs ${expectedSubtotal}`);
check(order?.total > order?.subtotal, 'total includes delivery fee and tax', `total=${order?.total}`);
const orderId = order?.id;

console.log('\n=== 3. DATABASE RECORD IS AUTHORITATIVE ===');
const reread = await call(`/orders/${orderId}`, { token: customerToken });
check(reread.status === 200 && reread.data?.order?.id === orderId, 'order is readable back from the database');
const activeList = await call('/orders/active', { token: customerToken });
check((activeList.data?.orders ?? []).some((o) => o.id === orderId), 'order appears in the customer active list');

console.log('\n=== 4. KITCHEN RECEIVES THE ORDER ===');
const kitchenQueue = await call('/kitchen/orders?status=RECEIVED', { token: kitchenToken });
check(list(kitchenQueue.data).some((o) => o.id === orderId), 'order reaches the kitchen queue');
const kitchenSummary = await call('/kitchen/summary', { token: kitchenToken });
check(kitchenSummary.status === 200, 'kitchen summary loads', `incoming=${kitchenSummary.data?.summary?.incoming}`);

console.log('\n=== 5. KITCHEN WORKFLOW: ACCEPT -> SERVING -> OUT FOR DELIVERY ===');
const accept = await call(`/kitchen/orders/${orderId}/accept`, { method: 'POST', body: { note: 'Accepted' }, token: kitchenToken });
check(accept.status === 200 && accept.data?.order?.status === 'ACCEPTED', 'kitchen accepts the order', `status=${accept.data?.order?.status}`);
const customerSeesAccepted = await call(`/orders/${orderId}`, { token: customerToken });
check(customerSeesAccepted.data?.order?.status === 'ACCEPTED', 'customer sees ORDER ACCEPTED');

const serving = await call(`/kitchen/orders/${orderId}/preparing`, { method: 'POST', body: { note: 'Serving now' }, token: kitchenToken });
check(serving.status === 200 && serving.data?.order?.status === 'PREPARING', 'kitchen marks SERVING', `status=${serving.data?.order?.status}`);
const customerSeesServing = await call(`/orders/${orderId}`, { token: customerToken });
check(customerSeesServing.data?.order?.status === 'PREPARING', 'customer sees SERVING');

const earlyComplete = await call(`/kitchen/orders/${orderId}/complete`, { method: 'POST', token: kitchenToken });
check(earlyComplete.status === 404 || earlyComplete.status === 403, 'kitchen cannot complete a delivery (driver-only action)', `status=${earlyComplete.status}`);

const dispatch = await call(`/kitchen/orders/${orderId}/dispatch`, { method: 'POST', body: { note: 'Out for delivery' }, token: kitchenToken });
check(dispatch.status === 200 && dispatch.data?.order?.status === 'OUT_FOR_DELIVERY', 'kitchen marks OUT FOR DELIVERY', `status=${dispatch.data?.order?.status}`);
const customerSeesOfd = await call(`/orders/${orderId}`, { token: customerToken });
check(customerSeesOfd.data?.order?.status === 'OUT_FOR_DELIVERY', 'customer sees OUT FOR DELIVERY');

console.log('\n=== 6. DRIVER RECEIVES AND ACCEPTS ===');
const pool = await call('/driver/available', { token: driverToken });
check(
  pool.status === 200 && list(pool.data).some((o) => o.id === orderId),
  'order reaches the driver pool without a manual reload',
  `pool=${list(pool.data).length}`,
);
const driverAccept = await call(`/driver/deliveries/${orderId}/accept`, { method: 'POST', token: driverToken });
check(driverAccept.status === 200, 'driver accepts the delivery', `status=${driverAccept.status} ${JSON.stringify(driverAccept.data).slice(0, 200)}`);
const assigned = driverAccept.data?.data ?? driverAccept.data?.order;
check(Boolean(assigned?.driverId) && typeof assigned?.driverName === 'string', 'driver assignment persisted on the order', `driverId=${assigned?.driverId} (${assigned?.driverName})`);

const duplicate = await call(`/driver/deliveries/${orderId}/accept`, { method: 'POST', token: driverToken });
check(duplicate.status === 409, 'duplicate driver assignment is prevented', `status=${duplicate.status}`);

const mine = await call('/driver/deliveries?status=OUT_FOR_DELIVERY', { token: driverToken });
const inMine = list(mine.data).find((o) => o.id === orderId);
check(Boolean(inMine), 'driver sees the active delivery in their list');
check(inMine?.deliveryLatitude === 5.5764 && inMine?.deliveryLongitude === -0.2902, 'driver receives the customer coordinates for navigation', `${inMine?.deliveryLatitude},${inMine?.deliveryLongitude}`);
const postPool = await call('/driver/available', { token: driverToken });
check(!list(postPool.data).some((o) => o.id === orderId), 'order leaves the open pool once assigned');

console.log('\n=== 7. DRIVER COMPLETES THE DELIVERY ===');
const delivered = await call(`/driver/deliveries/${orderId}/complete`, { method: 'POST', token: driverToken });
const deliveredOrder = delivered.data?.data ?? delivered.data?.order;
check(delivered.status === 200 && deliveredOrder?.status === 'DELIVERED', 'driver completes the delivery', `status=${deliveredOrder?.status}`);
const customerSeesDelivered = await call(`/orders/${orderId}`, { token: customerToken });
check(customerSeesDelivered.data?.order?.status === 'DELIVERED', 'customer sees DELIVERED');
const history = await call('/orders', { token: customerToken });
check(list(history.data).some((o) => o.id === orderId), 'completed order remains in the customer history');
const driverHistory = await call('/driver/deliveries?status=DELIVERED', { token: driverToken });
check(list(driverHistory.data).some((o) => o.id === orderId), 'completed order remains in the driver history');
const backToPool = await call('/driver/available', { token: driverToken });
check(!list(backToPool.data).some((o) => o.id === orderId), 'delivered order leaves the driver pool');

console.log('\n=== 8. SERVICE AREA IS ENFORCED BY THE API ===');
const farAway = await call('/orders', {
  method: 'POST',
  token: customerToken,
  body: { ...orderBody, deliveryLatitude: 4.9016, deliveryLongitude: -1.7831, deliveryAddress: 'Takoradi' },
});
check(farAway.status === 400, 'an order far outside the delivery area is refused', `status=${farAway.status}`);
check(
  typeof farAway.data?.error?.message === 'string' && /delivery area/i.test(farAway.data.error.message),
  'the refusal explains the service area',
  farAway.data?.error?.message,
);
const zoneIn = await call('/geo/check-zone?latitude=5.5764&longitude=-0.2902', { token: customerToken });
check(zoneIn.status === 200 && zoneIn.data?.within === true, 'check-zone accepts an in-area point', `distance=${zoneIn.data?.distanceKm} km, radius=${zoneIn.data?.radiusKm} km`);
const zoneOut = await call('/geo/check-zone?latitude=4.9016&longitude=-1.7831', { token: customerToken });
check(zoneOut.data?.within === false, 'check-zone rejects an out-of-area point');

console.log('\n=== 9. PRICING AND INPUT VALIDATION CANNOT BE MANIPULATED ===');
const cheap = await call('/orders', { method: 'POST', token: customerToken, body: { ...orderBody, total: 0.01, subtotal: 0.01, deliveryFee: 0 } });
check(cheap.status === 200 || cheap.status === 201, 'client-supplied totals are ignored', `status=${cheap.status}`);
check(cheap.data?.order?.total > 1, 'the server recalculated the real total', `total=${cheap.data?.order?.total}`);
if (cheap.data?.order?.id) await call(`/orders/${cheap.data.order.id}/cancel`, { method: 'POST', token: customerToken });
const empty = await call('/orders', { method: 'POST', token: customerToken, body: { ...orderBody, items: [] } });
check(empty.status === 400, 'an empty order is refused', `status=${empty.status}`);
const negative = await call('/orders', { method: 'POST', token: customerToken, body: { ...orderBody, items: [{ productId: product.id, quantity: -5 }] } });
check(negative.status === 400, 'a negative quantity is refused', `status=${negative.status}`);
const ghost = await call('/orders', { method: 'POST', token: customerToken, body: { ...orderBody, items: [{ productId: '00000000-0000-0000-0000-000000000000', quantity: 1 }] } });
check(ghost.status === 400, 'an unknown product is refused', `status=${ghost.status}`);

console.log('\n=== 10. ROLE PERMISSIONS ARE ENFORCED ON THE BACKEND ===');
const anonymous = await call('/orders', { method: 'POST', body: orderBody });
check(anonymous.status === 401, 'anonymous cannot place an order', `status=${anonymous.status}`);
const customerAsDriver = await call('/driver/available', { token: customerToken });
check(customerAsDriver.status === 403, 'a customer cannot use driver endpoints', `status=${customerAsDriver.status}`);
const driverAsAdmin = await call('/users', { token: driverToken });
check(driverAsAdmin.status === 403, 'a driver cannot use admin endpoints', `status=${driverAsAdmin.status}`);
const kitchenAsAdmin = await call('/users', { token: kitchenToken });
check(kitchenAsAdmin.status === 403, 'the kitchen cannot manage users', `status=${kitchenAsAdmin.status}`);
const customerAsAdmin = await call('/analytics/overview', { token: customerToken });
check(customerAsAdmin.status === 403, 'a customer cannot read business analytics', `status=${customerAsAdmin.status}`);
const anonymousOrder = await call(`/orders/${orderId}`);
check(anonymousOrder.status === 401, 'order details require authentication', `status=${anonymousOrder.status}`);
const adminOrder = await call(`/orders/${orderId}`, { token: adminToken });
check(adminOrder.status === 200, 'an admin can inspect any order', `status=${adminOrder.status}`);

console.log('\n=== 11. DELIVERY STATUS EVENTS ARE AUDITED ===');
const events = await call(`/orders/${orderId}`, { token: adminToken });
const statuses = (events.data?.order?.timeline ?? events.data?.order?.events ?? []).map((e) => e.status);
check(statuses.includes('RECEIVED') && statuses.includes('DELIVERED'), 'the status trail is recorded end to end', statuses.join(' -> '));

console.log('\n----------------------------------------');
console.log(`PASSED ${pass} / ${pass + fail}`);
if (fail > 0) {
  console.log('FAILED CHECKS:');
  for (const name of failures) console.log(`  - ${name}`);
  process.exitCode = 1;
}



