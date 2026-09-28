import { formatDate, formatTime } from './format';
import type { SettingsDTO } from './types';

/**
 * Live open/closed state of the restaurant.
 *
 * The Kitchen decides when the restaurant opens and closes — opening hours are
 * never hardcoded. The state itself lives in PostgreSQL (the `Setting` table
 * keys `acceptingOrders`, `restaurantStatusChangedAt` and
 * `restaurantStatusChangedBy`), so it survives refreshes, deploys and server
 * restarts, and the same document is what the API enforces at checkout.
 */
export interface RestaurantStatusDTO {
  /** True while the kitchen is accepting new orders. */
  open: boolean;
  /** When the status was last changed (ISO string), or null when never recorded. */
  changedAt: string | null;
  /** Who changed it ("Kitchen", "Administrator" or a staff name), or null. */
  changedBy: string | null;
}

/** The settings slice that carries the restaurant status. */
export type RestaurantStatusSettings = Pick<
  SettingsDTO,
  'acceptingOrders' | 'restaurantStatusChangedAt' | 'restaurantStatusChangedBy'
>;

/** Copy shown to customers while the kitchen is closed. */
export const RESTAURANT_CLOSED_TITLE = 'Kitchen is currently closed';
export const RESTAURANT_CLOSED_BODY = 'We are not accepting orders right now.';
export const RESTAURANT_CLOSED_HINT = 'Opens again when the kitchen comes online.';

export const RESTAURANT_OPEN_LABEL = 'OPEN';
export const RESTAURANT_CLOSED_LABEL = 'CLOSED';

function normalizeStamp(value: string | null | undefined): string | null {
  const text = (value ?? '').trim();
  if (!text) return null;
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function normalizeActor(value: string | null | undefined): string | null {
  const text = (value ?? '').trim();
  return text.length > 0 ? text : null;
}

/** Projects the settings document onto the status contract every client reads. */
export function restaurantStatusFromSettings(settings: RestaurantStatusSettings): RestaurantStatusDTO {
  return {
    open: settings.acceptingOrders,
    changedAt: normalizeStamp(settings.restaurantStatusChangedAt),
    changedBy: normalizeActor(settings.restaurantStatusChangedBy),
  };
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
  );
}

/**
 * Human line under the status, e.g.
 *   "Opened today at 7:42 AM by Kitchen"
 *   "Closed yesterday at 10:15 PM by Kitchen"
 * Returns null when the change was never recorded (older deployments).
 */
export function describeRestaurantStatusChange(
  status: RestaurantStatusDTO,
  now: Date = new Date(),
): string | null {
  if (!status.changedAt) return null;
  const at = new Date(status.changedAt);
  if (Number.isNaN(at.getTime())) return null;

  const yesterday = new Date(now.getTime() - 86_400_000);
  const day = isSameDay(at, now)
    ? 'today'
    : isSameDay(at, yesterday)
      ? 'yesterday'
      : formatDate(at);

  const verb = status.open ? 'Opened' : 'Closed';
  return `${verb} ${day} at ${formatTime(at)}${status.changedBy ? ` by ${status.changedBy}` : ''}`;
}

/** Short verb line used by the customer-facing cards. */
export function describeRestaurantClosedAt(status: RestaurantStatusDTO): string | null {
  if (!status.changedAt) return null;
  const at = new Date(status.changedAt);
  if (Number.isNaN(at.getTime())) return null;
  return `Closed at ${formatTime(at)}${status.changedBy ? ` by ${status.changedBy}` : ''}`;
}
