import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../lib/http';
import { csvSchema, idParamSchema } from '../lib/validation';
import { authenticate, getAuth, requireRole, type SessionUser } from '../middleware/authenticate';
import { writeLimiter } from '../middleware/rateLimit';
import { prisma } from '../lib/prisma';
import { badRequest, conflict, forbidden, notFound } from '../lib/errors';
import { ORDER_INCLUDE, serializeDriverOffer, serializeOrder, type OrderWithRelations } from '../services/serializers';
import {
  driverLocationInputSchema,
  publishDriverLocation,
  serializeDriverLocation,
  stopDriverLocation,
} from '../services/tracking.service';
import { changeOrderStatus, statusLabel } from '../services/order.service';
import { logActivity } from '../services/activity-log.service';
import { notifyAdmins } from '../services/notification.service';
import { emitToRole, hasConnectedDriverSockets } from '../realtime/socket';
import { invalidateActiveDeliveryTargets } from '../services/driver-delivery-cache';
import { claimUnassignedDelivery } from '../services/driver-claim';
import {
  acknowledgeDriverPushAlert,
  activeDriverPushAlerts,
} from '../services/push-alert.service';

export const driverRouter = Router();

// Every driver route requires an authenticated DRIVER account.
driverRouter.use(authenticate, requireRole('DRIVER'));

const listQuerySchema = z.object({
  status: csvSchema,
});

const vehicleProfileSchema = z.object({
  vehiclePlateNumber: z.string().trim().max(20),
  vehiclePlateColor: z.string().trim().max(40),
}).superRefine((profile, context) => {
  const number = profile.vehiclePlateNumber?.trim() ?? '';
  const color = profile.vehiclePlateColor?.trim() ?? '';
  if (Boolean(number) !== Boolean(color)) {
    context.addIssue({
      code: 'custom',
      path: number ? ['vehiclePlateColor'] : ['vehiclePlateNumber'],
      message: 'Enter both the vehicle plate number and its color, or leave both blank.',
    });
  }
  if (number && (number.length < 3 || !/^[a-z0-9 -]+$/i.test(number))) {
    context.addIssue({
      code: 'custom',
      path: ['vehiclePlateNumber'],
      message: 'Enter a valid vehicle plate number.',
    });
  }
  if (color && color.length < 2) {
    context.addIssue({
      code: 'custom',
      path: ['vehiclePlateColor'],
      message: 'Plate color must contain at least 2 characters.',
    });
  }
});

/** Loads an order and verifies it belongs to the signed-in driver. */
async function requireAssignedOrder(id: string, driver: SessionUser): Promise<OrderWithRelations> {
  const order = await prisma.order.findUnique({ where: { id }, include: ORDER_INCLUDE });
  if (!order) throw notFound('That delivery could not be found.');
  if (order.driverId !== driver.id) {
    throw forbidden('That delivery is not assigned to you.');
  }
  return order;
}

/** Loads an unclaimed order from the shared pickup pool (driverId must be null). */
async function requirePoolOrder(id: string): Promise<OrderWithRelations> {
  const order = await prisma.order.findUnique({ where: { id }, include: ORDER_INCLUDE });
  if (!order) throw notFound('That delivery could not be found.');
  return order;
}

/** GET /api/driver/profile - private vehicle details for the signed-in driver. */
driverRouter.get(
  '/profile',
  asyncHandler(async (req, res) => {
    const driver = getAuth(req).user;
    const profile = await prisma.user.findUniqueOrThrow({
      where: { id: driver.id },
      select: { vehiclePlateNumber: true, vehiclePlateColor: true },
    });
    res.json({ profile });
  }),
);

/** PATCH /api/driver/profile - a driver may maintain only their own vehicle details. */
driverRouter.patch(
  '/profile',
  writeLimiter,
  asyncHandler(async (req, res) => {
    const driver = getAuth(req).user;
    const body = vehicleProfileSchema.parse(req.body);
    const number = body.vehiclePlateNumber?.trim() ?? '';
    const color = body.vehiclePlateColor?.trim() ?? '';
    const profile = await prisma.user.update({
      where: { id: driver.id },
      data: {
        vehiclePlateNumber: number || null,
        vehiclePlateColor: color || null,
      },
      select: { vehiclePlateNumber: true, vehiclePlateColor: true },
    });
    emitToRole('ADMIN', 'user:changed', { action: 'updated', userId: driver.id });
    emitToRole('KITCHEN', 'user:changed', { action: 'updated', userId: driver.id });
    await logActivity({
      action: 'DRIVER_VEHICLE_UPDATED',
      entity: 'User',
      entityId: driver.id,
      description: `${driver.name} updated their vehicle details`,
      metadata: { vehiclePlateNumber: profile.vehiclePlateNumber, vehiclePlateColor: profile.vehiclePlateColor },
      userId: driver.id,
      actorEmail: driver.email,
      actorRole: driver.role,
      request: req,
    });
    res.json({ profile });
  }),
);

/** GET /api/driver/summary - stats for the driver profile and dashboard header. */
driverRouter.get(
  '/summary',
  asyncHandler(async (req, res) => {
    const driver = getAuth(req).user;
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const [active, available, completedToday, completedTotal, earnings] = await Promise.all([
      prisma.order.count({
        where: { driverId: driver.id, status: { in: ['ACCEPTED', 'PREPARING', 'READY', 'OUT_FOR_DELIVERY'] } },
      }),
      prisma.order.count({ where: { status: 'OUT_FOR_DELIVERY', driverId: null } }),
      prisma.order.count({
        where: { driverId: driver.id, status: 'DELIVERED', deliveredAt: { gte: todayStart } },
      }),
      prisma.order.count({ where: { driverId: driver.id, status: 'DELIVERED' } }),
      prisma.order.aggregate({
        _sum: { deliveryFee: true },
        where: { driverId: driver.id, status: 'DELIVERED', deliveredAt: { gte: todayStart } },
      }),
    ]);

    res.json({
      active,
      available,
      completedToday,
      completedTotal,
      earningsToday: earnings._sum.deliveryFee ? Number(earnings._sum.deliveryFee) : 0,
    });
  }),
);

driverRouter.get(
  '/alerts',
  asyncHandler(async (req, res) => {
    const driver = getAuth(req).user;
    res.json({ orderIds: await activeDriverPushAlerts(driver.id) });
  }),
);

driverRouter.post(
  '/deliveries/:id/acknowledge',
  writeLimiter,
  asyncHandler(async (req, res) => {
    const { id } = idParamSchema.parse(req.params);
    const driver = getAuth(req).user;
    await requireAssignedOrder(id, driver);
    await acknowledgeDriverPushAlert(driver.id, id);
    res.json({ success: true });
  }),
);

/** GET /api/driver/deliveries?status=... - deliveries assigned to the current driver. */
driverRouter.get(
  '/deliveries',
  asyncHandler(async (req, res) => {
    const driver = getAuth(req).user;
    const query = listQuerySchema.parse(req.query);
    const statuses = query.status as string[];

    const orders = await prisma.order.findMany({
      where: {
        driverId: driver.id,
        ...(statuses.length > 0 ? { status: { in: statuses as never[] } } : {}),
      },
      orderBy: { createdAt: 'desc' },
      include: ORDER_INCLUDE,
      take: 100,
    });

    res.json({ data: orders.map(serializeOrder) });
  }),
);

/** GET /api/driver/available - out-for-delivery orders still unclaimed. */
driverRouter.get(
  '/available',
  asyncHandler(async (_req, res) => {
    const orders = await prisma.order.findMany({
      where: { status: 'OUT_FOR_DELIVERY', driverId: null },
      orderBy: { createdAt: 'asc' },
      include: ORDER_INCLUDE,
      take: 50,
    });

    res.json({ data: orders.map(serializeDriverOffer) });
  }),
);

/**
 * POST /api/driver/deliveries/:id/accept - claim an out-for-delivery order.
 *
 * The guarded re-check inside the transaction means two drivers tapping
 * Accept at the same moment can never both win. On success every open driver
 * screen is notified so the pool stays in sync without a manual refresh.
 */
driverRouter.post(
  '/deliveries/:id/accept',
  writeLimiter,
  asyncHandler(async (req, res) => {
    const { id } = idParamSchema.parse(req.params);
    const driver = getAuth(req).user;

    const existing = await prisma.order.findUnique({ where: { id } });
    if (!existing) throw notFound('That delivery could not be found.');
    if (existing.driverId && existing.driverId !== driver.id) {
      throw conflict('Another driver already accepted this delivery.');
    }
    if (existing.status !== 'OUT_FOR_DELIVERY') {
      throw conflict(
        `Only orders out for delivery can be accepted (currently "${statusLabel(existing.status)}").`,
      );
    }

    const order = await prisma.$transaction(async (tx) => {
      await claimUnassignedDelivery(tx, existing.id, driver.id);
      await tx.orderStatusEvent.create({
        data: {
          orderId: existing.id,
          status: 'OUT_FOR_DELIVERY',
          note: `Accepted for delivery by ${driver.name}`,
          changedById: driver.id,
        },
      });
      return tx.order.findUniqueOrThrow({ where: { id: existing.id }, include: ORDER_INCLUDE });
    }, { maxWait: 10_000, timeout: 30_000 });

    invalidateActiveDeliveryTargets(driver.id);

    // Every open driver screen drops the order from its pool immediately.
    const dto = serializeOrder(order);
    emitToRole('DRIVER', 'order:updated', { order: serializeDriverOffer(order), previousStatus: dto.status });

    await logActivity({
      action: 'DRIVER_ACCEPTED',
      entity: 'Order',
      entityId: order.id,
      description: `Driver ${driver.name} accepted ${order.orderNumber} for delivery`,
      userId: driver.id,
      actorEmail: driver.email,
      actorRole: driver.role,
      request: req,
    });

    res.json({ data: dto });
  }),
);

/** POST /api/driver/deliveries/:id/complete - OUT_FOR_DELIVERY -> DELIVERED. */
driverRouter.post(
  '/deliveries/:id/pickup',
  writeLimiter,
  asyncHandler(async (req, res) => {
    const { id } = idParamSchema.parse(req.params);
    const driver = getAuth(req).user;
    const order = await requireAssignedOrder(id, driver);
    if (!['PREPARING', 'READY'].includes(order.status)) {
      throw conflict('Pickup can only be confirmed after the kitchen has marked the order served.');
    }
    const updated = await changeOrderStatus({
      orderId: id,
      to: 'OUT_FOR_DELIVERY',
      actor: driver,
      note: 'Pickup confirmed by the driver',
      request: req,
    });
    res.json({ data: serializeOrder(updated) });
  }),
);

driverRouter.post(
  '/deliveries/:id/complete',
  writeLimiter,
  asyncHandler(async (req, res) => {
    const { id } = idParamSchema.parse(req.params);
    const driver = getAuth(req).user;
    await requireAssignedOrder(id, driver);

    const updated = await changeOrderStatus({
      orderId: id,
      to: 'DELIVERED',
      actor: driver,
      note: 'Delivered by the driver',
      request: req,
    });
    res.json({ data: serializeOrder(updated) });
  }),
);

/**
 * POST /api/driver/location - publish the driver's own device position.
 *
 * Used as the REST fallback whenever the live socket is unavailable (weak
 * network, background tab) so tracking never silently stops. The socket event
 * and this endpoint call the exact same service, so fan-out and authorisation
 * behave identically.
 */
driverRouter.post(
  '/location',
  writeLimiter,
  asyncHandler(async (req, res) => {
    const driver = getAuth(req).user;
    const input = driverLocationInputSchema.parse(req.body);
    const result = await publishDriverLocation({ driver, input });
    res.json({ location: result.location, orderIds: result.orderIds });
  }),
);

/** DELETE /api/driver/location - stop sharing (end of shift / left the map). */
driverRouter.delete(
  '/location',
  writeLimiter,
  asyncHandler(async (req, res) => {
    const driver = getAuth(req).user;
    if (hasConnectedDriverSockets(driver.id)) {
      res.json({ ok: true, orderIds: [] });
      return;
    }
    const result = await stopDriverLocation({ id: driver.id });
    res.json({ ok: true, orderIds: result.orderIds });
  }),
);

/** GET /api/driver/location - the driver's own last known position. */
driverRouter.get(
  '/location',
  asyncHandler(async (req, res) => {
    const driver = getAuth(req).user;
    const row = await prisma.driverLocation.findUnique({ where: { driverId: driver.id } });
    res.json({ location: row ? serializeDriverLocation(row, driver.name) : null });
  }),
);

/** POST /api/driver/deliveries/:id/issue - report a delivery problem to the admins. */
driverRouter.post(
  '/deliveries/:id/issue',
  writeLimiter,
  asyncHandler(async (req, res) => {
    const { id } = idParamSchema.parse(req.params);
    const driver = getAuth(req).user;
    const body = z
      .object({ note: z.string().trim().min(5, 'Describe the delivery issue').max(300) })
      .parse(req.body);

    const order = await requireAssignedOrder(id, driver);
    if (order.status === 'DELIVERED' || order.status === 'CANCELLED') {
      throw badRequest('This delivery is already closed.');
    }

    await notifyAdmins({
      title: `Delivery issue • ${order.orderNumber}`,
      body: `${driver.name}: ${body.note}`,
      type: 'BUSINESS_ALERT',
      audience: 'ADMIN',
      orderId: order.id,
      link: '/admin/orders',
    });
    await logActivity({
      action: 'DRIVER_DELIVERY_ISSUE',
      entity: 'Order',
      entityId: order.id,
      description: `Driver reported a delivery issue on ${order.orderNumber}`,
      metadata: { note: body.note },
      userId: driver.id,
      actorEmail: driver.email,
      actorRole: driver.role,
      request: req,
    });

    res.json({ data: serializeOrder(order), message: 'The issue was reported to the administrators.' });
  }),
);
