import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { clsx } from 'clsx';

/**
 * Motion primitives shared by every screen.
 *
 * Everything here is transform/opacity based, cheap on low-end Android devices,
 * and automatically disabled when the visitor prefers reduced motion.
 */

/** True when the visitor asked the OS to reduce motion. */
export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(query.matches);
    const listener = (event: MediaQueryListEvent) => setReduced(event.matches);
    query.addEventListener('change', listener);
    return () => query.removeEventListener('change', listener);
  }, []);

  return reduced;
}

/**
 * Reveals content as it scrolls into view (used for home-page sections).
 * Falls back to "always visible" when IntersectionObserver is unavailable.
 */
export function Reveal({
  children,
  delayMs = 0,
  className,
  as: Tag = 'div',
}: {
  children: ReactNode;
  delayMs?: number;
  className?: string;
  as?: 'div' | 'section' | 'li';
}) {
  const ref = useRef<HTMLElement | null>(null);
  const [visible, setVisible] = useState(false);
  const reduced = usePrefersReducedMotion();

  useEffect(() => {
    const node = ref.current;
    if (!node || reduced || typeof IntersectionObserver === 'undefined') {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: '0px 0px -8% 0px', threshold: 0.05 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [reduced]);

  return (
    <Tag
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ref={ref as any}
      className={clsx(visible ? 'animate-fade-up' : 'opacity-0', className)}
      style={visible ? ({ animationDelay: `${delayMs}ms` } as CSSProperties) : undefined}
    >
      {children}
    </Tag>
  );
}

/**
 * Smoothly counts from the previous value to the next one. Used by the admin
 * analytics tiles and the live ETA so numbers never jump.
 */
export function AnimatedNumber({
  value,
  durationMs = 650,
  format = (next: number) => Math.round(next).toLocaleString(),
  className,
}: {
  value: number;
  durationMs?: number;
  format?: (value: number) => string;
  className?: string;
}) {
  const reduced = usePrefersReducedMotion();
  const [display, setDisplay] = useState(value);
  const fromRef = useRef(value);

  useEffect(() => {
    if (reduced || durationMs <= 0) {
      fromRef.current = value;
      setDisplay(value);
      return;
    }
    const from = fromRef.current;
    const delta = value - from;
    if (delta === 0) return;

    let frame = 0;
    const startedAt = performance.now();
    const tick = (now: number) => {
      const progress = Math.min(1, (now - startedAt) / durationMs);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(from + delta * eased);
      if (progress < 1) frame = requestAnimationFrame(tick);
      else fromRef.current = value;
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value, durationMs, reduced]);

  return <span className={className}>{format(display)}</span>;
}

/** Ripple press feedback for buttons and large tap targets. */
export function useRipple<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);

  return useMemo(
    () => ({
      ref,
      onPointerDown: (event: React.PointerEvent<T>) => {
        const host = ref.current;
        if (!host) return;
        const rect = host.getBoundingClientRect();
        const size = Math.max(rect.width, rect.height);
        const ripple = document.createElement('span');
        ripple.className = 'ripple';
        ripple.style.width = `${size}px`;
        ripple.style.height = `${size}px`;
        ripple.style.left = `${event.clientX - rect.left - size / 2}px`;
        ripple.style.top = `${event.clientY - rect.top - size / 2}px`;
        host.appendChild(ripple);
        window.setTimeout(() => ripple.remove(), 620);
      },
    }),
    [],
  );
}

/** Fades a route's content in whenever the key changes. */
export function PageTransition({ routeKey, children }: { routeKey: string; children: ReactNode }) {
  return (
    <div key={routeKey} className="page-transition">
      {children}
    </div>
  );
}
