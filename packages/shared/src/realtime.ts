import type { NotificationDTO, OrderDTO, ProductDTO, CategoryDTO, AnalyticsOverview } from './types';
import type { OrderStatus } from './order-status';
import type { Role } from './roles';

export type { Role } from './roles';
export type { OrderStatus } from './order-status';

/** Socket.IO rooms used for real-time fan-out. */
export const SOCKET_ROOMS = {
  user: (userId: string) => `user:${userId}`,
  role: (role: Role) => `role:${role}`,
  order: (orderId: string) => `order:${orderId}`,
  public: 'public',
} as const;

/** Every server -> client event name, with its payload type. */
export interface ServerToClientEvents {
  'order:created': (payload: { order: OrderDTO }) => void;
  'order:updated': (payload: { order: OrderDTO; previousStatus: OrderStatus }) => void;
  'order:deleted': (payload: { orderId: string; orderNumber: string }) => void;
  'notification:new': (payload: { notification: NotificationDTO }) => void;
  'notification:read': (payload: { notificationId: string | null; all: boolean }) => void;
  'product:changed': (payload: {
    action: 'created' | 'updated' | 'deleted' | 'archived';
    product?: ProductDTO;
    productId?: string;
  }) => void;
  'category:changed': (payload: {
    action: 'created' | 'updated' | 'deleted' | 'reordered';
    category?: CategoryDTO;
    categoryId?: string;
  }) => void;
  'user:changed': (payload: { action: 'created' | 'updated' | 'deleted'; userId: string }) => void;
  'settings:changed': () => void;
  'analytics:refresh': (payload?: { overview?: AnalyticsOverview }) => void;
  'stock:low': (payload: { productId: string; name: string; stock: number }) => void;
  'receipt:generated': (payload: { orderId: string; receiptNumber: string }) => void;
}

export interface ClientToServerEvents {
  'order:subscribe': (orderId: string, ack?: (ok: boolean) => void) => void;
  'order:unsubscribe': (orderId: string) => void;
}

export interface InterServerEvents {
  ping: () => void;
}

export interface SocketData {
  userId: string;
  role: Role;
  name: string;
}

export type AppSocketEvents = {
  server: ServerToClientEvents;
  client: ClientToServerEvents;
};