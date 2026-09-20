/**
 * Order lifecycle.
 *
 * RECEIVED -> ACCEPTED -> PREPARING -> READY -> OUT_FOR_DELIVERY -> DELIVERED
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

/** The happy-path delivery flow, in order (CANCELLED is excluded on purpose). */
export const ORDER_STATUS_FLOW: OrderStatus[] = [
  'RECEIVED',
  'ACCEPTED',
  'PREPARING',
  'READY',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
];

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  RECEIVED: 'Order Received',
  ACCEPTED: 'Accepted',
  PREPARING: 'Preparing',
  READY: 'Ready',
  OUT_FOR_DELIVERY: 'Out for Delivery',
  DELIVERED: 'Delivered',
  CANCELLED: 'Cancelled',
};

export const ORDER_STATUS_DESCRIPTIONS: Record<OrderStatus, string> = {
  RECEIVED: 'Your order reached the kitchen and is waiting to be accepted.',
  ACCEPTED: 'The kitchen accepted your order and will start cooking shortly.',
  PREPARING: 'Your food is being prepared right now.',
  READY: 'Your order is ready and waiting to be dispatched.',
  OUT_FOR_DELIVERY: 'Your order is on the way to you.',
  DELIVERED: 'Enjoy your meal! This order has been delivered.',
  CANCELLED: 'This order was cancelled.',
};

/** Tailwind-friendly status colours (single source of truth for both apps). */
export const ORDER_STATUS_TONE: Record<OrderStatus, string> = {
  RECEIVED: 'amber',
  ACCEPTED: 'sky',
  PREPARING: 'violet',
  READY: 'teal',
  OUT_FOR_DELIVERY: 'indigo',
  DELIVERED: 'emerald',
  CANCELLED: 'rose',
};

export const TERMINAL_STATUSES: OrderStatus[] = ['DELIVERED', 'CANCELLED'];

export function isOrderStatus(value: unknown): value is OrderStatus {
  return typeof value === 'string' && (ORDER_STATUSES as readonly string[]).includes(value);
}

export function isTerminalStatus(status: OrderStatus): boolean {
  return TERMINAL_STATUSES.includes(status);
}

export function orderStatusIndex(status: OrderStatus): number {
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