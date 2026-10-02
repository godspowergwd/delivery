import { randomUUID } from 'node:crypto';
import { requireIsolatedTestApi } from './test-safety.mjs';

const API = 'http://127.0.0.1:4100/api';
const { accounts } = await requireIsolatedTestApi(API);

// Temporary diagnostic: reproduce the load-test order payload and print details.
const login = await fetch(`${API}/auth/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': '10.0.0.99' },
  body: JSON.stringify({ email: accounts.CUSTOMER.email, password: accounts.CUSTOMER.password }),
}).then((r) => r.json());

const products = await fetch(`${API}/products?pageSize=3`, {
  headers: { Authorization: `Bearer ${login.accessToken}`, 'X-Forwarded-For': '10.0.0.99' },
}).then((r) => r.json());

const response = await fetch(`${API}/orders`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${login.accessToken}`,
    'X-Forwarded-For': '10.0.0.99',
  },
  body: JSON.stringify({
    items: [{ productId: products.items[0].id, quantity: 1 }],
    deliveryAddress: 'Mallam Junction, Gbawe Road, Accra',
    deliveryArea: 'Malam',
    deliveryPhone: '+233201234567',
    paymentMethod: 'CASH',
    deliveryLatitude: 5.5774,
    deliveryLongitude: -0.3104,
    deliveryLocationSource: 'search',
    idempotencyKey: randomUUID(),
  }),
});
console.log(response.status, await response.text());
