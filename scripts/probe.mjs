#!/usr/bin/env node
/** One-off probe: prints status + top-level keys for each API surface. */
const BASE = 'http://localhost:4000/api';

const CREDS = {
  admin: ['admin@deliverysystem.app', 'Admin@12345'],
  kitchen: ['kitchen@deliverysystem.app', 'Kitchen@12345'],
  customer: ['customer@deliverysystem.app', 'Customer@12345'],
};

async function login(role) {
  const [email, password] = CREDS[role];
  const res = await fetch(`${BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const json = await res.json();
  return { token: json.accessToken, user: json.user, status: res.status };
}

async function probe(method, path, token, body) {
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
  const keys = json && typeof json === 'object' && !Array.isArray(json) ? Object.keys(json) : [];
  console.log(
    `${String(res.status).padEnd(4)} ${method.padEnd(6)} ${path}\n     keys=${JSON.stringify(keys)}\n     body=${text.slice(0, 260)}`,
  );
  return { status: res.status, json };
}

async function main() {
  const admin = await login('admin');
  const kitchen = await login('kitchen');
  const customer = await login('customer');
  console.log(`admin=${admin.status} kitchen=${kitchen.status} customer=${customer.status}\n`);

  const A = admin.token;
  const K = kitchen.token;
  const C = customer.token;

  console.log('--- catalogue ---');
  await probe('GET', '/categories', A);
  await probe('GET', '/products?pageSize=2', A);
  await probe('GET', '/products/filters', A);

  console.log('\n--- orders ---');
  const created = await probe('POST', '/orders', C, {
    items: [{ productId: (await (await fetch(`${BASE}/products?pageSize=1`)).json()).items[0].id, quantity: 2 }],
    deliveryAddress: '12 Test Street, Accra',
    contactPhone: '+233201234567',
    paymentMethod: 'CASH_ON_DELIVERY',
  });
  const orderId = created.json?.order?.id ?? created.json?.id;
  await probe('GET', '/orders', C);
  await probe('GET', `/orders/${orderId}`, C);

  console.log('\n--- kitchen ---');
  await probe('GET', '/kitchen/queue', K);
  await probe('GET', '/kitchen/summary', K);
  await probe('GET', '/kitchen/history', K);

  console.log('\n--- customer extras ---');
  await probe('GET', '/favorites', C);
  await probe('GET', '/notifications', C);
  await probe('GET', '/addresses', C);
  await probe('GET', '/receipts', C);

  console.log('\n--- admin ---');
  await probe('GET', '/users', A);
  await probe('GET', '/analytics/overview', A);
  await probe('GET', '/analytics/charts?range=30d', A);
  await probe('GET', '/reports/preview?range=30d', A);
  await probe('GET', '/settings', A);
  await probe('GET', '/logs', A);
}

main().catch((err) => {
  console.error('probe failed:', err);
  process.exit(1);
});