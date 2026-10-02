import type { Server as HttpServer } from 'node:http';
import { Server, type Socket } from 'socket.io';
import {
  SOCKET_ROOMS,
  type ClientToServerEvents,
  type ServerToClientEvents,
  type SocketData,
} from '@delivery/shared';
import { prisma } from '../lib/prisma';
import { verifyAccessToken } from '../lib/tokens';
import { isAllowedOrigin } from '../config/env';
import { logger } from '../lib/logger';
import { canViewOrder } from '../services/order-access.service';
import { driverLocationInputSchema, publishDriverLocation, stopDriverLocation } from '../services/tracking.service';
import { createKeyedIntervalLimit } from './event-rate-limit';
import { isSocketSessionActive, socketAuthorizationExpiresAt } from './socket-session';
import { createDriverSocketRegistry } from './driver-socket-registry';

type AppServer = Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;
type AppSocket = Socket<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;

let io: AppServer | null = null;
const MIN_DRIVER_LOCATION_EVENT_INTERVAL_MS = 1_000;
const driverLocationEventLimit = createKeyedIntervalLimit(MIN_DRIVER_LOCATION_EVENT_INTERVAL_MS);
const driverSocketRegistry = createDriverSocketRegistry();

/**
 * The handshake is authenticated with a JWT, but the allow-list is still
 * enforced: an unknown page must not be able to open an authenticated socket to
 * the API origin at all.
 */
function allowedOrigins(): (origin: string | undefined, callback: (error: Error | null, allow?: boolean) => void) => void {
  return (origin, callback) => {
    if (!origin || isAllowedOrigin(origin)) {
      callback(null, true);
      return;
    }
    logger.warn('[security] rejected untrusted socket origin', { origin });
    callback(null, false);
  };
}

export function initRealtime(server: HttpServer): AppServer {
  io = new Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>(
    server,
    {
      cors: { origin: allowedOrigins(), credentials: true },
      path: '/socket.io',
      transports: ['websocket', 'polling'],
      pingTimeout: 25_000,
    },
  );

  io.use((socket: AppSocket, next) => {
    const token =
      (socket.handshake.auth?.token as string | undefined) ??
      (typeof socket.handshake.query?.token === 'string' ? socket.handshake.query.token : undefined);

    if (!token) {
      next(new Error('Authentication required'));
      return;
    }
    void (async () => {
      try {
        const payload = verifyAccessToken(token);
        const [session, user] = await Promise.all([
          prisma.session.findUnique({
            where: { id: payload.sessionId },
            select: { id: true, userId: true, revokedAt: true, expiresAt: true },
          }),
          prisma.user.findUnique({
            where: { id: payload.sub },
            select: { id: true, name: true, role: true, isActive: true },
          }),
        ]);
        if (!session || !user || !isSocketSessionActive(session, user, payload.sub)) {
          next(new Error('Account is not available'));
          return;
        }
        socket.data.userId = user.id;
        socket.data.sessionId = session.id;
        socket.data.authorizationExpiresAt = socketAuthorizationExpiresAt(
          session.expiresAt,
          (payload as { exp?: number }).exp,
        );
        socket.data.role = user.role;
        socket.data.name = user.name;
        next();
      } catch {
        next(new Error('Authentication failed'));
      }
    })();
  });

  io.on('connection', (socket: AppSocket) => {
    const { userId, role, name } = socket.data;
    const authorizationTimer = setTimeout(
      () => socket.disconnect(true),
      Math.max(0, socket.data.authorizationExpiresAt - Date.now()),
    );
    authorizationTimer.unref();
    if (role === 'DRIVER') driverSocketRegistry.add(userId, socket.id);
    socket.join(SOCKET_ROOMS.user(userId));
    socket.join(SOCKET_ROOMS.role(role));
    socket.join(`session:${socket.data.sessionId}`);
    if (role === 'CUSTOMER') socket.join(SOCKET_ROOMS.public);

    logger.debug(`socket connected: ${name} (${role})`, { id: socket.id });

    /**
     * Joining an order room is a privileged action: the room carries live driver
     * positions and order updates. Membership is therefore checked against the
     * database on every subscribe - a client can never reach another customer's
     * or another driver's order just by guessing an id.
     */
    socket.on('order:subscribe', (orderId: string, ack?: (ok: boolean) => void) => {
      if (typeof orderId !== 'string' || orderId.length === 0 || orderId.length > 64) {
        ack?.(false);
        return;
      }
      void (async () => {
        try {
          const order = await prisma.order.findUnique({
            where: { id: orderId },
            select: { customerId: true, driverId: true, status: true },
          });
          if (!order || !canViewOrder(order, { id: userId, role })) {
            logger.warn('[security] socket order subscription denied', {
              userId,
              role,
              orderId,
              orderFound: Boolean(order),
            });
            ack?.(false);
            return;
          }
          socket.join(SOCKET_ROOMS.order(orderId));
          ack?.(true);
        } catch (error) {
          logger.warn('order subscription failed', {
            userId,
            orderId,
            errorType: error instanceof Error ? error.name : 'UnknownError',
          });
          ack?.(false);
        }
      })();
    });

    socket.on('order:unsubscribe', (orderId: string) => {
      if (typeof orderId === 'string' && orderId.length > 0) {
        socket.leave(SOCKET_ROOMS.order(orderId));
      }
    });

    /**
     * Live GPS from a driver device. Only DRIVER accounts may publish, the
     * payload is validated, and the fix is only fanned out to the people allowed
     * to see it (own devices, the customers of that driver's active orders,
     * administrators), never to the public room.
     */
    socket.on('driver:location', (input, ack) => {
      if (role !== 'DRIVER') {
        ack?.(false);
        return;
      }
      if (!driverLocationEventLimit.accept(userId)) {
        ack?.(false);
        return;
      }
      const parsed = driverLocationInputSchema.safeParse(input);
      if (!parsed.success) {
        ack?.(false);
        return;
      }
      driverSocketRegistry.add(userId, socket.id);
      void publishDriverLocation({
        driver: { id: userId, name },
        input: parsed.data,
      })
        .then(() => ack?.(true))
        .catch((error: unknown) => {
          logger.warn('driver location rejected', {
            userId,
            errorType: error instanceof Error ? error.name : 'UnknownError',
          });
          ack?.(false);
        });
    });

    /** Driver stopped sharing (end of shift / left the map screen). */
    socket.on('driver:offline', (ack) => {
      if (role !== 'DRIVER') {
        ack?.(false);
        return;
      }
      const remainingSockets = driverSocketRegistry.remove(userId, socket.id);
      driverLocationEventLimit.forget(userId);
      if (remainingSockets !== 0) {
        ack?.(true);
        return;
      }
      void stopDriverLocation({ id: userId })
        .then(() => ack?.(true))
        .catch(() => ack?.(false));
    });

    socket.on('disconnect', (reason) => {
      clearTimeout(authorizationTimer);
      logger.debug(`socket disconnected: ${name}`, { reason });
      if (role === 'DRIVER' && driverSocketRegistry.remove(userId, socket.id) === 0) {
        driverLocationEventLimit.forget(userId);
        void stopDriverLocation({ id: userId }).catch((error: unknown) => {
          logger.warn('driver offline update failed after final socket disconnect', {
            userId,
            errorType: error instanceof Error ? error.name : 'UnknownError',
          });
        });
      }
    });
  });

  return io;
}

export function getRealtime(): AppServer | null {
  return io;
}

export function disconnectSessionSockets(sessionId: string): void {
  io?.in(`session:${sessionId}`).disconnectSockets(true);
}

export function disconnectUserSockets(userId: string): void {
  io?.in(SOCKET_ROOMS.user(userId)).disconnectSockets(true);
}

export function hasConnectedDriverSockets(driverId: string): boolean {
  return driverSocketRegistry.count(driverId) > 0;
}

type EventArgs<E extends keyof ServerToClientEvents> = Parameters<ServerToClientEvents[E]>;

function emit<E extends keyof ServerToClientEvents>(room: string, event: E, args: EventArgs<E>): void {
  if (!io) return;
  (io.to(room) as unknown as { emit: (event: string, ...rest: unknown[]) => void }).emit(
    event,
    ...args,
  );
}

export function emitToUser<E extends keyof ServerToClientEvents>(
  userId: string,
  event: E,
  ...args: EventArgs<E>
): void {
  emit(SOCKET_ROOMS.user(userId), event, args);
}

export function emitToRole<E extends keyof ServerToClientEvents>(
  role: 'CUSTOMER' | 'KITCHEN' | 'DRIVER' | 'ADMIN',
  event: E,
  ...args: EventArgs<E>
): void {
  emit(SOCKET_ROOMS.role(role), event, args);
}

export function emitToOrder<E extends keyof ServerToClientEvents>(
  orderId: string,
  event: E,
  ...args: EventArgs<E>
): void {
  emit(SOCKET_ROOMS.order(orderId), event, args);
}

export function emitToEveryone<E extends keyof ServerToClientEvents>(
  event: E,
  ...args: EventArgs<E>
): void {
  if (!io) return;
  (io as unknown as { emit: (event: string, ...rest: unknown[]) => void }).emit(event, ...args);
}

export async function closeRealtime(): Promise<void> {
  if (!io) return;
  await io.close();
  io = null;
}