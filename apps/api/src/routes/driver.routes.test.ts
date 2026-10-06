import type { NextFunction, Request, Response } from 'express';
import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { OrderWithRelations } from '../services/serializers';

const { findMany, driverUser } = vi.hoisted(() => ({
  findMany: vi.fn(),
  driverUser: {
    id: 'driver-1',
    name: 'Test Driver',
    email: 'driver@example.test',
    phone: null,
    role: 'DRIVER',
    isActive: true,
    isProtected: false,
    avatarUrl: null,
  },
}));

vi.mock('../lib/prisma', () => ({
  prisma: { order: { findMany } },
  decimalToNumber: (value: unknown) => Number(value),
}));

vi.mock('../middleware/authenticate', () => ({
  authenticate: (_req: Request, _res: Response, next: NextFunction) => next(),
  getAuth: () => ({ user: driverUser, sessionId: 'session-1' }),
  requireRole: () => (_req: Request, _res: Response, next: NextFunction) => next(),
}));

import { errorHandler } from '../middleware/errorHandler';
import { driverRouter } from './driver.routes';

const assignedOrder = {
  id: 'order-1',
  orderNumber: 'DS-261005-0001',
  status: 'OUT_FOR_DELIVERY',
  source: 'ONLINE',
  fulfillmentType: 'DELIVERY',
  customerId: 'customer-1',
  createdById: null,
  customerName: 'Test Customer',
  deliveryAddress: 'Mallam Junction, Accra, Greater Accra Region, Ghana',
  deliveryArea: 'Mallam',
  deliveryPhone: '+233201234567',
  notes: null,
  kitchenNote: null,
  cancelReason: null,
  subtotal: 20,
  deliveryFee: 5,
  tax: 0,
  discount: 0,
  total: 25,
  itemCount: 1,
  paymentMethod: 'CASH',
  paymentStatus: 'PENDING',
  items: [],
  events: [],
  customer: { id: 'customer-1', name: 'Test Customer', email: 'customer@example.test', phone: '+233201234567' },
  driver: driverUser,
  receipt: null,
  createdAt: new Date('2026-10-05T12:00:00.000Z'),
  updatedAt: new Date('2026-10-05T12:00:00.000Z'),
  acceptedAt: null,
  preparingAt: null,
  readyAt: null,
  outForDeliveryAt: new Date('2026-10-05T12:00:00.000Z'),
  deliveredAt: null,
  cancelledAt: null,
  estimatedReadyAt: null,
  driverId: 'driver-1',
  deliveryLatitude: 5.57741,
  deliveryLongitude: -0.31041,
  deliveryOriginalLatitude: null,
  deliveryOriginalLongitude: null,
  deliveryLocationSource: 'search',
  deliveryLocationConfirmedAt: new Date('2026-10-05T11:55:00.000Z'),
} as unknown as OrderWithRelations;

const app = express();
app.use('/api/driver', driverRouter);
app.use(errorHandler);

describe('assigned driver delivery location response', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns the full customer destination for assigned deliveries', async () => {
    findMany.mockResolvedValue([assignedOrder]);

    const response = await request(app)
      .get('/api/driver/deliveries?status=OUT_FOR_DELIVERY');

    expect(response.status).toBe(200);
    expect(response.body.data[0]).toMatchObject({
      deliveryAddress: 'Mallam Junction, Accra, Greater Accra Region, Ghana',
      deliveryLatitude: 5.57741,
      deliveryLongitude: -0.31041,
      deliveryLocationSource: 'search',
    });
  });

  it('preserves missing coordinates on legacy orders for the driver error state', async () => {
    findMany.mockResolvedValue([{
      ...assignedOrder,
      deliveryLatitude: null,
      deliveryLongitude: null,
      deliveryLocationSource: null,
      deliveryLocationConfirmedAt: null,
    }]);

    const response = await request(app)
      .get('/api/driver/deliveries?status=OUT_FOR_DELIVERY');

    expect(response.status).toBe(200);
    expect(response.body.data[0].deliveryLatitude).toBeNull();
    expect(response.body.data[0].deliveryLongitude).toBeNull();
  });
});
