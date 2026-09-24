/**
 * Draggable bottom sheet with three snap points — the Bolt Food driver
 * pattern: expanded (full order details), collapsed (summary) and peek
 * (handle only, map nearly full-screen).
 *
 * Drag anywhere on the grab zone. Release velocity decides the next snap and
 * the settle uses a premium spring curve. Keyboard users move between snaps
 * with ArrowUp / ArrowDown on the grab zone.
 */
import { clsx } from 'clsx';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';

export type SheetSnap = 'expanded' | 'collapsed' | 'peek';

export interface DragSheetProps {
  snap: SheetSnap;
  onSnapChange: (snap: SheetSnap) => void;
  /** Drag zone: handle + collapsed summary. Always visible. */
  header: ReactNode;
  /** Detail content, scrollable while expanded. */
  children: ReactNode;
  /** Expanded height in px (defaults to ~62% of the viewport). */
  expandedPx?: number;
  /** Collapsed height in px (summary row). */
  collapsedPx?: number;
  /** Peek height in px (handle only). */
  peekPx?: number;
  className?: string;
  ariaLabel?: string;
}

/** Velocity (px/ms) above which a fling moves a full snap. */
const FLING_THRESHOLD = 0.55;
const SNAP_ORDER: SheetSnap[] = ['peek', 'collapsed', 'expanded'];

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * Pixel height of each snap for a given viewport. Exported so floating map
 * controls can sit exactly above the sheet at every snap.
 */
export function sheetSnapHeights(
  viewport: number,
  opts: { expandedPx?: number; collapsedPx?: number; peekPx?: number } = {},
): Record<SheetSnap, number> {
  const collapsedPx = opts.collapsedPx ?? 156;
  const peekPx = opts.peekPx ?? 44;
  const expandedPx = opts.expandedPx ?? Math.round(viewport * 0.62);
  return {
    expanded: Math.max(expandedPx, collapsedPx + 40),
    collapsed: collapsedPx,
    peek: peekPx,
  };
}

export function DragSheet({
  snap,
  onSnapChange,
  header,
  children,
  expandedPx,
  collapsedPx = 156,
  peekPx = 44,
  className,
  ariaLabel = 'Order details',
}: DragSheetProps) {
  const [viewport, setViewport] = useState(() =>
    typeof window === 'undefined' ? 720 : window.innerHeight,
  );
  const [dragHeight, setDragHeight] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);
  const dragRef = useRef({ startY: 0, startHeight: 0, lastY: 0, lastAt: 0, velocity: 0 });

  useEffect(() => {
    const onResize = () => setViewport(window.innerHeight);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const expanded = expandedPx ?? Math.round(viewport * 0.62);
  const snapHeights = sheetSnapHeights(viewport, { expandedPx: expanded, collapsedPx, peekPx });
  const height = dragHeight ?? snapHeights[snap];

  const settle = useCallback(
    (targetHeight: number, velocity: number) => {
      let index = 0;
      let best = Number.POSITIVE_INFINITY;
      SNAP_ORDER.forEach((name, position) => {
        const distance = Math.abs(snapHeights[name] - targetHeight);
        if (distance < best) {
          best = distance;
          index = position;
        }
      });
      // A committed fling jumps at least one snap in its direction.
      if (Math.abs(velocity) > FLING_THRESHOLD) {
        const direction = velocity > 0 ? -1 : 1; // dragging down (v > 0) shrinks
        index = clamp(index + direction, 0, SNAP_ORDER.length - 1);
      }
      setDragHeight(null);
      onSnapChange(SNAP_ORDER[index]);
    },
    [onSnapChange, snapHeights.expanded, snapHeights.collapsed, snapHeights.peek],
  );

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      startY: event.clientY,
      startHeight: height,
      lastY: event.clientY,
      lastAt: performance.now(),
      velocity: 0,
    };
    setDragging(true);
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragging) return;
    const now = performance.now();
    const state = dragRef.current;
    const delta = state.startHeight - (event.clientY - state.startY);
    const elapsed = Math.max(now - state.lastAt, 1);
    state.velocity = (state.lastY - event.clientY) / elapsed;
    state.lastY = event.clientY;
    state.lastAt = now;
    setDragHeight(clamp(delta, snapHeights.peek, snapHeights.expanded));
  };

  const endDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragging) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    setDragging(false);
    settle(dragHeight ?? height, dragRef.current.velocity);
  };

  const onGrabKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const index = SNAP_ORDER.indexOf(snap);
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      onSnapChange(SNAP_ORDER[clamp(index + 1, 0, SNAP_ORDER.length - 1)]);
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      onSnapChange(SNAP_ORDER[clamp(index - 1, 0, SNAP_ORDER.length - 1)]);
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onSnapChange(snap === 'expanded' ? 'collapsed' : 'expanded');
    }
  };

  const style: CSSProperties = { height: `${Math.round(height)}px` };

  return (
    <section
      className={clsx(
        'sheet-spring absolute inset-x-0 bottom-0 z-30 flex flex-col overflow-hidden rounded-t-[1.75rem] border-t border-slate-200 bg-white shadow-lift',
        dragging && 'sheet-dragging',
        className,
      )}
      style={style}
      aria-label={ariaLabel}
    >
      {/* Red-and-green status edge — both colours present on every snap. */}
      <div className="duo-progress h-1 w-full flex-none" aria-hidden="true" />

      <div
        role="slider"
        aria-label={`${ariaLabel} — drag or use arrow keys to resize`}
        aria-expanded={snap !== 'peek'}
        aria-valuemin={0}
        aria-valuemax={2}
        aria-valuenow={SNAP_ORDER.indexOf(snap)}
        aria-valuetext={snap}
        tabIndex={0}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onKeyDown={onGrabKeyDown}
        className={clsx(
          'flex-none touch-none select-none rounded-t-[1.75rem] bg-white px-4 pb-2 pt-2',
          dragging ? 'cursor-grabbing' : 'cursor-grab',
        )}
      >
        <div className="mx-auto h-1.5 w-10 rounded-full bg-slate-300" aria-hidden="true" />
        {header}
      </div>

      <div
        className={clsx(
          'min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-safe',
          snap === 'expanded' ? 'opacity-100' : 'pointer-events-none opacity-0',
        )}
        aria-hidden={snap !== 'expanded'}
      >
        {children}
      </div>
    </section>
  );
}
