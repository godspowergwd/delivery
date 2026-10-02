import { describe, expect, it } from 'vitest';
import { serializeDriverOffer, type OrderWithRelations } from './serializers';

const privateOrder = {
  id: 'order-1',
  orderNumber: 'DS-260101-0001',
  status: 'OUT_FOR_DELIVERY',
  source: 'ONLINE',
  fulfillmentType: 'DELIVERY',
  customerId: 'customer-private-id',
  createdById: null,
  customerName: null,
  deliveryAddress: '24 Private Street, Mallam',
  deliveryArea: 'Mallam',
  deliveryPhone: '+233201234567',
  notes: 'Call from the gate',
  kitchenNote: 'Private kitchen note',
  cancelReason: null,
  subtotal: 20,
  deliveryFee: 5,
  tax: 0,
  discount: 0,
  total: 25,
  itemCount: 2,
  paymentMethod: 'CASH',
  paymentStatus: 'PENDING',
  items: [{ id: 'item-1', productId: 'product-1', name: 'Meal', imageUrl: null, unitPrice: 10, quantity: 2, lineTotal: 20, notes: null }],
  events: [],
  customer: { id: 'customer-private-id', name: 'Private Customer', email: 'private@example.com', phone: '+233201234567' },
  driver: null,
  receipt: { receiptNumber: 'receipt-private' },
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  acceptedAt: null,
  preparingAt: null,
  readyAt: null,
  outForDeliveryAt: new Date('2026-01-01T00:00:00.000Z'),
  deliveredAt: null,
  cancelledAt: null,
  estimatedReadyAt: null,
  driverId: null,
  deliveryLatitude: 5.5774,
  deliveryLongitude: -0.3104,
  deliveryOriginalLatitude: 5.5775,
  deliveryOriginalLongitude: -0.3105,
  deliveryLocationSource: 'gps',
  deliveryLocationConfirmedAt: new Date('2026-01-01T00:00:00.000Z'),
} as unknown as OrderWithRelations;

describe('unassigned driver offer serialization', () => {
  it('keeps offer summary while withholding customer identity and precise delivery details', () => {
    const offer = serializeDriverOffer(privateOrder);
    expect(offer.orderNumber).toBe(privateOrder.orderNumber);
    expect(offer.itemCount).toBe(2);
    expect(offer.total).toBe(25);
    expect(offer.deliveryAddress).toBe('Mallam');
    expect(offer.customerName).toBe('Customer');
    expect(offer.customerId).toBeNull();
    expect(offer.customerEmail).toBe('');
    expect(offer.deliveryPhone).toBe('');
    expect(offer.deliveryLatitude).toBeNull();
    expect(offer.deliveryLongitude).toBeNull();
    expect(offer.notes).toBeNull();
    expect(offer.items).toEqual([]);
    expect(offer.hasReceipt).toBe(false);
  });
});