import { io, type Socket } from 'socket.io-client';
import type { ClientToServerEvents, ServerToClientEvents } from '@delivery/shared';
import { getToken } from './api';

export type AppSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

const SOCKET_URL = (import.meta.env.VITE_SOCKET_URL ?? 'http://localhost:4000').replace(/\/+$/, '');

export function createAppSocket(token: string | null): AppSocket {
  return io(SOCKET_URL, {
    auth: { token: token ?? undefined },
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 8000,
    timeout: 10_000,
  });
}

/**
 * Closes a socket without the browser console error
 * `WebSocket is closed before the connection is established`.
 *
 * That error is exactly what aborting an in-flight handshake does, which is
 * what an effect cleanup does on a quick sign-out or route change. An open
 * socket is closed right away; a *connecting* one waits (bounded) for the
 * handshake to finish and is then closed cleanly.
 */
export function safeDisconnect(socket: AppSocket | null | undefined): void {
  if (!socket) return;
  if (socket.connected || !socket.active) {
    socket.disconnect();
    return;
  }
  let timer = 0;
  const finish = (): void => {
    window.clearTimeout(timer);
    socket.disconnect();
  };
  timer = window.setTimeout(finish, 3000);
  socket.once('connect', finish);
}

export type { ClientToServerEvents, ServerToClientEvents };
