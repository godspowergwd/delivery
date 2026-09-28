import type { Request } from 'express';
import type { RestaurantStatusDTO, SettingsDTO } from '@delivery/shared';
import { restaurantStatusFromSettings } from '@delivery/shared';
import { getSettings, updateSettings } from './settings.service';
import { logActivity } from './activity-log.service';
import { emitToEveryone } from '../realtime/socket';
import type { SessionUser } from '../middleware/authenticate';

/**
 * Restaurant open/closed control (Kitchen > Settings > Restaurant Status).
 *
 * There is a single source of truth: the `acceptingOrders` business setting in
 * PostgreSQL, which the order service already enforces at checkout. Two sibling
 * settings keys carry the audit trail (when and by whom), so the state survives
 * refreshes and server restarts without any schema change. Opening hours are
 * never hardcoded — only the Kitchen (or an administrator) decides.
 */

/** Label stored with the change; customers read it as "… by Kitchen". */
function actorLabel(actor: SessionUser): string {
  if (actor.role === 'KITCHEN') return 'Kitchen';
  if (actor.role === 'ADMIN') return actor.name?.trim() || 'Administrator';
  return actor.name?.trim() || 'Staff';
}

/** Current status, projected from the settings document. */
export async function getRestaurantStatus(): Promise<RestaurantStatusDTO> {
  return restaurantStatusFromSettings(await getSettings());
}

/**
 * Opens or closes the restaurant and announces it to every connected device.
 *
 * `alsoPatch` lets a caller (Admin > Settings) save other fields in the same
 * write so the toggle and the rest of the form never land in separate states.
 */
export async function applyRestaurantStatus(params: {
  open: boolean;
  actor: SessionUser;
  alsoPatch?: Partial<Omit<SettingsDTO, 'updatedAt'>>;
  note?: string;
  request?: Request;
}): Promise<{ status: RestaurantStatusDTO; settings: SettingsDTO }> {
  const { open, actor, alsoPatch, note, request } = params;
  const changedAt = new Date().toISOString();
  const changedBy = actorLabel(actor);

  const settings = await updateSettings(
    {
      ...alsoPatch,
      acceptingOrders: open,
      restaurantStatusChangedAt: changedAt,
      restaurantStatusChangedBy: changedBy,
    },
    actor.id,
  );

  const status: RestaurantStatusDTO = { open, changedAt, changedBy };

  // Fire-and-forget fan-out: customers, kitchen screens, drivers and admins all
  // hear about it instantly (the public room covers guest storefront tabs too).
  emitToEveryone('restaurant:status', { status });

  await logActivity({
    action: open ? 'RESTAURANT_OPENED' : 'RESTAURANT_CLOSED',
    entity: 'Setting',
    entityId: 'acceptingOrders',
    description: open
      ? `Restaurant opened by ${actor.name}`
      : `Restaurant closed by ${actor.name}`,
    metadata: { open, note: note ?? null, changedAt, changedBy },
    userId: actor.id,
    actorEmail: actor.email,
    actorRole: actor.role,
    request,
  });

  return { status, settings };
}
