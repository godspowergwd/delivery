import { z } from 'zod';
import type { DriverLocationDTO, OrderTrackingDTO, TrackingPoint } from '@delivery/shared';
import { isValidLatitude, isValidLongitude, distanceKm, MALAM_CENTER } from '@delivery/shared';
import { prisma } from '../lib/prisma';
import { badRequest } from '../lib/errors';
import { emitToOrder, emitToRole, emitToUser } from '../realtime/socket';
import { getSettings } from './settings.service';
import { assertCanViewOrder, getOrderById } from './order.service';
import type { OrderWithRelations } from './serializers';
import type { SessionUser } from '../middleware/authenticate';

/**
 * Live tracking.
 *
 * Positions always originate from a driver's own device. This service is the
 * single write path (REST *and* socket funnel through `publishDriverLocation`)
 * and the single read path (`getOrderTracking`), so authorisation is applied in
 * exactly one place: the driver themselves, the customer of the active order and
 * the administrators.
 */

/** Accepted payload for a driver position update. */
export const driverLocationInputSchema = z.object({
  latitude: z.coerce.number().refine(isValidLatitude, 'Latitude must be between -90 and 90'),
  longitude: z.coerce.number().refine(isValidLongitude, 'Longitude must be between -180 and 180'),
  accuracy: z.coerce.number().min(0).max(100_000).nullish(),
  heading: z.coerce.number().min(0).max(360).nullish(),
  speed: z.coerce.number().min(0).max(120).nullish(),
  recordedAt: z.string().trim().datetime().nullish(),
});

/** Statuses in which a driver is working an order (drives the tracking fan-out). */
const ACTIVE_DELIVERY_STATUSES = ['ACCEPTED', 'PREPARING', 'READY', 'OUT_FOR_DELIVERY'] as const;

/**
 * Battery/data guard: a driver device may report every few seconds, but we only
 * persist when the fix moved meaningfully or enough time passed. Every accepted
 * fix is still broadcast instantly, so the customer map never feels laggy.
 */
const MIN_WRITE_INTERVAL_MS = 5_000;
const MIN_MOVED_METRES = 12;
const lastWrite = new Map<string, { at: number; lat: number; lng: number }>();

type DriverLocationRow = {
  driverId: string;
  latitude: number;
  longitude: number;
  accuracy: number | null;
  heading: number | null;
  speed: number | null;
  isOnline: boolean;
  recordedAt: Date;
  updatedAt: Date;
};

export function serializeDriverLocation(row: DriverLocationRow, driverName: string): DriverLocationDTO {
  return {
    driverId: row.driverId,
    driverName,
    latitude: row.latitude,
    longitude: row.longitude,
    accuracy: row.accuracy,
    heading: row.heading,
    speed: row.speed,
    isOnline: row.isOnline,
    recordedAt: row.recordedAt.toISOString(),
    receivedAt: row.updatedAt.toISOString(),
  };
}

function round6(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

/**
 * Deterministic address estimate used only when an order has no GPS coordinates
 * (orders placed before device capture existed). Always surfaced to clients with
 * `source: 'estimated'` so nothing pretends to be a real GPS fix.
 */
export function estimateCoordinates(
  address: string | null | undefined,
  area?: string | null,
): { lat: number; lng: number } {
  const text = `${address ?? ''} ${area ?? ''}`.trim().toLowerCase();
  if (!text) return { ...MALAM_CENTER };
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  const spread = (seed: number): number => {
    const value = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
    return value - Math.floor(value);
  };
  return {
    lat: round6(MALAM_CENTER.lat + (spread(hash) - 0.5) * 0.06),
    lng: round6(MALAM_CENTER.lng + (spread(hash ^ 0x9e3779b9) - 0.5) * 0.06),
  };
}

/** Kitchen / pickup anchor: configured in Admin > Settings, Malam by default. */
export async function getRestaurantAnchor(): Promise<{
  lat: number;
  lng: number;
  name: string;
  address: string;
}> {
  const settings = await getSettings();
  const lat = isValidLatitude(settings.businessLatitude) ? settings.businessLatitude : MALAM_CENTER.lat;
  const lng = isValidLongitude(settings.businessLongitude) ? settings.businessLongitude : MALAM_CENTER.lng;
  return { lat, lng, name: settings.businessName, address: settings.businessAddress };
}

/** Orders of this driver still in flight; formatted `orderId:customerId`. */
async function activeDeliveries(driverId: string): Promise<string[]> {
  const orders = await prisma.order.findMany({
    where: { driverId, status: { in: ACTIVE_DELIVERY_STATUSES as never } },
    select: { id: true, customerId: true },
    take: 20,
  });
  return orders.map((order) => `${order.id}:${order.customerId}`);
}

/**
 * Stores one GPS fix and fans it out. Called from the driver socket handler and
 * from the REST fallback, so a flaky mobile connection never loses tracking.
 */
export async function publishDriverLocation(params: {
  driver: Pick<SessionUser, 'id' | 'name'>;
  input: z.infer<typeof driverLocationInputSchema>;
}): Promise<{ location: DriverLocationDTO; orderIds: string[] }> {
  const { driver, input } = params;
  if (!isValidLatitude(input.latitude) || !isValidLongitude(input.longitude)) {
    throw badRequest('That position is not a valid coordinate.');
  }

  const recordedAt = input.recordedAt ? new Date(input.recordedAt) : new Date();
  const now = Date.now();
  const previous = lastWrite.get(driver.id);
  const movedMetres = previous
    ? distanceKm({ lat: previous.lat, lng: previous.lng }, { lat: input.latitude, lng: input.longitude }) * 1000
    : Number.POSITIVE_INFINITY;
  const shouldPersist =
    !previous || now - previous.at >= MIN_WRITE_INTERVAL_MS || movedMetres >= MIN_MOVED_METRES;

  const data = {
    latitude: input.latitude,
    longitude: input.longitude,
    accuracy: input.accuracy ?? null,
    heading: input.heading ?? null,
    speed: input.speed ?? null,
    isOnline: true,
    recordedAt,
  };

  let row: DriverLocationRow;
  if (shouldPersist) {
    row = await prisma.driverLocation.upsert({
      where: { driverId: driver.id },
      create: { driverId: driver.id, ...data },
      update: data,
    });
    lastWrite.set(driver.id, { at: now, lat: input.latitude, lng: input.longitude });
  } else {
    const existing = await prisma.driverLocation.findUnique({ where: { driverId: driver.id } });
    row = existing
      ? { ...existing, isOnline: true }
      : await prisma.driverLocation.create({ data: { driverId: driver.id, ...data } });
  }

  // Broadcast the live fix even when the write was skipped by the throttle.
  const live: DriverLocationRow = { ...row, ...data, updatedAt: new Date() };

  const tracked = await activeDeliveries(driver.id);
  const orderIds = tracked.map((entry) => entry.split(':')[0]);
  const location = serializeDriverLocation(live, driver.name);
  broadcastDriverLocation(location, orderIds, tracked);
  return { location, orderIds };
}

/** Sends a fix to the customers of this driver's orders, the driver and admins. */
export function broadcastDriverLocation(
  location: DriverLocationDTO,
  orderIds: string[],
  tracked: string[],
): void {
  const payload = { location, orderIds };
  for (const orderId of orderIds) emitToOrder(orderId, 'driver:location', payload);
  for (const entry of tracked) {
    const customerId = entry.split(':')[1];
    if (customerId) emitToUser(customerId, 'driver:location', payload);
  }
  emitToRole('ADMIN', 'driver:location', payload);
  emitToUser(location.driverId, 'driver:location', payload);
}

/** The driver stopped sharing (end of shift or left the tracking screen). */
export async function stopDriverLocation(
  driver: Pick<SessionUser, 'id'>,
): Promise<{ orderIds: string[] }> {
  const tracked = await activeDeliveries(driver.id);
  const orderIds = tracked.map((entry) => entry.split(':')[0]);
  lastWrite.delete(driver.id);

  await prisma.driverLocation
    .updateMany({ where: { driverId: driver.id }, data: { isOnline: false } })
    .catch(() => undefined);

  const payload = { driverId: driver.id, orderIds };
  for (const orderId of orderIds) emitToOrder(orderId, 'driver:offline', payload);
  for (const entry of tracked) {
    const customerId = entry.split(':')[1];
    if (customerId) emitToUser(customerId, 'driver:offline', payload);
  }
  emitToRole('ADMIN', 'driver:offline', payload);
  return { orderIds };
}

/** Reads the current tracking snapshot for one order (permission-checked). */
export async function getOrderTracking(
  orderId: string,
  user: SessionUser,
): Promise<OrderTrackingDTO> {
  const order = await getOrderById(orderId);
  return buildTrackingSnapshot(order, user);
}

/** Builds the tracking payload for an order the caller is allowed to see. */
export async function buildTrackingSnapshot(
  order: OrderWithRelations,
  user: SessionUser,
): Promise<OrderTrackingDTO> {
  assertCanViewOrder(order, user);

  const restaurant = await getRestaurantAnchor();
  const destination = destinationPoint(order);

  let driver: OrderTrackingDTO['driver'] = null;
  if (order.driver) {
    const row = await prisma.driverLocation.findUnique({ where: { driverId: order.driver.id } });
    driver = {
      id: order.driver.id,
      name: order.driver.name,
      phone: order.driver.phone,
      location: row ? serializeDriverLocation(row, order.driver.name) : null,
    };
  }

  const livePosition = driver?.location ?? null;
  const driverToDestinationKm = livePosition
    ? distanceKm(
        { lat: livePosition.latitude, lng: livePosition.longitude },
        { lat: destination.latitude, lng: destination.longitude },
      )
    : null;

  return {
    orderId: order.id,
    orderNumber: order.orderNumber,
    status: order.status,
    destination,
    restaurant: {
      latitude: restaurant.lat,
      longitude: restaurant.lng,
      source: 'gps',
      label: restaurant.name,
    },
    driver,
    isLive: order.status === 'READY' || order.status === 'OUT_FOR_DELIVERY',
    driverToDestinationKm,
    generatedAt: new Date().toISOString(),
  };
}

/** Real captured coordinates when present, otherwise a labelled estimate. */
function destinationPoint(order: OrderWithRelations): TrackingPoint {
  const hasGps =
    isValidLatitude(order.deliveryLatitude) && isValidLongitude(order.deliveryLongitude);
  if (hasGps) {
    return {
      latitude: order.deliveryLatitude as number,
      longitude: order.deliveryLongitude as number,
      source: 'gps',
      label: order.deliveryArea ?? 'Your delivery address',
    };
  }
  const estimate = estimateCoordinates(order.deliveryAddress, order.deliveryArea);
  return {
    latitude: estimate.lat,
    longitude: estimate.lng,
    source: 'estimated',
    label: order.deliveryArea ?? 'Your delivery address',
  };
}

/** Every driver currently sharing a position (admin operations overview). */
export async function listLiveDrivers(): Promise<DriverLocationDTO[]> {
  const rows = await prisma.driverLocation.findMany({
    where: { isOnline: true },
    include: { driver: { select: { name: true } } },
    orderBy: { updatedAt: 'desc' },
    take: 50,
  });
  return rows.map((row) => serializeDriverLocation(row, row.driver?.name ?? 'Driver'));
}


