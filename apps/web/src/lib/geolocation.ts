import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Device location (browser Geolocation API).
 *
 * One place that understands every real-world outcome — unsupported browser,
 * insecure origin, permission prompt, denial, GPS off, timeout and recovery —
 * so screens never guess and never get stuck waiting for a fix.
 */

export type GeolocationStatus =
  | 'unsupported'
  | 'insecure'
  | 'idle'
  | 'requesting'
  | 'granted'
  | 'denied'
  | 'unavailable'
  | 'timeout';

export interface DevicePosition {
  lat: number;
  lng: number;
  /** Accuracy radius in metres. */
  accuracy: number | null;
  /** Heading in degrees, when available. */
  heading: number | null;
  /** Speed in metres per second, when available. */
  speed: number | null;
  /** When the device recorded the fix. */
  recordedAt: string;
  timestamp: number;
}

export interface GeolocationMessage {
  title: string;
  detail: string;
  /** True when the user can fix it in settings, false when it is terminal. */
  actionable: boolean;
}

export function geolocationSupported(): boolean {
  return (
    typeof navigator !== 'undefined' && 'geolocation' in navigator && Boolean(navigator.geolocation)
  );
}

/** Browsers block geolocation on plain http origins (except localhost). */
export function hasSecureOrigin(): boolean {
  if (typeof window === 'undefined') return false;
  if (window.isSecureContext) return true;
  const host = window.location.hostname;
  return host === 'localhost' || host === '127.0.0.1' || host === '[::1]';
}

export function describeGeolocationError(
  error: GeolocationPositionError | null | undefined,
): { status: GeolocationStatus; message: GeolocationMessage } {
  const code = error?.code;
  if (code === 1 /* PERMISSION_DENIED */) {
    return {
      status: 'denied',
      message: {
        title: 'Location access is off',
        detail:
          'Allow location for this app in your browser settings, then try again. You can still work without it — the map stays on Mallam, Accra.',
        actionable: true,
      },
    };
  }
  if (code === 2 /* POSITION_UNAVAILABLE */) {
    return {
      status: 'unavailable',
      message: {
        title: 'No GPS signal yet',
        detail:
          'Move somewhere with a clearer view of the sky or switch on device location, then try again.',
        actionable: true,
      },
    };
  }
  if (code === 3 /* TIMEOUT */) {
    return {
      status: 'timeout',
      message: {
        title: 'Location is taking too long',
        detail: 'We could not get a fix in time. Step outside or near a window and try again.',
        actionable: true,
      },
    };
  }
  return {
    status: 'unavailable',
    message: {
      title: 'Location is unavailable',
      detail: 'Your device did not return a position. Please try again in a moment.',
      actionable: true,
    },
  };
}

export function toDevicePosition(position: GeolocationPosition): DevicePosition {
  return {
    lat: position.coords.latitude,
    lng: position.coords.longitude,
    accuracy: Number.isFinite(position.coords.accuracy) ? position.coords.accuracy : null,
    heading:
      position.coords.heading !== null && Number.isFinite(position.coords.heading)
        ? position.coords.heading
        : null,
    speed:
      position.coords.speed !== null && Number.isFinite(position.coords.speed)
        ? position.coords.speed
        : null,
    recordedAt: new Date(position.timestamp).toISOString(),
    timestamp: position.timestamp,
  };
}

function distanceMeters(from: { lat: number; lng: number }, to: { lat: number; lng: number }): number {
  const earth = 6_371_000;
  const toRad = (degrees: number) => (degrees * Math.PI) / 180;
  const dLat = toRad(to.lat - from.lat);
  const dLng = toRad(to.lng - from.lng);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(from.lat)) * Math.cos(toRad(to.lat)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return 2 * earth * Math.asin(Math.sqrt(a));
}

/** Metres between two positions (used by the tracking maths in the UI). */
export function metersBetween(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number },
): number {
  return distanceMeters(from, to);
}

export interface UseDeviceLocationOptions {
  /** Start watching as soon as the hook mounts. */
  enabled?: boolean;
  /** Keep streaming after the first fix (default true while enabled). */
  watch?: boolean;
  highAccuracy?: boolean;
  maximumAgeMs?: number;
  timeoutMs?: number;
  /** Ignore updates smaller than this distance (metres)… */
  minDistanceM?: number;
  /** …unless this much time has passed (ms). Keeps the UI calm and saves battery. */
  minIntervalMs?: number;
}

export interface UseDeviceLocationResult {
  status: GeolocationStatus;
  position: DevicePosition | null;
  message: GeolocationMessage | null;
  /** True while the browser is asking the user for permission. */
  requesting: boolean;
  request: () => void;
  stop: () => void;
}

/**
 * React hook around `watchPosition`. State updates are throttled so a 1 Hz GPS
 * stream never causes a render storm.
 */
export function useDeviceLocation(options: UseDeviceLocationOptions = {}): UseDeviceLocationResult {
  const {
    enabled = false,
    watch = true,
    highAccuracy = true,
    maximumAgeMs = 5_000,
    timeoutMs = 15_000,
    minDistanceM = 8,
    minIntervalMs = 1_000,
  } = options;

  const [status, setStatus] = useState<GeolocationStatus>(() => {
    if (!geolocationSupported()) return 'unsupported';
    if (!hasSecureOrigin()) return 'insecure';
    return 'idle';
  });
  const [position, setPosition] = useState<DevicePosition | null>(null);
  const [message, setMessage] = useState<GeolocationMessage | null>(null);

  const watchIdRef = useRef<number | null>(null);
  const lastCommitRef = useRef<{ at: number; lat: number; lng: number } | null>(null);
  const mountedRef = useRef(true);

  const clearWatch = useCallback(() => {
    if (watchIdRef.current !== null && geolocationSupported()) {
      navigator.geolocation.clearWatch(watchIdRef.current);
    }
    watchIdRef.current = null;
  }, []);

  const commit = useCallback(
    (next: DevicePosition, force = false) => {
      if (!mountedRef.current) return;
      const previous = lastCommitRef.current;
      const now = Date.now();
      const moved = previous ? distanceMeters(previous, next) : Number.POSITIVE_INFINITY;
      if (!force && previous && moved < minDistanceM && now - previous.at < minIntervalMs) return;
      lastCommitRef.current = { at: now, lat: next.lat, lng: next.lng };
      setPosition(next);
      setStatus('granted');
      setMessage(null);
    },
    [minDistanceM, minIntervalMs],
  );

  const request = useCallback(() => {
    if (!geolocationSupported()) {
      setStatus('unsupported');
      setMessage({
        title: 'This device cannot share its location',
        detail: 'Your browser does not support GPS. The map will stay on the delivery area instead.',
        actionable: false,
      });
      return;
    }
    if (!hasSecureOrigin()) {
      setStatus('insecure');
      setMessage({
        title: 'Location needs a secure connection',
        detail: 'Open the app over https:// or install it to the home screen to allow GPS.',
        actionable: false,
      });
      return;
    }

    setStatus('requesting');
    clearWatch();

    navigator.geolocation.getCurrentPosition(
      (initial) => {
        commit(toDevicePosition(initial), true);
        if (!watch) return;
        watchIdRef.current = navigator.geolocation.watchPosition(
          (next) => commit(toDevicePosition(next)),
          (error) => {
            // A transient failure keeps the last known position on screen.
            const described = describeGeolocationError(error);
            if (!mountedRef.current) return;
            setStatus(described.status);
            setMessage(described.message);
          },
          { enableHighAccuracy: highAccuracy, maximumAge: maximumAgeMs, timeout: timeoutMs },
        );
      },
      (error) => {
        const described = describeGeolocationError(error);
        if (!mountedRef.current) return;
        setStatus(described.status);
        setMessage(described.message);
      },
      { enableHighAccuracy: highAccuracy, maximumAge: maximumAgeMs, timeout: timeoutMs },
    );
  }, [clearWatch, commit, highAccuracy, maximumAgeMs, timeoutMs, watch]);

  const stop = useCallback(() => {
    clearWatch();
    lastCommitRef.current = null;
    setStatus('idle');
    setPosition(null);
  }, [clearWatch]);

  useEffect(() => {
    mountedRef.current = true;
    if (enabled) request();
    return () => {
      mountedRef.current = false;
      clearWatch();
    };
  }, [enabled, request, clearWatch]);

  return {
    status,
    position,
    message,
    requesting: status === 'requesting',
    request,
    stop,
  };
}

