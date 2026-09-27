import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { OrderDTO } from '@delivery/shared';
import { ApiError, api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useCart } from '../lib/cart';
import { clearConfirmedDeliveryLocation } from '../lib/delivery-location';
import { clearPendingOrder, readPendingOrder } from '../lib/offline-order';
import { toast } from '../lib/realtime';

/** Syncs a customer-submitted offline checkout whenever the app is online. */
export function OfflineOrderSync() {
  const { user } = useAuth();
  const { clear } = useCart();
  const queryClient = useQueryClient();
  const userIdRef = useRef(user?.id);
  const syncingRef = useRef(false);
  const syncRef = useRef<() => void>(() => undefined);
  userIdRef.current = user?.id;

  syncRef.current = () => {
    const userId = user?.id;
    if (!userId || !navigator.onLine || syncingRef.current) return;
    const payload = readPendingOrder(userId);
    if (!payload) return;

    syncingRef.current = true;
    void api.post<{ order: OrderDTO }>('/orders', payload)
      .then(({ order }) => {
        clearPendingOrder(userId);
        clearConfirmedDeliveryLocation(userId);
        void queryClient.invalidateQueries({ queryKey: ['orders'] });
        void queryClient.invalidateQueries({ queryKey: ['active-orders'] });
        if (userIdRef.current !== userId) return;
        clear();
        toast(`Order ${order.orderNumber} sent to the kitchen!`, 'success');
        window.dispatchEvent(new CustomEvent('ds:offline-order-synced', { detail: { order } }));
      })
      .catch((error: unknown) => {
        if (userIdRef.current !== userId) return;
        if (error instanceof ApiError && [400, 409, 422].includes(error.status)) {
          clearPendingOrder(userId);
          window.dispatchEvent(new CustomEvent('ds:offline-order-rejected', { detail: { message: error.message } }));
          toast(`Saved order needs an update: ${error.message}`, 'error');
        }
      })
      .finally(() => {
        syncingRef.current = false;
      });
  };

  useEffect(() => {
    const retry = (): void => syncRef.current();
    window.addEventListener('online', retry);
    if (navigator.onLine) retry();
    return () => window.removeEventListener('online', retry);
  }, [user?.id]);

  return null;
}
