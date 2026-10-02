import type { Request } from 'express';
import type { Prisma } from '@prisma/client';
import type { DriverLoginCredentials, KitchenDriverDTO } from '@delivery/shared';
import { DRIVER_EMAIL_DOMAIN } from '@delivery/shared';
import { prisma } from '../lib/prisma';
import { conflict, forbidden, notFound } from '../lib/errors';
import { hashPassword } from '../lib/password';
import { resetUserPassword } from './auth.service';
import { logActivity } from './activity-log.service';
import { notifyUser } from './notification.service';
import { disconnectUserSockets, emitToRole } from '../realtime/socket';
import type { SessionUser } from '../middleware/authenticate';

/**
 * Driver management for the Kitchen (Kitchen > Settings > Driver Management).
 *
 * The Kitchen can create driver accounts, issue new passwords, copy/share the
 * login and disable or re-enable a driver. It can never delete a driver: orders,
 * assignments and earnings stay intact forever. Every query here is scoped to
 * `role: 'DRIVER'`, so administrator and staff accounts are untouchable.
 */

/** A driver counts as online when their device sent a fix within this window. */
const ONLINE_WINDOW_MS = 3 * 60_000;

/** Statuses that mean the driver is currently carrying an order. */
const ACTIVE_DELIVERY_STATUSES = ['ACCEPTED', 'PREPARING', 'READY', 'OUT_FOR_DELIVERY'] as const;

const DRIVER_SELECT = {
  id: true,
  name: true,
  username: true,
  email: true,
  phone: true,
  isActive: true,
  isProtected: true,
  role: true,
  createdAt: true,
  lastLoginAt: true,
  driverLocation: { select: { isOnline: true, updatedAt: true } },
} satisfies Prisma.UserSelect;

type DriverRow = Prisma.UserGetPayload<{ select: typeof DRIVER_SELECT }>;

interface DriverCounts {
  active: number;
  completed: number;
  total: number;
}

const NO_COUNTS: DriverCounts = { active: 0, completed: 0, total: 0 };

function toDriverDto(row: DriverRow, counts: DriverCounts, notes: string | null): KitchenDriverDTO {
  const seen = row.driverLocation?.updatedAt ?? null;
  const online =
    Boolean(row.driverLocation?.isOnline) &&
    Boolean(seen) &&
    Date.now() - (seen as Date).getTime() <= ONLINE_WINDOW_MS;

  return {
    id: row.id,
    name: row.name,
    username: row.username,
    phone: row.phone,
    email: row.email,
    isActive: row.isActive,
    isOnline: online,
    lastSeenAt: seen ? (seen as Date).toISOString() : null,
    lastLoginAt: row.lastLoginAt ? row.lastLoginAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    notes,
    activeDeliveries: counts.active,
    completedDeliveries: counts.completed,
    totalDeliveries: counts.total,
  };
}

/** The sign-in identifier handed to the driver (username, or email when none). */
function loginName(row: { username: string | null; email: string }): string {
  return row.username ?? row.email;
}

/** Loads a driver account, refusing every other role. */
async function requireDriver(driverId: string): Promise<DriverRow> {
  const row = await prisma.user.findUnique({ where: { id: driverId }, select: DRIVER_SELECT });
  if (!row || row.role !== 'DRIVER') throw notFound('That driver account no longer exists.');
  if (row.isProtected) throw forbidden('This account cannot be managed from the kitchen.');
  return row;
}

/** Delivery counters + kitchen creation notes for a batch of drivers. */
async function loadDriverMetadata(ids: string[]): Promise<{
  counts: Map<string, DriverCounts>;
  notes: Map<string, string>;
}> {
  const counts = new Map<string, DriverCounts>();
  const notes = new Map<string, string>();
  if (ids.length === 0) return { counts, notes };

  const [grouped, creationLogs] = await Promise.all([
    prisma.order.groupBy({
      by: ['driverId', 'status'],
      where: { driverId: { in: ids } },
      _count: { _all: true },
    }),
    // The creation note lives in the audit trail, so it survives with the
    // activity history instead of adding a column to the users table.
    prisma.activityLog.findMany({
      where: { action: 'DRIVER_CREATED', entityId: { in: ids } },
      select: { entityId: true, metadata: true },
      orderBy: { createdAt: 'desc' },
      take: 200,
    }),
  ]);

  for (const group of grouped) {
    if (!group.driverId) continue;
    const current = counts.get(group.driverId) ?? { active: 0, completed: 0, total: 0 };
    const amount = group._count._all;
    current.total += amount;
    if (group.status === 'DELIVERED') current.completed += amount;
    if ((ACTIVE_DELIVERY_STATUSES as readonly string[]).includes(group.status)) current.active += amount;
    counts.set(group.driverId, current);
  }

  for (const log of creationLogs) {
    if (!log.entityId || notes.has(log.entityId)) continue;
    const metadata = (log.metadata ?? null) as { note?: unknown } | null;
    const note = typeof metadata?.note === 'string' ? metadata.note.trim() : '';
    if (note) notes.set(log.entityId, note);
  }

  return { counts, notes };
}

/** GET /api/kitchen/drivers - every driver account with its live status. */
export async function listDrivers(): Promise<KitchenDriverDTO[]> {
  const rows = await prisma.user.findMany({
    where: { role: 'DRIVER' },
    select: DRIVER_SELECT,
    orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
  });
  if (rows.length === 0) return [];

  const { counts, notes } = await loadDriverMetadata(rows.map((row) => row.id));
  return rows.map((row) => toDriverDto(row, counts.get(row.id) ?? NO_COUNTS, notes.get(row.id) ?? null));
}

/** Reloads a single driver row with counters and notes. */
async function refreshDriver(driverId: string): Promise<KitchenDriverDTO> {
  const row = await requireDriver(driverId);
  const { counts, notes } = await loadDriverMetadata([driverId]);
  return toDriverDto(row, counts.get(driverId) ?? NO_COUNTS, notes.get(driverId) ?? null);
}

/**
 * POST /api/kitchen/drivers - creates the real driver account immediately.
 * No approval step: the driver signs in with the credentials returned here.
 */
export async function createDriver(params: {
  input: { name: string; username: string; password: string; phone?: string; notes?: string };
  actor: SessionUser;
  request?: Request;
}): Promise<{ driver: KitchenDriverDTO; credentials: DriverLoginCredentials }> {
  const { input, actor, request } = params;
  const username = input.username;
  // The account email doubles as the unique key for the login alias. It is a
  // non-routable address: drivers sign in with the username that was issued.
  const email = `${username}@${DRIVER_EMAIL_DOMAIN}`;

  const duplicate = await prisma.user.findFirst({
    where: { OR: [{ username }, { email }] },
    select: { username: true, email: true },
  });
  if (duplicate) {
    throw conflict(
      duplicate.username === username
        ? 'That username is already taken. Choose another one.'
        : 'A driver account already uses that sign-in name.',
    );
  }

  let created: DriverRow;
  try {
    created = await prisma.user.create({
      data: {
        name: input.name,
        username,
        email,
        phone: input.phone ?? null,
        role: 'DRIVER',
        passwordHash: await hashPassword(input.password),
      },
      select: DRIVER_SELECT,
    });
  } catch (error) {
    // Unique-constraint race: two kitchens creating the same username at once.
    if ((error as { code?: string })?.code === 'P2002') {
      throw conflict('That username is already taken. Choose another one.');
    }
    throw error;
  }

  for (const role of ['KITCHEN', 'ADMIN'] as const) {
    emitToRole(role, 'user:changed', { action: 'created', userId: created.id });
  }

  await logActivity({
    action: 'DRIVER_CREATED',
    entity: 'User',
    entityId: created.id,
    description: `${created.name} (driver) created by ${actor.name}`,
    metadata: { username, phone: input.phone ?? null, note: input.notes ?? null, createdByRole: actor.role },
    userId: actor.id,
    actorEmail: actor.email,
    actorRole: actor.role,
    request,
  });

  return {
    driver: toDriverDto(created, NO_COUNTS, input.notes?.trim() ? input.notes.trim() : null),
    credentials: { username, password: input.password },
  };
}

/** POST /api/kitchen/drivers/:id/reset-password - issues a fresh login to share. */
export async function resetDriverLogin(params: {
  driverId: string;
  newPassword?: string;
  actor: SessionUser;
}): Promise<{ driver: KitchenDriverDTO; credentials: DriverLoginCredentials }> {
  const target = await requireDriver(params.driverId);
  const { temporaryPassword } = await resetUserPassword(target.id, params.actor, params.newPassword);
  return {
    driver: await refreshDriver(target.id),
    credentials: { username: loginName(target), password: temporaryPassword },
  };
}

/**
 * POST /api/kitchen/drivers/:id/disable | :id/enable
 *
 * Disabling is always preferred over deletion: deliveries, earnings and the
 * audit trail stay exactly as they were. A driver holding live deliveries can
 * only be disabled once those deliveries are completed or reassigned.
 */
export async function setDriverActive(params: {
  driverId: string;
  isActive: boolean;
  actor: SessionUser;
  request?: Request;
}): Promise<KitchenDriverDTO> {
  const { driverId, isActive, actor, request } = params;
  const target = await requireDriver(driverId);

  if (target.isActive === isActive) return refreshDriver(driverId);

  if (!isActive) {
    const liveDeliveries = await prisma.order.count({
      where: { driverId, status: { in: [...ACTIVE_DELIVERY_STATUSES] } },
    });
    if (liveDeliveries > 0) {
      throw conflict(
        `This driver still has ${liveDeliveries} delivery(ies) in progress. Complete or reassign them first.`,
      );
    }
  }

  await prisma.user.update({ where: { id: driverId }, data: { isActive } });

  if (!isActive) {
    // Signed out everywhere the moment they are disabled.
    await prisma.session.updateMany({
      where: { userId: driverId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    disconnectUserSockets(driverId);
    await prisma.driverLocation
      .updateMany({ where: { driverId }, data: { isOnline: false } })
      .catch(() => undefined);
  }

  await notifyUser(driverId, {
    title: isActive ? 'Account enabled' : 'Account disabled',
    body: isActive
      ? 'Your driver account is active again. Sign in to see available deliveries.'
      : 'Your driver account was disabled by the kitchen. Contact the kitchen if this is unexpected.',
    type: 'SYSTEM',
    audience: 'DRIVER',
    createdById: actor.id,
  });

  for (const role of ['KITCHEN', 'ADMIN'] as const) {
    emitToRole(role, 'user:changed', { action: 'updated', userId: driverId });
  }

  await logActivity({
    action: isActive ? 'DRIVER_ENABLED' : 'DRIVER_DISABLED',
    entity: 'User',
    entityId: driverId,
    description: `${target.name} (driver) ${isActive ? 'enabled' : 'disabled'} by ${actor.name}`,
    metadata: { isActive, actorRole: actor.role },
    userId: actor.id,
    actorEmail: actor.email,
    actorRole: actor.role,
    request,
  });

  return refreshDriver(driverId);
}
