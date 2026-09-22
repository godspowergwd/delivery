import type { Prisma } from '@prisma/client';
import type {
  AddressDTO,
  CategoryDTO,
  NotificationDTO,
  OrderDTO,
  OrderItemDTO,
  OrderStatusEventDTO,
  ProductDTO,
} from '@delivery/shared';
import { decimalToNumber } from '../lib/prisma';
import { serializeNotification } from './notification.service';

export const ORDER_INCLUDE = {
  items: { orderBy: { createdAt: 'asc' } },
  events: {
    orderBy: { createdAt: 'asc' },
    include: { changedBy: { select: { name: true } } },
  },
  customer: { select: { id: true, name: true, email: true, phone: true } },
  driver: { select: { id: true, name: true, phone: true } },
  receipt: { select: { receiptNumber: true } },
} satisfies Prisma.OrderInclude;

export type OrderWithRelations = Prisma.OrderGetPayload<{ include: typeof ORDER_INCLUDE }>;

export type ProductWithCategory = Prisma.ProductGetPayload<{
  include: { category: { select: { id: true; name: true; slug: true } } };
}>;

export type CategoryWithCount = Prisma.CategoryGetPayload<{
  include: { _count: { select: { products: true } } };
}>;

export const PRODUCT_INCLUDE = {
  category: { select: { id: true, name: true, slug: true } },
} satisfies Prisma.ProductInclude;

export const CATEGORY_INCLUDE = {
  _count: { select: { products: { where: { isArchived: false } } } },
} satisfies Prisma.CategoryInclude;

/**
 * Asset URLs are returned as relative paths so the PWA works from any host
 * (localhost during development, the POS LAN address or a public domain in production).
 */
export function serializeProduct(product: ProductWithCategory): ProductDTO {
  return {
    id: product.id,
    name: product.name,
    description: product.description,
    imageUrl: product.imageUrl,
    price: decimalToNumber(product.price),
    ingredients: product.ingredients,
    prepTimeMinutes: product.prepTimeMinutes,
    isAvailable: product.isAvailable,
    stock: product.stock,
    isArchived: product.isArchived,
    isPopular: product.isPopular,
    isNew: product.isNew,
    categoryId: product.categoryId,
    categoryName: product.category.name,
    categorySlug: product.category.slug,
    createdAt: product.createdAt.toISOString(),
    updatedAt: product.updatedAt.toISOString(),
  };
}

export function serializeCategory(category: CategoryWithCount): CategoryDTO {
  return {
    id: category.id,
    name: category.name,
    slug: category.slug,
    description: category.description,
    imageUrl: category.imageUrl,
    sortOrder: category.sortOrder,
    isActive: category.isActive,
    productCount: category._count.products,
  };
}

export function serializeOrderItem(item: OrderWithRelations['items'][number]): OrderItemDTO {
  return {
    id: item.id,
    productId: item.productId,
    name: item.name,
    imageUrl: item.imageUrl,
    unitPrice: decimalToNumber(item.unitPrice),
    quantity: item.quantity,
    lineTotal: decimalToNumber(item.lineTotal),
    notes: item.notes,
  };
}

export function serializeStatusEvent(
  event: OrderWithRelations['events'][number],
): OrderStatusEventDTO {
  return {
    id: event.id,
    status: event.status,
    note: event.note,
    changedByName: event.changedBy?.name ?? null,
    createdAt: event.createdAt.toISOString(),
  };
}

export function serializeOrder(order: OrderWithRelations): OrderDTO {
  return {
    id: order.id,
    orderNumber: order.orderNumber,
    status: order.status,
    customerId: order.customerId,
    customerName: order.customer?.name ?? 'Unknown customer',
    customerEmail: order.customer?.email ?? '',
    deliveryAddress: order.deliveryAddress,
    deliveryArea: order.deliveryArea,
    deliveryPhone: order.deliveryPhone,
    notes: order.notes,
    kitchenNote: order.kitchenNote,
    cancelReason: order.cancelReason,
    subtotal: decimalToNumber(order.subtotal),
    deliveryFee: decimalToNumber(order.deliveryFee),
    tax: decimalToNumber(order.tax),
    discount: decimalToNumber(order.discount),
    total: decimalToNumber(order.total),
    paymentMethod: order.paymentMethod,
    paymentStatus: order.paymentStatus,
    itemCount: order.itemCount,
    items: order.items.map(serializeOrderItem),
    timeline: order.events.map(serializeStatusEvent),
    createdAt: order.createdAt.toISOString(),
    updatedAt: order.updatedAt.toISOString(),
    acceptedAt: order.acceptedAt?.toISOString() ?? null,
    preparingAt: order.preparingAt?.toISOString() ?? null,
    readyAt: order.readyAt?.toISOString() ?? null,
    outForDeliveryAt: order.outForDeliveryAt?.toISOString() ?? null,
    deliveredAt: order.deliveredAt?.toISOString() ?? null,
    cancelledAt: order.cancelledAt?.toISOString() ?? null,
    estimatedReadyAt: order.estimatedReadyAt?.toISOString() ?? null,
    driverId: order.driverId,
    driverName: order.driver?.name ?? null,
    deliveryLatitude: order.deliveryLatitude,
    deliveryLongitude: order.deliveryLongitude,
    hasReceipt: Boolean(order.receipt),
  };
}

export function serializeAddress(
  address: Prisma.AddressGetPayload<Record<string, never>>,
): AddressDTO {
  return {
    id: address.id,
    label: address.label,
    line1: address.line1,
    area: address.area,
    city: address.city,
    notes: address.notes,
    isDefault: address.isDefault,
    createdAt: address.createdAt.toISOString(),
  };
}

export function serializeNotifications(rows: Parameters<typeof serializeNotification>[0][]): NotificationDTO[] {
  return rows.map(serializeNotification);
}