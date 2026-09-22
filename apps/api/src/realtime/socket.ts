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
import { logger } from '../lib/logger';
import { driverLocationInputSchema, publishDriverLocation, stopDriverLocation } from '../services/tracking.service';

type AppServer = Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;
type AppSocket = Socket<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;

let io: AppServer | null = null;

function allowedOrigins(): string[] | boolean {
  return true; // handshake is authenticated with a JWT, so any origin may connect
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
        const user = await prisma.user.findUnique({
          where: { id: payload.sub },
          select: { id: true, name: true, role: true, isActive: true },
        });
        if (!user || !user.isActive) {
          next(new Error('Account is not available'));
          return;
        }
        socket.data.userId = user.id;
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
    socket.join(SOCKET_ROOMS.user(userId));
    socket.join(SOCKET_ROOMS.role(role));
    if (role === 'CUSTOMER') socket.join(SOCKET_ROOMS.public);

    logger.debug(`socket connected: ${name} (${role})`, { id: socket.id });

    socket.on('order:subscribe', (orderId: string, ack?: (ok: boolean) => void) => {
      if (typeof orderId === 'string' && orderId.length > 0) {
        socket.join(SOCKET_ROOMS.order(orderId));
        ack?.(true);
        return;
      }
      ack?.(false);
    });

    socket.on('order:unsubscribe', (orderId: string) => {
      socket.leave(SOCKET_ROOMS.order(orderId));
    });

    /**
     * Live GPS from a driver device. Only DRIVER accounts may publish, the
     * payload is validated, and the fix is only fanned out to the people allowed
     * to see it (own devices, the customers of that driver's active orders,
     * administrators) — never to the public room.
     */
    socket.on('driver:location', (input, ack) => {
      if (role !== 'DRIVER') {
        ack?.(false);
        return;
      }
      const parsed = driverLocationInputSchema.safeParse(input);
      if (!parsed.success) {
        ack?.(false);
        return;
      }
      void publishDriverLocation({
        driver: { id: userId, name },
        input: parsed.data,
      })
        .then(() => ack?.(true))
        .catch((error: unknown) => {
          logger.warn('driver location rejected', { userId, error: (error as Error)?.message });
          ack?.(false);
        });
    });

    /** Driver stopped sharing (end of shift / left the map screen). */
    socket.on('driver:offline', (ack) => {
      if (role !== 'DRIVER') {
        ack?.(false);
        return;
      }
      void stopDriverLocation({ id: userId })
        .then(() => ack?.(true))
        .catch(() => ack?.(false));
    });

    socket.on('disconnect', (reason) => {
      logger.debug(`socket disconnected: ${name}`, { reason });
    });
  });

  return io;
}

export function getRealtime(): AppServer | null {
  return io;
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