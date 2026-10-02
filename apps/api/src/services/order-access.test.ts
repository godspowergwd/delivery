import { describe, expect, it } from 'vitest';
import type { Role } from '@delivery/shared';
import { canAccessOrder, canViewOrder } from './order-access.service';

const CUSTOMER_ID = 'customer-1';
const OTHER_CUSTOMER_ID = 'customer-2';
const DRIVER_ID = 'driver-1';
const OTHER_DRIVER_ID = 'driver-2';

const as = (id: string, role: Role) => ({ id, role });

describe('order access control', () => {
  it('lets administrators and kitchen staff view any order', () => {
    const order = { customerId: OTHER_CUSTOMER_ID, driverId: null, status: 'RECEIVED' };
    expect(canViewOrder(order, as('admin-1', 'ADMIN'))).toBe(true);
    expect(canViewOrder(order, as('kitchen-1', 'KITCHEN'))).toBe(true);
  });

  it('lets a customer view only their own orders', () => {
    expect(canViewOrder({ customerId: CUSTOMER_ID, driverId: null, status: 'RECEIVED' }, as(CUSTOMER_ID, 'CUSTOMER'))).toBe(
      true,
    );
    expect(
      canViewOrder({ customerId: OTHER_CUSTOMER_ID, driverId: null, status: 'RECEIVED' }, as(CUSTOMER_ID, 'CUSTOMER')),
    ).toBe(false);
  });

  it('lets a driver view only their own assigned deliveries', () => {
    expect(
      canViewOrder(
        { customerId: CUSTOMER_ID, driverId: DRIVER_ID, status: 'OUT_FOR_DELIVERY' },
        as(DRIVER_ID, 'DRIVER'),
      ),
    ).toBe(true);
    expect(
      canViewOrder(
        { customerId: CUSTOMER_ID, driverId: OTHER_DRIVER_ID, status: 'OUT_FOR_DELIVERY' },
        as(DRIVER_ID, 'DRIVER'),
      ),
    ).toBe(false);
    expect(
      canViewOrder({ customerId: CUSTOMER_ID, driverId: null, status: 'RECEIVED' }, as(DRIVER_ID, 'DRIVER')),
    ).toBe(false);
  });

  it('does not let a driver read a pooled order before claiming it', () => {
    expect(
      canViewOrder({ customerId: CUSTOMER_ID, driverId: null, status: 'OUT_FOR_DELIVERY' }, as(DRIVER_ID, 'DRIVER')),
    ).toBe(false);
  });

  it('keeps the shared helper consistent across roles', () => {
    const mine = { customerId: CUSTOMER_ID, driverId: DRIVER_ID, status: 'ACCEPTED' };
    expect(canAccessOrder(mine, as(CUSTOMER_ID, 'CUSTOMER'))).toBe(true);
    expect(canAccessOrder(mine, as(DRIVER_ID, 'DRIVER'))).toBe(true);
    expect(canAccessOrder(mine, as('admin-1', 'ADMIN'))).toBe(true);
    expect(canAccessOrder(mine, as('kitchen-1', 'KITCHEN'))).toBe(true);
    expect(canAccessOrder(mine, as(OTHER_CUSTOMER_ID, 'CUSTOMER'))).toBe(false);
    expect(canAccessOrder(mine, as(OTHER_DRIVER_ID, 'DRIVER'))).toBe(false);
  });
});
