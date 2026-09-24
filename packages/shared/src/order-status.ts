/**
 * Order lifecycle - the single source of truth for every interface.
 *
 * RECEIVED ("ORDER PLACED") -> ACCEPTED ("ORDER ACCEPTED") -> PREPARING
 *   ("SERVING") -> OUT_FOR_DELIVERY ("OUT FOR DELIVERY") -> DELIVERED
 *
 * READY stays only as a legacy technical state for orders packed by the old
 * workflow: it renders as "Serving" and jumps straight to OUT_FOR_DELIVERY.
 * New orders never pass through it.
 *
 * CANCELLED can be reached from any non-terminal status by the customer, the
 * kitchen (rejection) or an administrator (override).
 */
export const ORDER_STATUSES = [
  'RECEIVED',
  'ACCEPTED',
  'PREPARING',
  'READY',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
  'CANCELLED',
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

/** The happy-path delivery flow, in order (CANCELLED/legacy READY excluded). */
export const ORDER_STATUS_FLOW: OrderStatus[] = [
  'RECEIVED',
  'ACCEPTED',
  'PREPARING',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
];

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  RECEIVED: 'Order Placed',
  ACCEPTED: 'Order Accepted',
  PREPARING: 'Serving',
  READY: 'Serving',
  OUT_FOR_DELIVERY: 'Out for Delivery',
  DELIVERED: 'Delivered',
  CANCELLED: 'Cancelled',
};

export const ORDER_STATUS_DESCRIPTIONS: Record<OrderStatus, string> = {
  RECEIVED: 'Your order reached the kitchen and is waiting to be accepted.',
  ACCEPTED: 'The kitchen accepted your order and will start serving shortly.',
  PREPARING: 'Your waakye is being served right now.',
  READY: 'Your waakye is being served right now.',
  OUT_FOR_DELIVERY: 'Your order is on the way to you.',
  DELIVERED: 'Enjoy your meal! This order has been delivered.',
  CANCELLED: 'This order was cancelled.',
};

/**
 * Status -> StatusPill tone. Values must be keys of STATUS_TONE_CLASSES in
 * apps/web/src/components/ui.tsx (green/red/white brand palette).
 */
export const ORDER_STATUS_TONE: Record<OrderStatus, string> = {
  RECEIVED: 'brand',
  ACCEPTED: 'brand-deep',
  PREPARING: 'success',
  READY: 'success',
  OUT_FOR_DELIVERY: 'success',
  DELIVERED: 'success-deep',
  CANCELLED: 'danger',
};

export const TERMINAL_STATUSES: OrderStatus[] = ['DELIVERED', 'CANCELLED'];

export function isOrderStatus(value: unknown): value is OrderStatus {
  return typeof value === 'string' && (ORDER_STATUSES as readonly string[]).includes(value);
}

export function isTerminalStatus(status: OrderStatus): boolean {
  return TERMINAL_STATUSES.includes(status);
}

/** Statuses that render as the "SERVING" step (legacy packed included). */
const SERVING_EQUIVALENT: OrderStatus[] = ['PREPARING', 'READY'];

export function orderStatusIndex(status: OrderStatus): number {
  if (SERVING_EQUIVALENT.includes(status)) return ORDER_STATUS_FLOW.indexOf('PREPARING');
  return ORDER_STATUS_FLOW.indexOf(status);
}

/** Which statuses a given status is allowed to move to next. */
export function allowedNextStatuses(status: OrderStatus): OrderStatus[] {
  if (isTerminalStatus(status)) return [];
  const index = orderStatusIndex(status);
  const next = index >= 0 && index < ORDER_STATUS_FLOW.length - 1 ? [ORDER_STATUS_FLOW[index + 1]] : [];
  return [...next, 'CANCELLED'];
}

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  if (from === to) return false;
  if (isTerminalStatus(from)) return false;
  if (to === 'CANCELLED') return true;
  const fromIndex = orderStatusIndex(from);
  const toIndex = orderStatusIndex(to);
  // Forward movement only (no going back), any number of steps forward.
  return toIndex > fromIndex;
}

/** Orders that the kitchen still has to work on. */
export const KITCHEN_ACTIVE_STATUSES: OrderStatus[] = ['ACCEPTED', 'PREPARING'];

export const ORDER_STATUS_FILTERS = [
  'RECEIVED',
  'ACCEPTED',
  'PREPARING',
  'READY',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
  'CANCELLED',
] as const;