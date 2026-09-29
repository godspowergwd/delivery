import { Router, type Request } from 'express';
import { z } from 'zod';
import { ORDER_STATUSES, PAYMENT_METHODS, type OrderStatus as OrderStatusType } from '@delivery/shared';
import { asyncHandler, paginate, paginateQuery } from '../lib/http';
import {
  csvSchema,
  idParamSchema,
  nameSchema,
  paginationSchema,
  passwordSchema,
  phoneSchema,
  usernameSchema,
} from '../lib/validation';
import {
  authenticate,
  getAuth,
  requireKitchenOrAdmin,
  type SessionUser,
} from '../middleware/authenticate';
import { writeLimiter } from '../middleware/rateLimit';
import { prisma } from '../lib/prisma';
import { badRequest } from '../lib/errors';
import {
  allowedKitchenTransitions,
  buildOrderWhere,
  changeOrderStatus,
  createWalkInOrder,
  getOrderById,
} from '../services/order.service';
import { ORDER_INCLUDE, serializeOrder } from '../services/serializers';
import { ensureReceipt, receiptDto, type ReceiptPayload } from '../services/receipt.service';
import { applyRestaurantStatus, getRestaurantStatus } from '../services/restaurant.service';
import {
  createDriver,
  listDrivers,
  resetDriverLogin,
  setDriverActive,
} from '../services/driver.service';

export const kitchenRouter = Router();

const kitchenQuerySchema = paginationSchema.extend({
  status: csvSchema,
  q: z.string().trim().max(120).optional(),
  /** Completed-tab history window (YYYY-MM-DD, inclusive). */
  from: z.string().trim().max(40).optional(),
  to: z.string().trim().max(40).optional(),
});

const statusBodySchema = z.object({
  status: z.enum([...ORDER_STATUSES]),
  note: z.string().trim().max(200).optional(),
});

const restaurantStatusBodySchema = z.object({
  open: z.boolean(),
  note: z.string().trim().max(200).optional(),
});

const createDriverSchema = z.object({
  name: nameSchema,
  username: usernameSchema,
  password: passwordSchema,
  phone: phoneSchema.optional(),
  notes: z.string().trim().max(240).optional(),
});

const resetDriverPasswordSchema = z.object({ newPassword: passwordSchema.optional() });

export const walkInOrderSchema = z.object({
  items: z.array(z.object({
    productId: z.string().trim().min(1),
    quantity: z.coerce.number().int().min(1).max(50),
    notes: z.string().trim().max(200).optional(),
  })).min(1).max(100),
  fulfillmentType: z.enum(['PICKUP', 'DELIVERY']),
  customerName: z.string().trim().min(2).max(120).optional(),
  deliveryPhone: z.string().trim().min(7).max(20).optional(),
  deliveryAddress: z.string().trim().min(6).max(300).optional(),
  deliveryLatitude: z.number().finite().min(-90).max(90).optional(),
  deliveryLongitude: z.number().finite().min(-180).max(180).optional(),
  deliveryLocationSource: z.enum(['gps', 'search']).optional(),
  deliveryLocationConfirmedAt: z.string().datetime({ offset: true }).optional().transform((value) =>
    value ? new Date(value) : undefined,
  ),
  deliveryOriginalLatitude: z.number().finite().min(-90).max(90).nullable().optional(),
  deliveryOriginalLongitude: z.number().finite().min(-180).max(180).nullable().optional(),
  paymentMethod: z.enum(PAYMENT_METHODS),
  paymentStatus: z.enum(['PAID', 'PENDING']).optional(),
  idempotencyKey: z.string().uuid(),
}).superRefine((input, context) => {
  if (input.fulfillmentType === 'DELIVERY') {
    for (const key of ['customerName', 'deliveryPhone', 'deliveryAddress', 'deliveryLatitude', 'deliveryLongitude', 'deliveryLocationSource'] as const) {
      if (input[key] == null || input[key] === '') {
        context.addIssue({ code: 'custom', path: [key], message: 'Required for delivery orders.' });
      }
    }
  }
  if ((input.deliveryOriginalLatitude == null) !== (input.deliveryOriginalLongitude == null)) {
    context.addIssue({ code: 'custom', path: ['deliveryOriginalLongitude'], message: 'Original coordinates must be supplied as a pair.' });
  }
  if (input.deliveryLocationSource === 'gps' && input.deliveryOriginalLatitude == null) {
    context.addIssue({ code: 'custom', path: ['deliveryOriginalLatitude'], message: 'GPS orders must retain their original coordinates.' });
  }
  const ids = input.items.map((item) => item.productId);
  if (new Set(ids).size !== ids.length) {
    context.addIssue({ code: 'custom', path: ['items'], message: 'Each product can only appear once in the cart.' });
  }
});

/** Parses an optional YYYY-MM-DD (or ISO) query bound; end of day when asked. */
function parseBound(value: string | undefined, endOfDay = false): Date | undefined {
  if (!value) return undefined;
  const date = new Date(value.length <= 10 ? `${value}T00:00:00` : value);
  if (Number.isNaN(date.getTime())) throw badRequest('Use a valid date (YYYY-MM-DD).');
  if (endOfDay) date.setHours(23, 59, 59, 999);
  return date;
}

/** POST /api/kitchen/walk-in/orders - create a pickup sale or existing-workflow delivery. */
kitchenRouter.post(
  '/walk-in/orders',
  authenticate,
  requireKitchenOrAdmin,
  writeLimiter,
  asyncHandler(async (req, res) => {
    const input = walkInOrderSchema.parse(req.body);
    const user = getAuth(req).user;
    const order = await createWalkInOrder({ input, user, request: req });
    const receipt = await ensureReceipt(order.id, user.id);
    res.status(201).json({
      order: serializeOrder(order),
      receipt: receiptDto(receipt.payload as unknown as ReceiptPayload, receipt.qrDataUrl),
    });
  }),
);

/** GET /api/kitchen/summary - counts and revenue for the kitchen dashboard cards. */
kitchenRouter.get(
  '/summary',
  authenticate,
  requireKitchenOrAdmin,
  asyncHandler(async (_req, res) => {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const [
      incoming,
      active,
      serving,
      outForDelivery,
      preparing,
      ready,
      completedToday,
      cancelledToday,
      todayRevenue,
    ] = await Promise.all([
      prisma.order.count({ where: { status: 'RECEIVED' } }),
      prisma.order.count({ where: { status: { in: ['ACCEPTED', 'PREPARING', 'READY'] } } }),
      prisma.order.count({ where: { status: { in: ['PREPARING', 'READY'] } } }),
      prisma.order.count({ where: { status: 'OUT_FOR_DELIVERY' } }),
      // Kitchen board columns: New -> Preparing -> Ready -> Completed.
      prisma.order.count({ where: { status: { in: ['ACCEPTED', 'PREPARING'] } } }),
      prisma.order.count({ where: { status: { in: ['READY', 'OUT_FOR_DELIVERY'] } } }),
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
      serving,
      outForDelivery,
      completedToday,
      cancelledToday,
      todayRevenue: todayRevenue._sum.total ? Number(todayRevenue._sum.total) : 0,
      // Kitchen board counts (New / Preparing / Ready tabs). Additive, so any
      // existing consumer of this endpoint keeps working unchanged.
      newOrders: incoming,
      preparing,
      ready,
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
    const explicitFrom = parseBound(query.from);
    const from = explicitFrom ?? (onlyHistory ? new Date(new Date().setHours(0, 0, 0, 0)) : undefined);

    const where = buildOrderWhere({
      status: statuses.length > 0 ? statuses : undefined,
      search: query.q,
      from,
      to: parseBound(query.to, true),
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

/** POST /api/kitchen/orders/:id/dispatch - third kitchen action: serving -> out for delivery. */
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

// Delivery completion belongs to the driver: POST /api/driver/deliveries/:id/complete

/* ==========================================================================
   Restaurant status (Kitchen > Settings > Restaurant Status)
   The Kitchen decides when the restaurant opens and closes — no opening hours
   are hardcoded anywhere. The state is stored in PostgreSQL and, the moment it
   changes, it is broadcast to every connected device (customers, drivers,
   kitchen screens and admins) so nothing needs a manual refresh.
   ========================================================================== */

/** GET /api/kitchen/status - current restaurant status for the kitchen card. */
kitchenRouter.get(
  '/status',
  authenticate,
  requireKitchenOrAdmin,
  asyncHandler(async (_req, res) => {
    res.json({ status: await getRestaurantStatus() });
  }),
);

/** POST /api/kitchen/status - open or close the restaurant for new orders. */
kitchenRouter.post(
  '/status',
  authenticate,
  requireKitchenOrAdmin,
  writeLimiter,
  asyncHandler(async (req, res) => {
    const body = restaurantStatusBodySchema.parse(req.body);
    const { status } = await applyRestaurantStatus({
      open: body.open,
      note: body.note,
      actor: getAuth(req).user,
      request: req,
    });
    res.json({ status });
  }),
);

/* ==========================================================================
   Driver management (Kitchen > Settings > Driver Management)
   A kitchen operational feature: create driver accounts, hand over the login,
   issue a new password, disable or re-enable. Drivers are never deleted and
   Administrator accounts are out of reach — order history, assignments and
   earnings are preserved exactly as they are.
   ========================================================================== */

/** GET /api/kitchen/drivers - every driver with live status and counters. */
kitchenRouter.get(
  '/drivers',
  authenticate,
  requireKitchenOrAdmin,
  asyncHandler(async (_req, res) => {
    res.json({ drivers: await listDrivers() });
  }),
);

/** POST /api/kitchen/drivers - create a driver account immediately. */
kitchenRouter.post(
  '/drivers',
  authenticate,
  requireKitchenOrAdmin,
  writeLimiter,
  asyncHandler(async (req, res) => {
    const body = createDriverSchema.parse(req.body);
    const result = await createDriver({
      input: body,
      actor: getAuth(req).user,
      request: req,
    });
    res.status(201).json(result);
  }),
);

/** POST /api/kitchen/drivers/:id/reset-password - issue a new login to copy/share. */
kitchenRouter.post(
  '/drivers/:id/reset-password',
  authenticate,
  requireKitchenOrAdmin,
  writeLimiter,
  asyncHandler(async (req, res) => {
    const { id } = idParamSchema.parse(req.params);
    const body = resetDriverPasswordSchema.parse(req.body ?? {});
    const result = await resetDriverLogin({
      driverId: id,
      newPassword: body.newPassword,
      actor: getAuth(req).user,
    });
    res.json(result);
  }),
);

/** POST /api/kitchen/drivers/:id/disable - block sign-in without losing history. */
kitchenRouter.post(
  '/drivers/:id/disable',
  authenticate,
  requireKitchenOrAdmin,
  writeLimiter,
  asyncHandler(async (req, res) => {
    const { id } = idParamSchema.parse(req.params);
    const driver = await setDriverActive({
      driverId: id,
      isActive: false,
      actor: getAuth(req).user,
      request: req,
    });
    res.json({ driver });
  }),
);

/** POST /api/kitchen/drivers/:id/enable - restore sign-in for a driver. */
kitchenRouter.post(
  '/drivers/:id/enable',
  authenticate,
  requireKitchenOrAdmin,
  writeLimiter,
  asyncHandler(async (req, res) => {
    const { id } = idParamSchema.parse(req.params);
    const driver = await setDriverActive({
      driverId: id,
      isActive: true,
      actor: getAuth(req).user,
      request: req,
    });
    res.json({ driver });
  }),
);
