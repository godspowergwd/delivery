import { describe, expect, it } from 'vitest';
import { createOrderSchema } from './orders.routes';

const selectedAddressOrder = {
  items: [{ productId: 'waakye', quantity: 1 }],
  deliveryAddress: 'Mallam Junction, Accra, Greater Accra Region, Ghana',
  deliveryPhone: '+233201234567',
  paymentMethod: 'CASH',
  deliveryLatitude: 5.57741,
  deliveryLongitude: -0.31041,
  deliveryLocationSource: 'search',
  deliveryLocationConfirmedAt: '2026-10-05T12:00:00.000Z',
};

describe('customer delivery location validation', () => {
  it('accepts a selected address with its destination coordinates', () => {
    expect(createOrderSchema.safeParse(selectedAddressOrder).success).toBe(true);
  });

  it('rejects a manually typed address without coordinates', () => {
    const { deliveryLatitude: _latitude, deliveryLongitude: _longitude, ...manualAddress } =
      selectedAddressOrder;

    expect(createOrderSchema.safeParse(manualAddress).success).toBe(false);
  });

  it('rejects invalid delivery coordinates', () => {
    expect(createOrderSchema.safeParse({
      ...selectedAddressOrder,
      deliveryLatitude: 91,
    }).success).toBe(false);
    expect(createOrderSchema.safeParse({
      ...selectedAddressOrder,
      deliveryLongitude: 0,
    }).success).toBe(false);
  });
});
