import type { Role } from '@delivery/shared';

/**
 * Single source of truth for "who may look at this order".
 *
 * The REST endpoints, the receipt routes, the live tracking snapshot and the
 * real-time socket rooms all call this one function, so a permission can never
 * exist on one surface and be missing on another.
 */
export interface OrderOwnership {
  customerId: string | null;
  driverId: string | null;
}

export interface OrderRequester {
  id: string;
  role: Role;
}

export function canAccessOrder(order: OrderOwnership, user: OrderRequester): boolean {
  switch (user.role) {
    case 'ADMIN':
    case 'KITCHEN':
      return true;
    case 'CUSTOMER':
      return order.customerId === user.id;
    case 'DRIVER':
      // A driver only ever sees the deliveries that are assigned to them, never
      // the shared pickup pool through an order-id lookup.
      return order.driverId === user.id;
    default:
      return false;
  }
}

export function canViewOrder(order: OrderOwnership & { status: string }, user: OrderRequester): boolean {
  return canAccessOrder(order, user);
}
