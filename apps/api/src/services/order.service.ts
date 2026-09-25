import { Prisma, OrderStatus } from '@prisma/client';
import {
  ORDER_STATUS_LABELS,
  computeTotals,
  isValidLatitude,
  isValidLongitude,
  type OrderStatus as OrderStatusType,
  type PaymentMethod,
} from '@delivery/shared';
import { prisma, decimalToNumber } from '../lib/prisma';
import { badRequest, conflict, forbidden, notFound } from '../lib/errors';
import { logger } from '../lib/logger';
import { logActivity } from './activity-log.service';
import { getSettings } from './settings.service';
import { isWithinDeliveryZone } from './geo.service';
import { notifyAdmins, notifyCustomer, notifyDrivers, notifyKitchen, notifyUser } from './notification.service';
import { emitToRole, emitToUser } from '../realtime/socket';
import { ORDER_INCLUDE, serializeOrder, type OrderWithRelations } from './serializers';
import type { SessionUser } from '../middleware/authenticate';
import type { Request } from 'express';

export interface CreateOrderItemInput {
  productId: string;
  quantity: number;
  notes?: string;
}

export interface CreateOrderInput {
  items: CreateOrderItemInput[];
  deliveryAddress: string;
  deliveryArea?: string | null;
  deliveryPhone: string;
  notes?: string | null;
  paymentMethod: PaymentMethod;
  /** Real geocoded delivery pin from a validated suggestion (required). */
  deliveryLatitude: number;
  deliveryLongitude: number;
}

interface LineDraft {
  productId: string;
  name: string;
  imageUrl: string | null;
  unitPrice: number;
  quantity: number;
  lineTotal: number;
  notes: string | null;
}

function orderNumberFor(date: Date, sequence: number): string {
  const stamp = `${String(date.getFullYear()).slice(2)}${String(date.getMonth() + 1).padStart(
    2,
    '0',
  )}${String(date.getDate()).padStart(2, '0')}`;
  return `DS-${stamp}-${String(sequence).padStart(4, '0')}`;
}

function startOfDay(date: Date): Date {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

async function nextOrderNumber(): Promise<string> {
  const now = new Date();
  const todaysCount = await prisma.order.count({ where: { createdAt: { gte: startOfDay(now) } } });
  return orderNumberFor(now, todaysCount + 1);
}

export function statusLabel(status: OrderStatusType): string {
  return ORDER_STATUS_LABELS[status] ?? status;
}

export async function getOrderById(orderId: string): Promise<OrderWithRelations> {
  const order = await prisma.order.findUnique({ where: { id: orderId }, include: ORDER_INCLUDE });
  if (!order) throw notFound('That order could not be found.');
  return order;
}

export async function getOrderByNumber(orderNumber: string): Promise<OrderWithRelations> {
  const order = await prisma.order.findUnique({
    where: { orderNumber },
    include: ORDER_INCLUDE,
  });
  if (!order) throw notFound('That order could not be found.');
  return order;
}

/** Central read-permission check for a single order. */
export function assertCanViewOrder(order: OrderWithRelations, user: SessionUser): void {
  if (user.role === 'ADMIN' || user.role === 'KITCHEN') return;
  if (order.customerId !== user.id) {
    throw forbidden('You can only view your own orders.');
  }
}
/** Validates the cart, prices it server-side and creates the order + kitchen alerts. */
export async function buildOrderDraft(input: CreateOrderInput): Promise<{
  lineDrafts: LineDraft[];
  totals: ReturnType<typeof computeTotals>;
  maxPrepMinutes: number;
  currencySymbol: string;
}> {
  const settings = await getSettings();

  if (!settings.acceptingOrders) {
    throw conflict('The kitchen is currently closed for new orders. Please try again later.');
  }

  const productIds = [...new Set(input.items.map((item) => item.productId))];
  if (productIds.length === 0) throw badRequest('Your cart is empty.');

  const products = await prisma.product.findMany({ where: { id: { in: productIds } } });
  const productMap = new Map(products.map((product) => [product.id, product]));

  const pricedItems: Array<{ unitPrice: number; quantity: number }> = [];
  const lineDrafts: LineDraft[] = [];
  let maxPrepMinutes = 10;

  for (const item of input.items) {
    const product = productMap.get(item.productId);
    if (!product) throw badRequest('One of the products in your cart no longer exists.');
    if (product.isArchived) throw badRequest(`${product.name} is no longer sold.`);
    if (!product.isAvailable) throw badRequest(`${product.name} is currently unavailable.`);
    if (item.quantity < 1) throw badRequest('Quantity must be at least 1.');
    if (product.stock < item.quantity) {
      throw conflict(`Only ${product.stock} × ${product.name} left. Please adjust your cart.`);
    }

    const unitPrice = decimalToNumber(product.price);
    maxPrepMinutes = Math.max(maxPrepMinutes, product.prepTimeMinutes);
    pricedItems.push({ unitPrice, quantity: item.quantity });
    lineDrafts.push({
      productId: product.id,
      name: product.name,
      imageUrl: product.imageUrl,
      unitPrice,
      quantity: item.quantity,
      lineTotal: Math.round(unitPrice * item.quantity * 100) / 100,
      notes: item.notes?.trim() ? item.notes.trim().slice(0, 200) : null,
    });
  }

  const totals = computeTotals({
    items: pricedItems,
    deliveryFee: settings.deliveryFee,
    taxRate: settings.taxRate,
  });

  if (totals.subtotal < settings.minOrderTotal) {
    throw badRequest(
      `The minimum order value is ${settings.currencySymbol}${settings.minOrderTotal.toFixed(2)}.`,
    );
  }

  return { lineDrafts, totals, maxPrepMinutes, currencySymbol: settings.currencySymbol };
}

/** Creates the order row, its items, the initial status event and decrements stock. */
async function persistOrder(params: {
  user: SessionUser;
  input: CreateOrderInput;
  draft: Awaited<ReturnType<typeof buildOrderDraft>>;
}): Promise<string> {
  const { user, input, draft } = params;
  let orderId: string | null = null;
  let attempt = 0;

  while (!orderId && attempt < 5) {
    attempt += 1;
    const orderNumber = await nextOrderNumber();
    try {
      orderId = await prisma.$transaction(async (tx) => {
        const order = await tx.order.create({
          data: {
            orderNumber,
            status: OrderStatus.RECEIVED,
            customerId: user.id,
            deliveryAddress: input.deliveryAddress.trim(),
            deliveryArea: input.deliveryArea?.trim() || null,
            deliveryPhone: input.deliveryPhone.trim(),
            notes: input.notes?.trim() || null,
            // Coordinates are validated by the route schema (required, non 0/0).
            deliveryLatitude: input.deliveryLatitude,
            deliveryLongitude: input.deliveryLongitude,
            subtotal: new Prisma.Decimal(draft.totals.subtotal),
            deliveryFee: new Prisma.Decimal(draft.totals.deliveryFee),
            tax: new Prisma.Decimal(draft.totals.tax),
            discount: new Prisma.Decimal(draft.totals.discount),
            total: new Prisma.Decimal(draft.totals.total),
            itemCount: draft.totals.itemCount,
            paymentMethod: input.paymentMethod,
            estimatedReadyAt: new Date(Date.now() + draft.maxPrepMinutes * 60_000),
            items: { create: draft.lineDrafts },
            events: {
              create: { status: OrderStatus.RECEIVED, changedById: user.id, note: 'Order placed' },
            },
          },
          select: { id: true },
        });

        for (const line of draft.lineDrafts) {
          await tx.product.update({
            where: { id: line.productId },
            data: { stock: { decrement: line.quantity } },
          });
        }

        return order.id;
      }, { maxWait: 10_000, timeout: 30_000 });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        orderId = null;
        continue;
      }
      throw error;
    }
  }

  if (!orderId) throw conflict('Could not allocate an order number. Please try again.');
  return orderId;
}
/**
 * Service-area gate for checkout.
 *
 * The validated geocoded pin is authoritative, so an order from outside the
 * configured delivery radius is refused here as well as in the browser.
 */
async function assertDeliverableTo(latitude: number, longitude: number): Promise<void> {
  const settings = await getSettings();
  const zone = isWithinDeliveryZone(
    latitude,
    longitude,
    settings.businessLatitude,
    settings.businessLongitude,
    settings.deliveryRadiusKm,
  );
  if (zone.within) return;

  logger.warn('Order rejected: delivery location outside the service area', {
    latitude,
    longitude,
    distanceKm: Number(zone.distanceKm.toFixed(2)),
    radiusKm: settings.deliveryRadiusKm,
  });
  throw badRequest(
    zone.message ??
      `We only deliver within ${settings.deliveryRadiusKm} km of ${settings.businessName}.`,
  );
}

export async function createOrder(params: {
  user: SessionUser;
  input: CreateOrderInput;
  request?: Request;
}): Promise<OrderWithRelations> {
  const { user, input, request } = params;
  await assertDeliverableTo(input.deliveryLatitude, input.deliveryLongitude);
  const draft = await buildOrderDraft(input);
  const orderId = await persistOrder({ user, input, draft });
  const fullOrder = await getOrderById(orderId);
  const dto = serializeOrder(fullOrder);
  const money = (amount: number) => `${draft.currencySymbol}${amount.toFixed(2)}`;

  emitToRole('KITCHEN', 'order:created', { order: dto });
  emitToRole('ADMIN', 'order:created', { order: dto });
  emitToUser(user.id, 'order:created', { order: dto });
  emitToRole('ADMIN', 'analytics:refresh', {});

  await notifyKitchen({
    title: `New order ${fullOrder.orderNumber}`,
    body: `${user.name} • ${draft.totals.itemCount} items • ${money(draft.totals.total)}`,
    type: 'ORDER_UPDATE',
    audience: 'KITCHEN',
    orderId: fullOrder.id,
    link: '/kitchen',
  });

  await notifyAdmins({
    title: `New order ${fullOrder.orderNumber}`,
    body: `${user.name} placed an order worth ${money(draft.totals.total)}.`,
    type: 'BUSINESS_ALERT',
    audience: 'ADMIN',
    orderId: fullOrder.id,
    link: '/admin/orders',
  });

  await notifyCustomer({
    userId: user.id,
    title: 'Order received',
    body: `We sent ${fullOrder.orderNumber} to the kitchen. You will be notified the moment it is accepted.`,
    type: 'ORDER_UPDATE',
    audience: 'CUSTOMER',
    orderId: fullOrder.id,
    link: `/app/orders/${fullOrder.id}`,
  });

  const settings = await getSettings();
  const touchedIds = draft.lineDrafts.map((line) => line.productId);
  const lowStock = await prisma.product.findMany({
    where: { id: { in: touchedIds }, stock: { lte: settings.lowStockThreshold } },
    select: { id: true, name: true, stock: true },
  });
  for (const product of lowStock) {
    emitToRole('ADMIN', 'stock:low', {
      productId: product.id,
      name: product.name,
      stock: product.stock,
    });
    await notifyAdmins({
      title: 'Low stock warning',
      body: `${product.name} is down to ${product.stock} unit(s).`,
      type: 'LOW_STOCK',
      audience: 'ADMIN',
      link: '/admin/products',
    });
  }

  await logActivity({
    action: 'ORDER_CREATED',
    entity: 'Order',
    entityId: fullOrder.id,
    description: `Order ${fullOrder.orderNumber} placed with ${draft.totals.itemCount} items`,
    metadata: { total: draft.totals.total, paymentMethod: input.paymentMethod },
    userId: user.id,
    actorEmail: user.email,
    actorRole: user.role,
    request,
  });

  return fullOrder;
}
export interface ChangeStatusInput {
  orderId: string;
  to: OrderStatusType;
  actor: SessionUser;
  note?: string | null;
  request?: Request;
}

const CUSTOMER_MESSAGES: Partial<Record<OrderStatusType, { title: string; body: string }>> = {
  ACCEPTED: {
    title: 'Order accepted',
    body: 'The kitchen accepted your order and will start preparing it shortly.',
  },
  PREPARING: { title: 'Order being served', body: 'The kitchen is preparing your meal right now.' },
  READY: { title: 'Order ready', body: 'Your order is ready and waiting to be dispatched.' },
  OUT_FOR_DELIVERY: {
    title: 'Out for delivery',
    body: 'Your order left the kitchen and is on its way to you.',
  },
  DELIVERED: { title: 'Order delivered', body: 'Enjoy your meal! Thanks for ordering with us.' },
};

function assertTransitionAllowed(
  order: OrderWithRelations,
  next: OrderStatusType,
  actor: SessionUser,
): void {
  if (actor.role === 'ADMIN') return; // administrators may override any status

  if (actor.role === 'CUSTOMER') {
    if (order.customerId !== actor.id) throw forbidden('You can only update your own orders.');
    if (next !== OrderStatus.CANCELLED) {
      throw forbidden('Customers can only cancel an order.');
    }
    return;
  }

  if (actor.role === 'DRIVER') {
    if (order.driverId !== actor.id) {
      throw forbidden('You can only update deliveries assigned to you.');
    }
    // Drivers may only advance their own assigned deliveries one step at a time.
    const allowedByState: Partial<Record<OrderStatusType, OrderStatusType[]>> = {
      // Drivers claim out-for-delivery orders, then complete them.
      OUT_FOR_DELIVERY: ['DELIVERED'],
    };
    const allowed = allowedByState[order.status] ?? [];
    if (!allowed.includes(next)) {
      throw conflict(`A delivery in state "${statusLabel(order.status)}" cannot move to "${statusLabel(next)}".`);
    }
    return;
  }

  // Kitchen staff follow the delivery workflow one step at a time.
  const allowed = allowedKitchenTransitions(order.status);
  if (!allowed.includes(next)) {
    throw conflict(`An order in state "${statusLabel(order.status)}" cannot move to "${statusLabel(next)}".`);
  }
}

export function allowedKitchenTransitions(current: OrderStatus): OrderStatusType[] {
  switch (current) {
    case OrderStatus.RECEIVED:
      return ['ACCEPTED', 'CANCELLED'];
    case OrderStatus.ACCEPTED:
      return ['PREPARING', 'CANCELLED'];
    case OrderStatus.PREPARING:
      // Simplified lifecycle: serving goes straight out for delivery.
      return ['OUT_FOR_DELIVERY', 'CANCELLED'];
    case OrderStatus.READY:
      // Legacy packed orders dispatch straight to the driver.
      return ['OUT_FOR_DELIVERY', 'CANCELLED'];
    case OrderStatus.OUT_FOR_DELIVERY:
      // Only the assigned driver completes a delivery (admins can override).
      return [];
    default:
      return [];
  }
}

export async function changeOrderStatus(input: ChangeStatusInput): Promise<OrderWithRelations> {
  const { orderId, to, actor, note, request } = input;
  const order = await getOrderById(orderId);

  if (order.status === to) {
    throw conflict(`The order is already ${statusLabel(to).toLowerCase()}.`);
  }
  assertTransitionAllowed(order, to, actor);

  const now = new Date();
  const data: Prisma.OrderUpdateInput = { status: to };

  switch (to) {
    case 'ACCEPTED':
      data.acceptedAt = now;
      data.acceptedBy = { connect: { id: actor.id } };
      break;
    case 'PREPARING':
      data.preparingAt = now;
      break;
    case 'READY':
      data.readyAt = now;
      break;
    case 'OUT_FOR_DELIVERY':
      data.outForDeliveryAt = now;
      break;
    case 'DELIVERED':
      data.deliveredAt = now;
      data.completedBy = { connect: { id: actor.id } };
      if (order.paymentMethod === 'CASH') data.paymentStatus = 'PAID';
      break;
    case 'CANCELLED':
      data.cancelledAt = now;
      data.cancelReason = note?.trim() || 'Cancelled';
      break;
    default:
      break;
  }

  const updated = await prisma.$transaction(async (tx) => {
    await tx.order.update({ where: { id: order.id }, data });
    await tx.orderStatusEvent.create({
      data: {
        orderId: order.id,
        status: to,
        note: note?.trim() || null,
        changedById: actor.id,
      },
    });
    return tx.order.findUniqueOrThrow({ where: { id: order.id }, include: ORDER_INCLUDE });
  }, { maxWait: 10_000, timeout: 30_000 });

  const dto = serializeOrder(updated);
  emitToRole('KITCHEN', 'order:updated', { order: dto, previousStatus: order.status });
  emitToRole('ADMIN', 'order:updated', { order: dto, previousStatus: order.status });
  emitToRole('DRIVER', 'order:updated', { order: dto, previousStatus: order.status });
  emitToUser(order.customerId, 'order:updated', { order: dto, previousStatus: order.status });

  if (to === 'CANCELLED') {
    await notifyCustomer({
      userId: order.customerId,
      title: `Order ${order.orderNumber} cancelled`,
      body: note?.trim() ? note.trim() : 'Your order was cancelled.',
      type: 'ORDER_UPDATE',
      audience: 'CUSTOMER',
      orderId: order.id,
      link: `/app/orders/${order.id}`,
    });
    await notifyAdmins({
      title: `Order ${order.orderNumber} cancelled`,
      body: `${statusLabel(order.status)} → Cancelled by ${actor.name}.`,
      type: 'BUSINESS_ALERT',
      audience: 'ADMIN',
      orderId: order.id,
      link: '/admin/orders',
    });
    if (order.driverId) {
      await notifyUser(order.driverId, {
        title: `Delivery cancelled • ${order.orderNumber}`,
        body: 'This delivery was cancelled. It has been removed from your list.',
        type: 'ORDER_UPDATE',
        audience: 'DRIVER',
        orderId: order.id,
        link: '/driver/deliveries',
      });
    }
  } else {
    const message = CUSTOMER_MESSAGES[to];
    if (message) {
      await notifyCustomer({
        userId: order.customerId,
        title: `${message.title} • ${order.orderNumber}`,
        body: message.body,
        type: 'ORDER_UPDATE',
        audience: 'CUSTOMER',
        orderId: order.id,
        link: `/app/orders/${order.id}`,
      });
    }
    if (to === 'RECEIVED') {
      await notifyKitchen({
        title: `Order ${order.orderNumber} reopened`,
        body: `Moved back to "Order received" by ${actor.name}.`,
        type: 'ORDER_UPDATE',
        audience: 'KITCHEN',
        orderId: order.id,
        link: '/kitchen',
      });
    }
    if (to === 'OUT_FOR_DELIVERY') {
      await notifyDrivers({
        title: `New delivery • ${order.orderNumber}`,
        body: 'The kitchen sent an order out for delivery. Open Deliveries to accept it.',
        type: 'ORDER_UPDATE',
        audience: 'DRIVER',
        orderId: order.id,
        link: '/driver/deliveries',
      });
    }
  }

  if (to === 'DELIVERED' || to === 'CANCELLED') {
    emitToRole('ADMIN', 'analytics:refresh', {});
  }

  await logActivity({
    action: `ORDER_${to}`,
    entity: 'Order',
    entityId: order.id,
    description: `Order ${order.orderNumber}: ${statusLabel(order.status)} → ${statusLabel(to)}`,
    metadata: { note: note ?? null, actorRole: actor.role },
    userId: actor.id,
    actorEmail: actor.email,
    actorRole: actor.role,
    request,
  });

  return updated;
}

/**
 * Admin dispatch: assigns (or clears) the driver for an order that is ready to
 * leave the kitchen. The driver is notified in real time, exactly like the
 * automatic pickup pool.
 */
export async function assignDriver(params: {
  orderId: string;
  driverId: string | null;
  actor: SessionUser;
  request?: Request;
}): Promise<OrderWithRelations> {
  const { orderId, driverId, actor, request } = params;
  if (actor.role !== 'ADMIN') {
    throw forbidden('Only administrators can dispatch orders to drivers.');
  }

  const order = await getOrderById(orderId);
  if (['RECEIVED', 'DELIVERED', 'CANCELLED'].includes(order.status)) {
    throw badRequest(
      `A driver can only be assigned to an accepted, preparing, ready or out-for-delivery order (currently "${statusLabel(order.status)}").`,
    );
  }

  if (driverId) {
    const driver = await prisma.user.findFirst({
      where: { id: driverId, role: 'DRIVER', isActive: true },
      select: { id: true },
    });
    if (!driver) throw badRequest('Select an active driver account.');
  }

  const previousDriverId = order.driverId;
  const updated = await prisma.$transaction(async (tx) => {
    await tx.order.update({ where: { id: order.id }, data: { driverId } });
    await tx.orderStatusEvent.create({
      data: {
        orderId: order.id,
        status: order.status,
        note: driverId ? `Driver dispatched by ${actor.name}` : `Driver removed by ${actor.name}`,
        changedById: actor.id,
      },
    });
    return tx.order.findUniqueOrThrow({ where: { id: order.id }, include: ORDER_INCLUDE });
  }, { maxWait: 10_000, timeout: 30_000 });

  const dto = serializeOrder(updated);
  emitToRole('KITCHEN', 'order:updated', { order: dto, previousStatus: order.status });
  emitToRole('ADMIN', 'order:updated', { order: dto, previousStatus: order.status });
  emitToRole('DRIVER', 'order:updated', { order: dto, previousStatus: order.status });
  emitToUser(order.customerId, 'order:updated', { order: dto, previousStatus: order.status });

  if (driverId) {
    await notifyUser(driverId, {
      title: `New delivery assigned • ${order.orderNumber}`,
      body: `${order.customer?.name ?? 'A customer'} • ${order.itemCount} item(s) • ${order.deliveryArea ?? order.deliveryAddress}`,
      type: 'ORDER_UPDATE',
      audience: 'DRIVER',
      orderId: order.id,
      link: '/driver/map',
      createdById: actor.id,
    });
  } else if (previousDriverId) {
    await notifyUser(previousDriverId, {
      title: `Delivery reassigned • ${order.orderNumber}`,
      body: 'This delivery was taken off your list by an administrator.',
      type: 'ORDER_UPDATE',
      audience: 'DRIVER',
      orderId: order.id,
      link: '/driver/deliveries',
      createdById: actor.id,
    });
  }

  await logActivity({
    action: driverId ? 'ORDER_DRIVER_ASSIGNED' : 'ORDER_DRIVER_UNASSIGNED',
    entity: 'Order',
    entityId: order.id,
    description: `Order ${order.orderNumber}: driver ${driverId ? 'assigned' : 'cleared'} by ${actor.name}`,
    metadata: { driverId, previousDriverId },
    userId: actor.id,
    actorEmail: actor.email,
    actorRole: actor.role,
    request,
  });

  return updated;
}

export interface ReorderLine {
  productId: string;
  name: string;
  price: number;
  quantity: number;
  imageUrl: string | null;
  available: boolean;
  reason?: string;
}

/** Rebuilds a cart from a past order using today's prices and availability. */
export async function buildReorder(
  orderId: string,
  user: SessionUser,
): Promise<{ orderNumber: string; lines: ReorderLine[]; unavailable: ReorderLine[] }> {
  const order = await getOrderById(orderId);
  assertCanViewOrder(order, user);

  const productIds = order.items
    .map((item) => item.productId)
    .filter((id): id is string => Boolean(id));
  const products = await prisma.product.findMany({ where: { id: { in: productIds } } });
  const productMap = new Map(products.map((product) => [product.id, product]));

  const lines: ReorderLine[] = [];
  const unavailable: ReorderLine[] = [];

  for (const item of order.items) {
    const product = item.productId ? productMap.get(item.productId) : undefined;
    if (!product) {
      unavailable.push({
        productId: item.productId ?? item.id,
        name: item.name,
        price: decimalToNumber(item.unitPrice),
        quantity: item.quantity,
        imageUrl: item.imageUrl,
        available: false,
        reason: 'No longer sold',
      });
      continue;
    }
    if (product.isArchived) {
      unavailable.push({
        productId: product.id,
        name: product.name,
        price: decimalToNumber(product.price),
        quantity: item.quantity,
        imageUrl: product.imageUrl,
        available: false,
        reason: 'Archived',
      });
      continue;
    }
    if (!product.isAvailable) {
      unavailable.push({
        productId: product.id,
        name: product.name,
        price: decimalToNumber(product.price),
        quantity: item.quantity,
        imageUrl: product.imageUrl,
        available: false,
        reason: 'Currently unavailable',
      });
      continue;
    }

    const quantity = Math.max(1, Math.min(item.quantity, Math.max(1, product.stock)));
    lines.push({
      productId: product.id,
      name: product.name,
      price: decimalToNumber(product.price),
      quantity,
      imageUrl: product.imageUrl,
      available: true,
    });
  }

  return { orderNumber: order.orderNumber, lines, unavailable };
}

export interface OrderQueryFilters {
  status?: OrderStatusType[];
  search?: string;
  from?: Date;
  to?: Date;
  customerId?: string;
  kitchenActiveOnly?: boolean;
}

/** Builds the Prisma filter used by every order list endpoint. */
export function buildOrderWhere(filters: OrderQueryFilters): Prisma.OrderWhereInput {
  const where: Prisma.OrderWhereInput = {};
  const and: Prisma.OrderWhereInput[] = [];

  if (filters.status && filters.status.length > 0) {
    where.status = { in: filters.status as OrderStatus[] };
  }
  if (filters.customerId) {
    where.customerId = filters.customerId;
  }
  if (filters.from || filters.to) {
    where.createdAt = {
      ...(filters.from ? { gte: filters.from } : {}),
      ...(filters.to ? { lte: filters.to } : {}),
    };
  }
  if (filters.kitchenActiveOnly) {
    and.push({ status: { in: ['ACCEPTED', 'PREPARING'] as OrderStatus[] } });
  }
  if (filters.search) {
    const term = filters.search.trim();
    if (term.length > 0) {
      and.push({
        OR: [
          { orderNumber: { contains: term, mode: 'insensitive' } },
          { deliveryPhone: { contains: term, mode: 'insensitive' } },
          { customer: { name: { contains: term, mode: 'insensitive' } } },
        ],
      });
    }
  }
  if (and.length > 0) where.AND = and;
  return where;
}
