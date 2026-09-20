import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from './auth';

/** Tiny event-based toast bus so any module can raise a toast. */
export type ToastTone = 'info' | 'success' | 'error' | 'warning';

export function toast(message: string, tone: ToastTone = 'info'): void {
  window.dispatchEvent(new CustomEvent('ds:toast', { detail: { message, tone, id: Date.now() } }));
}

/**
 * Wires the live Socket.IO stream to the react-query cache so every screen
 * updates the moment something changes anywhere in the business.
 */
export function useRealtimeSync(): void {
  const { socket, user } = useAuth();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!socket) return;

    const invalidate = (...keys: string[]) => {
      for (const key of keys) void queryClient.invalidateQueries({ queryKey: [key] });
    };

    const onOrderCreated = () => {
      invalidate('kitchen-summary', 'kitchen-orders', 'admin-orders', 'orders', 'notifications', 'driver-deliveries', 'driver-summary');
      if (user?.role !== 'CUSTOMER') {
        toast('New order received', 'warning');
        void queryClient.invalidateQueries({ queryKey: ['analytics'] });
      }
    };

    const onOrderUpdated = () => {
      invalidate('orders', 'active-orders', 'kitchen-orders', 'kitchen-summary', 'admin-orders', 'driver-deliveries', 'driver-summary');
    };

    socket.on('order:created', onOrderCreated);
    socket.on('order:updated', onOrderUpdated);
    socket.on('order:deleted', () => invalidate('orders', 'admin-orders', 'kitchen-orders'));
    socket.on('notification:new', () => invalidate('notifications'));
    socket.on('notification:read', () => invalidate('notifications'));
    socket.on('product:changed', () => invalidate('products', 'admin-products', 'categories'));
    socket.on('category:changed', () => invalidate('categories', 'products'));
    socket.on('user:changed', () => invalidate('admin-users'));
    socket.on('settings:changed', () => invalidate('settings'));
    socket.on('analytics:refresh', () => invalidate('analytics-overview', 'analytics-charts'));
    socket.on('stock:low', (payload) => {
      if (user?.role !== 'CUSTOMER') {
        toast(`Low stock: ${payload.name} (${payload.stock} left)`, 'warning');
      }
    });
    socket.on('receipt:generated', () => invalidate('receipt'));

    return () => {
      for (const event of [
        'order:created',
        'order:updated',
        'order:deleted',
        'notification:new',
        'notification:read',
        'product:changed',
        'category:changed',
        'user:changed',
        'settings:changed',
        'analytics:refresh',
        'stock:low',
        'receipt:generated',
      ] as const) {
        socket.off(event);
      }
    };
  }, [socket, queryClient, user?.role]);
}
