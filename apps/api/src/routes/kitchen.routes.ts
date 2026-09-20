import { Router, type Request } from 'express';
import { z } from 'zod';
import { ORDER_STATUSES, type OrderStatus as OrderStatusType } from '@delivery/shared';
import { asyncHandler, paginate, paginateQuery } from '../lib/http';
import { csvSchema, idParamSchema, paginationSchema } from '../lib/validation';
import {
  authenticate,
  getAuth,
  requireKitchenOrAdmin,
  type SessionUser,
} from '../middleware/authenticate';
import { prisma } from '../lib/prisma';
import { badRequest, forbidden } from '../lib/errors';
import {
  allowedKitchenTransitions,
  buildOrderWhere,
  changeOrderStatus,
  getOrderById,
} from '../services/order.service';
import { ORDER_INCLUDE, serializeOrder } from '../services/serializers';

export const kitchenRouter = Router();

const kitchenQuerySchema = paginationSchema.extend({
  status: csvSchema,
  q: z.string().trim().max(120).optional(),
});

const statusBodySchema = z.object({
  status: z.enum([...ORDER_STATUSES]),
  note: z.string().trim().max(200).optional(),
});

const rejectBodySchema = z.object({
  reason: z.string().trim().min(3, 'Tell the customer why this order was rejected').max(200),
});

/** GET /api/kitchen/summary - counts and revenue for the kitchen dashboard cards. */
kitchenRouter.get(
  '/summary',
  authenticate,
  requireKitchenOrAdmin,
  asyncHandler(async (_req, res) => {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const [incoming, active, preparing, ready, completedToday, cancelledToday, todayRevenue] =
      await Promise.all([
        prisma.order.count({ where: { status: 'RECEIVED' } }),
        prisma.order.count({ where: { status: { in: ['ACCEPTED', 'PREPARING'] } } }),
        prisma.order.count({ where: { status: 'PREPARING' } }),
        prisma.order.count({ where: { status: 'READY' } }),
        prisma.order.count({ where: { status: 'DELIVERED', createdAt: { gte: todayStart } } }),
        prisma.order.count({ where: { status: 'CANCELLED', createdAt: { gte: todayStart } } }),
        prisma.order.aggregate({
          _sum: { total: true },
          where: { createdAt: { gte: todayStart }, status: { not: 'CANCELLED' } },
        }),
      ]);

    res.json({
      incoming,
      active,
      preparing,
      ready,
      completedToday,
      cancelledToday,
      todayRevenue: todayRevenue._sum.total ? Number(todayRevenue._sum.total) : 0,
    });
  }),
);

/** GET /api/kitchen/orders - queue, active, ready and history lists. */
kitchenRouter.get(
  '/orders',
  authenticate,
  requireKitchenOrAdmin,
  asyncHandler(async (req, res) => {
    const query = kitchenQuerySchema.parse(req.query);
    const { skip, take } = paginateQuery(query);
    const statuses = query.status as OrderStatusType[];

    // Completed/cancelled lists default to today's work; live queues are unbounded.
    const liveStatuses = ['RECEIVED', 'ACCEPTED', 'PREPARING', 'READY', 'OUT_FOR_DELIVERY'];
    const onlyHistory = statuses.length > 0 && statuses.every((status) => !liveStatuses.includes(status));
    const from = onlyHistory ? new Date(new Date().setHours(0, 0, 0, 0)) : undefined;

    const where = buildOrderWhere({
      status: statuses.length > 0 ? statuses : undefined,
      search: query.q,
      from,
    });

    const [items, total] = await Promise.all([
      prisma.order.findMany({
        where,
        include: ORDER_INCLUDE,
        orderBy: { createdAt: statuses.length === 0 ? 'asc' : 'desc' },
        skip,
        take,
      }),
      prisma.order.count({ where }),
    ]);

    res.json(
      paginate(items.map(serializeOrder), total, {
        page: query.page,
        pageSize: query.pageSize,
        skip,
        take,
      }),
    );
  }),
);

/** GET /api/kitchen/orders/:id - full ticket detail. */
kitchenRouter.get(
  '/orders/:id',
  authenticate,
  requireKitchenOrAdmin,
  asyncHandler(async (req, res) => {
    const { id } = idParamSchema.parse(req.params);
    const order = await getOrderById(id);
    res.json({
      order: serializeOrder(order),
      allowedTransitions: allowedKitchenTransitions(order.status),
    });
  }),
);

/** Shared workflow transition with kitchen permission rules applied. */
async function advance(params: {
  orderId: string;
  status: OrderStatusType;
  note?: string;
  actor: SessionUser;
  request?: Request;
}) {
  const order = await getOrderById(params.orderId);
  const allowed = allowedKitchenTransitions(order.status);
  if (params.actor.role !== 'ADMIN' && !allowed.includes(params.status)) {
    throw badRequest(
      `An order that is "${order.status}" cannot move to "${params.status}". Refresh the queue.`,
    );
  }
  return changeOrderStatus({
    orderId: params.orderId,
    to: params.status,
    actor: params.actor,
    note: params.note,
    request: params.request,
  });
}

/** POST /api/kitchen/orders/:id/status - generic workflow transition. */
kitchenRouter.post(
  '/orders/:id/status',
  authenticate,
  requireKitchenOrAdmin,
  asyncHandler(async (req, res) => {
    const { id } = idParamSchema.parse(req.params);
    const body = statusBodySchema.parse(req.body);
    const updated = await advance({
      orderId: id,
      status: body.status,
      note: body.note,
      actor: getAuth(req).user,
      request: req,
    });
    res.json({ order: serializeOrder(updated) });
  }),
);

/** POST /api/kitchen/orders/:id/accept */
kitchenRouter.post(
  '/orders/:id/accept',
  authenticate,
  requireKitchenOrAdmin,
  asyncHandler(async (req, res) => {
    const { id } = idParamSchema.parse(req.params);
    const updated = await advance({
      orderId: id,
      status: 'ACCEPTED',
      note: 'Accepted by the kitchen',
      actor: getAuth(req).user,
      request: req,
    });
    res.json({ order: serializeOrder(updated) });
  }),
);

/** POST /api/kitchen/orders/:id/reject - requires a reason for the customer. */
kitchenRouter.post(
  '/orders/:id/reject',
  authenticate,
  requireKitchenOrAdmin,
  asyncHandler(async (req, res) => {
    const { id } = idParamSchema.parse(req.params);
    const body = rejectBodySchema.parse(req.body);
    const actor = getAuth(req).user;
    const order = await getOrderById(id);
    if (actor.role !== 'ADMIN' && !allowedKitchenTransitions(order.status).includes('CANCELLED')) {
      throw forbidden('That order is too far along to be rejected.');
    }
    const updated = await changeOrderStatus({
      orderId: id,
      to: 'CANCELLED',
      actor,
      note: body.reason,
      request: req,
    });
    res.json({ order: serializeOrder(updated) });
  }),
);

/** POST /api/kitchen/orders/:id/preparing */
kitchenRouter.post(
  '/orders/:id/preparing',
  authenticate,
  requireKitchenOrAdmin,
  asyncHandler(async (req, res) => {
    const { id } = idParamSchema.parse(req.params);
    const updated = await advance({
      orderId: id,
      status: 'PREPARING',
      note: 'Preparation started',
      actor: getAuth(req).user,
      request: req,
    });
    res.json({ order: serializeOrder(updated) });
  }),
);

/** POST /api/kitchen/orders/:id/ready */
kitchenRouter.post(
  '/orders/:id/ready',
  authenticate,
  requireKitchenOrAdmin,
  asyncHandler(async (req, res) => {
    const { id } = idParamSchema.parse(req.params);
    const updated = await advance({
      orderId: id,
      status: 'READY',
      note: 'Order ready for dispatch',
      actor: getAuth(req).user,
      request: req,
    });
    res.json({ order: serializeOrder(updated) });
  }),
);

/** POST /api/kitchen/orders/:id/dispatch - the order leaves the kitchen. */
kitchenRouter.post(
  '/orders/:id/dispatch',
  authenticate,
  requireKitchenOrAdmin,
  asyncHandler(async (req, res) => {
    const { id } = idParamSchema.parse(req.params);
    const updated = await advance({
      orderId: id,
      status: 'OUT_FOR_DELIVERY',
      note: 'Out for delivery',
      actor: getAuth(req).user,
      request: req,
    });
    res.json({ order: serializeOrder(updated) });
  }),
);

/** POST /api/kitchen/orders/:id/complete - mark the order delivered. */
kitchenRouter.post(
  '/orders/:id/complete',
  authenticate,
  requireKitchenOrAdmin,
  asyncHandler(async (req, res) => {
    const { id } = idParamSchema.parse(req.params);
    const updated = await advance({
      orderId: id,
      status: 'DELIVERED',
      note: 'Order completed',
      actor: getAuth(req).user,
      request: req,
    });
    res.json({ order: serializeOrder(updated) });
  }),
);
