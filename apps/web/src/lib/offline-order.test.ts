import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  clearPendingOrder,
  readPendingOrder,
  savePendingOrder,
  type OrderSubmissionPayload,
} from './offline-order';

const payload: OrderSubmissionPayload = {
  idempotencyKey: 'f2a78d3d-8b4e-4c73-a1d5-5f7cd10a4c2d',
  items: [{ productId: 'meal-1', quantity: 2 }],
  deliveryAddress: 'Mallam Junction, Accra, Ghana',
  deliveryPhone: '+233201234567',
  paymentMethod: 'CASH',
  deliveryLatitude: 5.5774,
  deliveryLongitude: -0.3104,
  deliveryOriginalLatitude: 5.5774,
  deliveryOriginalLongitude: -0.3104,
  deliveryLocationSource: 'gps',
  deliveryLocationConfirmedAt: '2026-09-27T12:00:00.000Z',
  quotedDeliveryFee: 12.5,
};

afterEach(() => vi.unstubAllGlobals());

describe('offline order storage', () => {
  it('persists a complete order with the same confirmed delivery destination per customer', () => {
    const values = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
    });

    expect(savePendingOrder('customer-1', payload)).toBe(true);
    expect(readPendingOrder('customer-1')).toEqual(payload);
    expect(readPendingOrder('customer-2')).toBeNull();
    clearPendingOrder('customer-1');
    expect(readPendingOrder('customer-1')).toBeNull();
  });

  it('rejects GPS queue records that omit the original captured coordinates', () => {
    const values = new Map<string, string>([
      ['ds_pending_order_v1:customer-1', JSON.stringify({ ...payload, deliveryOriginalLatitude: null, deliveryOriginalLongitude: null })],
    ]);
    vi.stubGlobal('localStorage', { getItem: (key: string) => values.get(key) ?? null });

    expect(readPendingOrder('customer-1')).toBeNull();
  });
});
