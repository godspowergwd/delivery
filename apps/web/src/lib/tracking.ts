import { useCallback, useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { type DriverLocationDTO, type OrderTrackingDTO, distanceKm } from '@delivery/shared';
import { api } from './api';
import { useAuth } from './auth';
import type { DevicePosition } from './geolocation';
/**
 * Live tracking client.
 *
 * The socket carries every accepted GPS fix the moment it reaches the server, so
 * a moving driver updates instantly. Polling keeps the screen correct when the
 * socket is unavailable (backgrounded tab, flaky network) and is stopped as soon
 * as an order is finished.
 */

export const trackingQueryKey = (orderId: string) => ['order-tracking', orderId];

export function useOrderTracking(orderId: string | undefined, options: { enabled?: boolean } = {}) {
  const queryClient = useQueryClient();
  const { socket } = useAuth();
  const enabled = (options.enabled ?? true) && Boolean(orderId);

  const query = useQuery({
    queryKey: trackingQueryKey(orderId ?? 'none'),
    queryFn: () => api.get<{ tracking: OrderTrackingDTO }>(`/orders/${orderId}/tracking`),
    enabled,
    // Light polling only while the delivery can still move.
    refetchInterval: (result) => {
      const tracking = result.state.data?.tracking;
      if (!tracking) return false;
      return tracking.isLive ? 12_000 : false;
    },
    staleTime: 5_000,
  });

  useEffect(() => {
    if (!socket || !orderId) return;

    const isMine = (tracking: OrderTrackingDTO | undefined, driverId: string): boolean =>
      Boolean(tracking && tracking.driver && tracking.driver.id === driverId);

    const onLocation = (payload: { location: DriverLocationDTO; orderIds: string[] }) => {
      queryClient.setQueryData<{ tracking: OrderTrackingDTO }>(trackingQueryKey(orderId), (current) => {
        if (!current?.tracking) return current;
        const belongs =
          payload.orderIds.includes(orderId) || isMine(current.tracking, payload.location.driverId);
        if (!belongs || !current.tracking.driver) return current;
        const destination = current.tracking.destination;
        const km = distanceKm(
          { lat: payload.location.latitude, lng: payload.location.longitude },
          { lat: destination.latitude, lng: destination.longitude },
        );
        return {
          tracking: {
            ...current.tracking,
            driver: { ...current.tracking.driver, location: payload.location },
            driverToDestinationKm: km,
            generatedAt: new Date().toISOString(),
          },
        };
      });
    };

    const onOffline = (payload: { driverId: string; orderIds: string[] }) => {
      queryClient.setQueryData<{ tracking: OrderTrackingDTO }>(trackingQueryKey(orderId), (current) => {
        if (!current?.tracking?.driver) return current;
        if (payload.driverId !== current.tracking.driver.id) return current;
        return { tracking: { ...current.tracking, driver: { ...current.tracking.driver, location: null } } };
      });
    };

    socket.emit('order:subscribe', orderId);
    socket.on('driver:location', onLocation);
    socket.on('driver:offline', onOffline);
    return () => {
      socket.emit('order:unsubscribe', orderId);
      socket.off('driver:location', onLocation);
      socket.off('driver:offline', onOffline);
    };
  }, [socket, orderId, queryClient]);

  return query;
}

/** How the last position was sent to the server. */
export type PublishTransport = 'socket' | 'rest' | 'idle';

export interface LocationPublisher {
  /** Sends one fix, throttled. Safe to call on every GPS update. */
  publish(position: DevicePosition): void;
  /** Tells the server sharing has stopped (end of shift / left the map). */
  stop(): void;
  /** True while a send is in flight. */
  sending: boolean;
  /** Transport used for the most recent accepted fix. */
  transport: PublishTransport;
  /** ISO timestamp of the most recent accepted fix. */
  lastSentAt: string | null;
  /** Populated when the last attempt failed, cleared on the next success. */
  error: string | null;
}

const PUBLISH_MIN_INTERVAL_MS = 6_000;
const PUBLISH_MIN_DISTANCE_M = 25;

/**
 * Streams the driver's own device GPS to the server.
 *
 * Throttled to one update per ~6 s (or 25 m of movement), sent over the live
 * socket when it is connected and over REST when it is not — so tracking keeps
 * working through a tunnel, a lift or a flaky mobile data connection.
 */
export function useLocationPublisher(): LocationPublisher {
  const { socket } = useAuth();
  const [sending, setSending] = useState(false);
  const [transport, setTransport] = useState<PublishTransport>('idle');
  const [lastSentAt, setLastSentAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const lastRef = useRef<{ at: number; lat: number; lng: number } | null>(null);
  const inFlightRef = useRef(false);
  const socketRef = useRef(socket);
  socketRef.current = socket;

  const send = useCallback(async (position: DevicePosition): Promise<void> => {
    const payload = {
      latitude: position.lat,
      longitude: position.lng,
      accuracy: position.accuracy,
      heading: position.heading,
      speed: position.speed,
      recordedAt: position.recordedAt,
    };

    const live = socketRef.current;
    if (live?.connected) {
      const acked = await new Promise<boolean>((resolve) => {
        let settled = false;
        const timeout = window.setTimeout(() => {
          if (!settled) {
            settled = true;
            resolve(false);
          }
        }, 4_000);
        live.emit('driver:location', payload, (ok: boolean) => {
          if (settled) return;
          settled = true;
          window.clearTimeout(timeout);
          resolve(ok);
        });
      });
      if (acked) {
        setTransport('socket');
        return;
      }
    }

    // Socket missing or the ack never came back: fall back to REST.
    await api.post('/driver/location', payload);
    setTransport('rest');
  }, []);

  const publish = useCallback(
    (position: DevicePosition) => {
      const previous = lastRef.current;
      const now = Date.now();
      if (previous && inFlightRef.current) return;
      if (previous) {
        const moved = metres(position, previous);
        const elapsed = now - previous.at;
        if (moved < PUBLISH_MIN_DISTANCE_M && elapsed < PUBLISH_MIN_INTERVAL_MS) return;
        if (elapsed < 2_000) return;
      }

      inFlightRef.current = true;
      setSending(true);
      void send(position)
        .then(() => {
          lastRef.current = { at: Date.now(), lat: position.lat, lng: position.lng };
          setLastSentAt(position.recordedAt);
          setError(null);
        })
        .catch((cause: unknown) => {
          setError(cause instanceof Error ? cause.message : 'Could not share your location');
          setTransport('idle');
        })
        .finally(() => {
          inFlightRef.current = false;
          setSending(false);
        });
    },
    [send],
  );

  const stop = useCallback(() => {
    lastRef.current = null;
    const live = socketRef.current;
    if (live?.connected) {
      live.emit('driver:offline', () => undefined);
      return;
    }
    void api.del('/driver/location').catch(() => undefined);
  }, []);

  // Announce the end of sharing when the driver leaves the screen or signs out.
  useEffect(() => stop, [stop]);

  return { publish, stop, sending, transport, lastSentAt, error };
}

function metres(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number },
): number {
  const earth = 6_371_000;
  const toRad = (degrees: number) => (degrees * Math.PI) / 180;
  const dLat = toRad(to.lat - from.lat);
  const dLng = toRad(to.lng - from.lng);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(from.lat)) * Math.cos(toRad(to.lat)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return 2 * earth * Math.asin(Math.sqrt(a));
}

export function useLiveFleet(options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: ['live-fleet'],
    queryFn: () => api.get<{ drivers: DriverLocationDTO[] }>('/orders/live-drivers'),
    enabled: options.enabled ?? true,
    refetchInterval: 30_000,
  });
}
