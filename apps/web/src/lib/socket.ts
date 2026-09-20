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

export type { ClientToServerEvents, ServerToClientEvents };
