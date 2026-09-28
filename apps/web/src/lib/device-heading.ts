import { useCallback, useEffect, useRef, useState } from 'react';

export type DeviceHeadingStatus = 'idle' | 'active' | 'denied' | 'unsupported';

interface CompassReading {
  alpha: number | null;
  absolute: boolean;
  webkitCompassHeading?: number | null;
}

export function compassHeadingFromReading(reading: CompassReading): number | null {
  const webkitHeading = reading.webkitCompassHeading;
  if (typeof webkitHeading === 'number' && Number.isFinite(webkitHeading)) {
    return ((webkitHeading % 360) + 360) % 360;
  }
  if (!reading.absolute || typeof reading.alpha !== 'number' || !Number.isFinite(reading.alpha)) {
    return null;
  }
  return ((360 - reading.alpha) % 360 + 360) % 360;
}

type PermissionedOrientationConstructor = typeof DeviceOrientationEvent & {
  requestPermission?: () => Promise<'granted' | 'denied'>;
};

export function useDeviceHeading(): {
  heading: number | null;
  status: DeviceHeadingStatus;
  start: () => Promise<boolean>;
  stop: () => void;
} {
  const [heading, setHeading] = useState<number | null>(null);
  const [status, setStatus] = useState<DeviceHeadingStatus>('idle');
  const listenerRef = useRef<((event: DeviceOrientationEvent) => void) | null>(null);
  const lastUpdateRef = useRef<{ heading: number; at: number } | null>(null);

  const stop = useCallback(() => {
    const listener = listenerRef.current;
    if (listener && typeof window !== 'undefined') {
      window.removeEventListener('deviceorientation', listener);
      window.removeEventListener('deviceorientationabsolute', listener as EventListener);
    }
    listenerRef.current = null;
    lastUpdateRef.current = null;
    setHeading(null);
    setStatus('idle');
  }, []);

  const start = useCallback(async (): Promise<boolean> => {
    if (typeof window === 'undefined') return false;
    const Orientation = window.DeviceOrientationEvent as PermissionedOrientationConstructor | undefined;
    if (!Orientation) {
      setStatus('unsupported');
      return false;
    }
    if (listenerRef.current) return true;

    if (typeof Orientation.requestPermission === 'function') {
      try {
        if (await Orientation.requestPermission() !== 'granted') {
          setStatus('denied');
          return false;
        }
      } catch {
        setStatus('denied');
        return false;
      }
    }

    const listener = (event: DeviceOrientationEvent & { webkitCompassHeading?: number }) => {
      const next = compassHeadingFromReading(event);
      if (next === null) return;
      const now = Date.now();
      const previous = lastUpdateRef.current;
      const delta = previous ? Math.abs(((next - previous.heading + 540) % 360) - 180) : 360;
      if (previous && delta < 3 && now - previous.at < 500) return;
      lastUpdateRef.current = { heading: next, at: now };
      setHeading(next);
    };
    listenerRef.current = listener;
    window.addEventListener('deviceorientation', listener);
    window.addEventListener('deviceorientationabsolute', listener as EventListener);
    setStatus('active');
    return true;
  }, []);

  useEffect(() => () => {
    const listener = listenerRef.current;
    if (!listener) return;
    window.removeEventListener('deviceorientation', listener);
    window.removeEventListener('deviceorientationabsolute', listener as EventListener);
    listenerRef.current = null;
  }, []);

  return { heading, status, start, stop };
}