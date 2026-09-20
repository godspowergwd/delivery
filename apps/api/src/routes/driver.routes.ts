import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../lib/http';
import { csvSchema, idParamSchema } from '../lib/validation';
import { authenticate, getAuth, requireRole, type SessionUser } from '../middleware/authenticate';
import { writeLimiter } from '../middleware/rateLimit';
import { prisma } from '../lib/prisma';
import { badRequest, conflict, forbidden, notFound } from '../lib/errors';
import { ORDER_INCLUDE, serializeOrder, type OrderWithRelations } from '../services/serializers';
import { changeOrderStatus, statusLabel } from '../services/order.service';
import { logActivity } from '../services/activity-log.service';
import { notifyAdmins } from '../services/notification.service';

export const driverRouter = Router();

// Every driver route requires an authenticated DRIVER account.
driverRouter.use(authenticate, requireRole('DRIVER'));

const listQuerySchema = z.object({
  status: csvSchema,
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
      prisma.order.count({ where: { status: 'READY', driverId: null } }),
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

/** GET /api/driver/available - packed orders waiting for a driver (pickup pool). */
driverRouter.get(
  '/available',
  asyncHandler(async (_req, res) => {
    const orders = await prisma.order.findMany({
      where: { status: 'READY', driverId: null },
      orderBy: { readyAt: 'asc' },
      include: ORDER_INCLUDE,
      take: 50,
    });

    res.json({ data: orders.map(serializeOrder) });
  }),
);

/** POST /api/driver/deliveries/:id/accept - claim a ready order (auto dispatch pool). */
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
    if (existing.status !== 'READY') {
      throw conflict(`Only orders that are ready for pickup can be accepted (currently "${statusLabel(existing.status)}").`);
    }

    const order = await prisma.$transaction(async (tx) => {
      // Re-check inside the transaction so two drivers cannot claim the same order.
      const claimable = await tx.order.findFirst({
        where: { id: existing.id, driverId: null, status: 'READY' },
        select: { id: true },
      });
      if (!claimable) throw conflict('Another driver already accepted this delivery.');

      await tx.order.update({
        where: { id: existing.id },
        data: { driverId: driver.id },
      });
      await tx.orderStatusEvent.create({
        data: {
          orderId: existing.id,
          status: 'READY',
          note: `Accepted for delivery by ${driver.name}`,
          changedById: driver.id,
        },
      });
      return tx.order.findUniqueOrThrow({ where: { id: existing.id }, include: ORDER_INCLUDE });
    });

    res.json({ data: serializeOrder(order) });
  }),
);

/** POST /api/driver/deliveries/:id/pickup - READY -> OUT_FOR_DELIVERY ("On the way"). */
driverRouter.post(
  '/deliveries/:id/pickup',
  writeLimiter,
  asyncHandler(async (req, res) => {
    const { id } = idParamSchema.parse(req.params);
    const driver = getAuth(req).user;
    await requireAssignedOrder(id, driver);

    const updated = await changeOrderStatus({
      orderId: id,
      to: 'OUT_FOR_DELIVERY',
      actor: driver,
      note: 'Driver picked up the order and is on the way',
      request: req,
    });
    res.json({ data: serializeOrder(updated) });
  }),
);

/** POST /api/driver/deliveries/:id/complete - OUT_FOR_DELIVERY -> DELIVERED. */
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

