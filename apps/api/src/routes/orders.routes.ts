import { Router } from 'express';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { PAYMENT_METHODS, type OrderStatus as OrderStatusType } from '@delivery/shared';
import { asyncHandler, paginate, paginateQuery } from '../lib/http';
import { csvSchema, idParamSchema, optionalBooleanQuery, paginationSchema } from '../lib/validation';
import { authenticate, getAuth, requireAdmin } from '../middleware/authenticate';
import { writeLimiter } from '../middleware/rateLimit';
import { prisma } from '../lib/prisma';
import { badRequest, forbidden, notFound } from '../lib/errors';
import {
  assertCanViewOrder,
  assignDriver,
  buildOrderWhere,
  buildReorder,
  changeOrderStatus,
  createOrder,
  getOrderById,
  getOrderByNumber,
} from '../services/order.service';
import { ORDER_INCLUDE, serializeOrder } from '../services/serializers';
import { buildTrackingSnapshot, listLiveDrivers } from '../services/tracking.service';

export const ordersRouter = Router();

const createOrderSchema = z.object({
  items: z
    .array(
      z.object({
        productId: z.string().trim().min(1),
        quantity: z.coerce.number().int().min(1).max(50),
        notes: z.string().trim().max(200).optional(),
      }),
    )
    .min(1, 'Your cart is empty'),
  deliveryAddress: z.string().trim().min(6, 'Enter the full delivery address').max(300),
  deliveryArea: z.string().trim().max(120).optional(),
  deliveryPhone: z.string().trim().min(7, 'Enter a contact phone number').max(20),
  notes: z.string().trim().max(300).optional(),
  paymentMethod: z.enum(PAYMENT_METHODS),
  // Optional device GPS captured at checkout — makes live delivery tracking
  // accurate. Supplying them is never required and never blocks an order.
  deliveryLatitude: z.coerce.number().min(-90).max(90).optional(),
  deliveryLongitude: z.coerce.number().min(-180).max(180).optional(),
});

const listOrderQuerySchema = paginationSchema.extend({
  status: csvSchema,
  q: z.string().trim().max(120).optional(),
  from: z.string().trim().optional(),
  to: z.string().trim().optional(),
  activeOnly: optionalBooleanQuery,
});

function parseDate(value: string | undefined, endOfDay = false): Date | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw badRequest('Use a valid date (YYYY-MM-DD).');
  if (endOfDay) date.setHours(23, 59, 59, 999);
  return date;
}

/** POST /api/orders - place an order (customer accounts). */
ordersRouter.post(
  '/',
  authenticate,
  writeLimiter,
  asyncHandler(async (req, res) => {
    const { user } = getAuth(req);
    if (user.role !== 'CUSTOMER') {
      throw forbidden('Only customer accounts can place orders from the app.');
    }
    const input = createOrderSchema.parse(req.body);
    const order = await createOrder({ user, input, request: req });
    res.status(201).json({ order: serializeOrder(order) });
  }),
);

/** GET /api/orders - the signed-in customer's order history. */
ordersRouter.get(
  '/',
  authenticate,
  asyncHandler(async (req, res) => {
    const { user } = getAuth(req);
    const query = listOrderQuerySchema.parse(req.query);
    const { skip, take } = paginateQuery(query);

    const where = buildOrderWhere({
      customerId: user.role === 'CUSTOMER' ? user.id : undefined,
      status: query.status.length > 0 ? (query.status as OrderStatusType[]) : undefined,
      search: query.q,
      from: parseDate(query.from),
      to: parseDate(query.to, true),
    });
    if (query.activeOnly) {
      where.status = { in: ['RECEIVED', 'ACCEPTED', 'PREPARING', 'READY', 'OUT_FOR_DELIVERY'] };
    }

    const [items, total] = await Promise.all([
      prisma.order.findMany({
        where,
        include: ORDER_INCLUDE,
        orderBy: { createdAt: 'desc' },
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

/** GET /api/orders/active - the live orders shown on the customer dashboard. */
ordersRouter.get(
  '/active',
  authenticate,
  asyncHandler(async (req, res) => {
    const { user } = getAuth(req);
    const where: Prisma.OrderWhereInput = {
      status: { in: ['RECEIVED', 'ACCEPTED', 'PREPARING', 'READY', 'OUT_FOR_DELIVERY'] },
    };
    if (user.role === 'CUSTOMER') where.customerId = user.id;

    const orders = await prisma.order.findMany({
      where,
      include: ORDER_INCLUDE,
      orderBy: { createdAt: 'asc' },
      take: 12,
    });

    res.json({ orders: orders.map(serializeOrder) });
  }),
);

/** GET /api/orders/track/:orderNumber - tracking lookup by order number. */
ordersRouter.get(
  '/track/:orderNumber',
  authenticate,
  asyncHandler(async (req, res) => {
    const orderNumber = z.string().trim().min(3).parse(req.params.orderNumber);
    const order = await getOrderByNumber(orderNumber);
    const { user } = getAuth(req);
    assertCanViewOrder(order, user);
    res.json({ order: serializeOrder(order) });
  }),
);

/**
 * GET /api/orders/live-drivers - every driver currently sharing a position.
 * Operations view for administrators (dispatch + customer service).
 */
ordersRouter.get(
  '/live-drivers',
  authenticate,
  requireAdmin,
  asyncHandler(async (_req, res) => {
    res.json({ drivers: await listLiveDrivers() });
  }),
);

/** GET /api/orders/:id */
ordersRouter.get(
  '/:id',
  authenticate,
  asyncHandler(async (req, res) => {
    const { id } = idParamSchema.parse(req.params);
    const order = await getOrderById(id);
    const { user } = getAuth(req);
    assertCanViewOrder(order, user);
    res.json({ order: serializeOrder(order) });
  }),
);

/**
 * GET /api/orders/:id/tracking - live driver position for one order.
 *
 * Permission-checked: a customer sees only their own order, a driver only a
 * delivery assigned to them, and kitchen/admin accounts may look up any order.
 */
ordersRouter.get(
  '/:id/tracking',
  authenticate,
  asyncHandler(async (req, res) => {
    const { id } = idParamSchema.parse(req.params);
    const { user } = getAuth(req);
    const order = await getOrderById(id);

    if (user.role === 'DRIVER' && order.driverId !== user.id) {
      throw forbidden('That delivery is not assigned to you.');
    }

    res.json({ tracking: await buildTrackingSnapshot(order, user) });
  }),
);

/** POST /api/orders/:id/cancel - customer cancellation before preparation finishes. */
ordersRouter.post(
  '/:id/cancel',
  authenticate,
  asyncHandler(async (req, res) => {
    const { id } = idParamSchema.parse(req.params);
    const body = z.object({ reason: z.string().trim().max(200).optional() }).parse(req.body ?? {});
    const { user } = getAuth(req);
    const order = await getOrderById(id);
    assertCanViewOrder(order, user);

    if (user.role === 'CUSTOMER' && !['RECEIVED', 'ACCEPTED'].includes(order.status)) {
      throw badRequest('This order can no longer be cancelled in the app. Please call the kitchen.');
    }

    const updated = await changeOrderStatus({
      orderId: id,
      to: 'CANCELLED',
      actor: user,
      note: body.reason ?? (user.role === 'CUSTOMER' ? 'Cancelled by the customer' : 'Cancelled'),
      request: req,
    });
    res.json({ order: serializeOrder(updated) });
  }),
);

/** POST /api/orders/:id/assign-driver - admin dispatch: assign or clear the driver. */
ordersRouter.post(
  '/:id/assign-driver',
  authenticate,
  writeLimiter,
  asyncHandler(async (req, res) => {
    const { id } = idParamSchema.parse(req.params);
    const body = z
      .object({ driverId: z.string().trim().min(1).nullable() })
      .parse(req.body);
    const { user } = getAuth(req);
    const updated = await assignDriver({
      orderId: id,
      driverId: body.driverId ?? null,
      actor: user,
      request: req,
    });
    res.json({ order: serializeOrder(updated) });
  }),
);

/** POST /api/orders/:id/reorder - rebuild a cart from a past order. */
ordersRouter.post(
  '/:id/reorder',
  authenticate,
  asyncHandler(async (req, res) => {
    const { id } = idParamSchema.parse(req.params);
    const { user } = getAuth(req);
    const result = await buildReorder(id, user);
    if (result.lines.length === 0) {
      throw notFound('None of the items in that order are available any more.');
    }
    res.json(result);
  }),
);
