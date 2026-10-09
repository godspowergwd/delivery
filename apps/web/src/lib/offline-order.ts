import type { PaymentMethod } from '@delivery/shared';
import { isConfirmedDeliveryLocation, type ConfirmedDeliveryLocation } from './delivery-location';

export interface OrderSubmissionPayload {
  idempotencyKey: string;
  items: Array<{ productId: string; quantity: number; notes?: string }>;
  deliveryAddress: string;
  deliveryPhone: string;
  notes?: string;
  paymentMethod: PaymentMethod;
  deliveryLatitude: number;
  deliveryLongitude: number;
  deliveryOriginalLatitude: number | null;
  deliveryOriginalLongitude: number | null;
  deliveryLocationSource: ConfirmedDeliveryLocation['source'];
  deliveryLocationConfirmedAt: string;
  quotedDeliveryFee: number;
}

const STORAGE_PREFIX = 'ds_pending_order_v1:';

function storageKey(userId: string): string {
  return `${STORAGE_PREFIX}${userId}`;
}

function isOrderSubmissionPayload(value: unknown): value is OrderSubmissionPayload {
  if (typeof value !== 'object' || value === null) return false;
  const payload = value as Partial<OrderSubmissionPayload>;
  const hasOriginalLatitude = payload.deliveryOriginalLatitude !== null && payload.deliveryOriginalLatitude !== undefined;
  const hasOriginalLongitude = payload.deliveryOriginalLongitude !== null && payload.deliveryOriginalLongitude !== undefined;
  return typeof payload.idempotencyKey === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(payload.idempotencyKey) &&
    Array.isArray(payload.items) && payload.items.length > 0 &&
    typeof payload.deliveryAddress === 'string' && payload.deliveryAddress.length >= 6 &&
    typeof payload.deliveryPhone === 'string' && payload.deliveryPhone.length >= 7 &&
    (payload.paymentMethod === 'CASH' || payload.paymentMethod === 'MOBILE_MONEY') &&
    typeof payload.deliveryLatitude === 'number' && Number.isFinite(payload.deliveryLatitude) &&
    typeof payload.deliveryLongitude === 'number' && Number.isFinite(payload.deliveryLongitude) &&
    typeof payload.quotedDeliveryFee === 'number' && Number.isFinite(payload.quotedDeliveryFee) &&
    payload.quotedDeliveryFee >= 0 &&
    hasOriginalLatitude === hasOriginalLongitude &&
    (!hasOriginalLatitude || (
      typeof payload.deliveryOriginalLatitude === 'number' && Number.isFinite(payload.deliveryOriginalLatitude) &&
      typeof payload.deliveryOriginalLongitude === 'number' && Number.isFinite(payload.deliveryOriginalLongitude)
    )) &&
    (payload.deliveryLocationSource === 'gps' || payload.deliveryLocationSource === 'search') &&
    (payload.deliveryLocationSource !== 'gps' || hasOriginalLatitude) &&
    typeof payload.deliveryLocationConfirmedAt === 'string' && Number.isFinite(Date.parse(payload.deliveryLocationConfirmedAt));
}

export function readPendingOrder(userId: string | null | undefined): OrderSubmissionPayload | null {
  if (!userId || typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(storageKey(userId));
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return isOrderSubmissionPayload(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function savePendingOrder(userId: string | null | undefined, payload: OrderSubmissionPayload): boolean {
  if (!userId || !isOrderSubmissionPayload(payload)) return false;
  try {
    localStorage.setItem(storageKey(userId), JSON.stringify(payload));
    return true;
  } catch {
    return false;
  }
}

export function clearPendingOrder(userId: string | null | undefined): void {
  if (!userId || typeof localStorage === 'undefined') return;
  try {
    localStorage.removeItem(storageKey(userId));
  } catch {
    // The server response remains authoritative if local storage is unavailable.
  }
}
