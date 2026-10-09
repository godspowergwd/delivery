import { describe, expect, it } from 'vitest';
import { walkInOrderSchema } from './kitchen.routes';

const pickupOrder = {
  items: [{ productId: 'dish-1', quantity: 2 }],
  fulfillmentType: 'PICKUP',
  paymentMethod: 'CASH',
  idempotencyKey: '34e2c3c7-3613-420f-9e84-e53a8d64b52d',
};

const deliveryOrder = {
  ...pickupOrder,
  fulfillmentType: 'DELIVERY',
  customerName: 'Ama Mensah',
  deliveryPhone: '+233201234567',
  deliveryAddress: 'Mallam Junction, Accra',
  deliveryLatitude: 5.566,
  deliveryLongitude: -0.31,
  deliveryLocationSource: 'search',
  quotedDeliveryFee: 12.5,
};

describe('walk-in order validation', () => {
  it('accepts pickup without customer or delivery details', () => {
    expect(walkInOrderSchema.safeParse(pickupOrder).success).toBe(true);
  });

  it('requires customer phone and location for delivery', () => {
    const missingPhone = { ...deliveryOrder, deliveryPhone: undefined };
    const missingLocation = { ...deliveryOrder, deliveryAddress: undefined };

    expect(walkInOrderSchema.safeParse(missingPhone).success).toBe(false);
    expect(walkInOrderSchema.safeParse(missingLocation).success).toBe(false);
  });

  it('accepts delivery with the required customer and confirmed map data', () => {
    expect(walkInOrderSchema.safeParse(deliveryOrder).success).toBe(true);
  });

  it('rejects duplicate product entries', () => {
    const duplicated = {
      ...pickupOrder,
      items: [pickupOrder.items[0], pickupOrder.items[0]],
    };

    expect(walkInOrderSchema.safeParse(duplicated).success).toBe(false);
  });
});