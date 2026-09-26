/**
 * MAP AUDIT HARNESS — development probe, not part of the shipped app bundle.
 *
 * Mounts the *real* `LiveMap` / `useLiveMap` code inside the exact DOM the
 * driver navigation screen renders (`relative h-[100dvh]` page + `PageTransition`
 * route wrapper + `DragSheet` overlay), drives it with simulated GPS fixes, and
 * records every renderer lifecycle event so "the map shows for two seconds and
 * then disappears" can be measured instead of guessed at.
 *
 * Open at http://localhost:5173/map-audit.html — the results live on
 * `window.__MAP_AUDIT__` and are consumed by `scripts/audit-map.mjs`.
 */
import { StrictMode, useEffect, useRef, useState, type ReactElement } from 'react';
import { createRoot } from 'react-dom/client';
import { LiveMap, useLiveMap, type LiveMapHandle } from './components/LiveMap';
import { PageTransition } from './components/motion';
import { DragSheet, type SheetSnap } from './components/DragSheet';
import { KITCHEN_ANCHOR } from './lib/live-map';
import {
  instrumentGL,
  instrumentationEvents,
  instrumentationReport,
  loadMapGL,
  type PaintProbe,
} from './lib/map-engine';
import './styles.css';

type AuditEvent = { t: number; kind: string; detail: string; stack?: string };

interface AuditSample {
  t: number;
  shellW: number;
  shellH: number;
  containerW: number;
  containerH: number;
  canvasAttached: boolean;
  canvasBufferW: number;
  canvasBufferH: number;
  canvasClientW: number;
  canvasClientH: number;
  canvasOpacity: string;
  canvasVisibility: string;
  canvasDisplay: string;
  shellOverflow: string;
  fallbackCard: boolean;
  fallbackText: string;
  markers: number;
  routeLayer: boolean;
  routeFeatures: number;
  styleLoaded: boolean;
  zoom: number;
  center: [number, number];
  following: boolean;
  visible: boolean;
}

interface AuditApi {
  events: AuditEvent[];
  samples: AuditSample[];
  paint: PaintProbe | null;
  webglSupported: boolean | null;
  startedAt: number;
  ready: boolean;
  sample(): AuditSample | null;
  handle(): LiveMapHandle | null;
}

declare global {
  interface Window {
    __MAP_AUDIT__?: AuditApi;
  }
}

const now = (): number => Math.round(performance.now());

function computeVisible(sample: Omit<AuditSample, 'visible' | 't'>): boolean {
  return (
    sample.containerW > 0 &&
    sample.containerH > 0 &&
    sample.canvasAttached &&
    sample.canvasClientW > 0 &&
    sample.canvasClientH > 0 &&
    sample.canvasBufferW > 0 &&
    sample.canvasBufferH > 0 &&
    sample.canvasOpacity !== '0' &&
    sample.canvasVisibility === 'visible' &&
    sample.canvasDisplay !== 'none' &&
    !sample.fallbackCard
  );
}

/** One full picture of the renderer: DOM box, canvas state, overlays, map state. */
function readSample(handle: LiveMapHandle | null): AuditSample | null {
  const shell = document.querySelector('.map-shell') as HTMLElement | null;
  const container = document.querySelector('.map-canvas') as HTMLElement | null;
  if (!shell || !container) return null;
  const canvas = container.querySelector('canvas');
  const fallback = container.querySelector('.map-fallback');
  const canvasStyle = canvas ? window.getComputedStyle(canvas) : null;

  const base: Omit<AuditSample, 'visible' | 't'> = {
    shellW: Math.round(shell.getBoundingClientRect().width),
    shellH: Math.round(shell.getBoundingClientRect().height),
    containerW: container.clientWidth,
    containerH: container.clientHeight,
    canvasAttached: Boolean(canvas && container.contains(canvas)),
    canvasBufferW: canvas?.width ?? 0,
    canvasBufferH: canvas?.height ?? 0,
    canvasClientW: canvas ? Math.round(canvas.getBoundingClientRect().width) : 0,
    canvasClientH: canvas ? Math.round(canvas.getBoundingClientRect().height) : 0,
    canvasOpacity: canvasStyle?.opacity ?? '-',
    canvasVisibility: canvasStyle?.visibility ?? '-',
    canvasDisplay: canvasStyle?.display ?? '-',
    shellOverflow: window.getComputedStyle(shell).overflow,
    fallbackCard: Boolean(fallback),
    fallbackText: fallback?.textContent?.trim().slice(0, 120) ?? '',
    markers: document.querySelectorAll('.map-marker').length,
    routeLayer: false,
    routeFeatures: 0,
    styleLoaded: false,
    zoom: Number.NaN,
    center: [Number.NaN, Number.NaN],
    following: handle?.isFollowing() ?? false,
  };

  const map = handle?.getMap() ?? null;
  if (map) {
    try {
      base.styleLoaded = map.isStyleLoaded();
      base.zoom = map.getZoom();
      const center = map.getCenter();
      base.center = [Number(center.lat.toFixed(6)), Number(center.lng.toFixed(6))];
      base.routeLayer = Boolean(map.getLayer('onyx-route-line'));
      // Query only when the layer exists: querying a missing layer throws, the
      // engine re-fires it as an 'error' event, and that would poison the very
      // recovery behaviour this harness is measuring.
      base.routeFeatures = base.routeLayer ? map.queryRenderedFeatures({ layers: ['onyx-route-line'] }).length : 0;
    } catch {
      /* the renderer is mid-teardown — the flags above already say so */
    }
  }
  return { t: now(), ...base, visible: computeVisible(base) };
}


function Harness(): ReactElement {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const audit = window.__MAP_AUDIT__;
  const [snap, setSnap] = useState<SheetSnap>('collapsed');
  const handleRef = useLiveMap(hostRef, {
    center: { lat: 5.571264, lng: -0.284093 },
    zoom: 15,
    navigation: false,
    follow: true,
  });

  // Publish the handle + sampler once the hook exists.
  useEffect(() => {
    if (!audit) return;
    audit.handle = () => handleRef.current;
    audit.sample = () => readSample(handleRef.current);
    audit.ready = true;

    // Every container mutation (canvas attach, innerHTML wipe, fallback card).
    const container = hostRef.current;
    const describe = (node: Node): string => {
      if (node.nodeType !== 1) return '#text';
      const el = node as Element;
      return `${el.tagName.toLowerCase()}${el.className ? `.${String(el.className).trim().replace(/\s+/g, '.')}` : ''}`;
    };
    const pushEvent = (kind: 'dom.add' | 'dom.remove', node: Node): void => {
      audit.events.push({ t: now(), kind, detail: describe(node) });
    };
    const observer = new MutationObserver((records) => {
      for (const record of records) {
        for (const removed of Array.from(record.removedNodes)) pushEvent('dom.remove', removed);
        for (const added of Array.from(record.addedNodes)) pushEvent('dom.add', added);
      }
    });

    // A 0x0 container on the first frame is retried by `useLiveMap` itself —
    // the very first observation belongs after mount, not on mount.
    const sampler = window.setInterval(() => {
      if (!container) return;
      if (!audit.ready) audit.ready = true;
      const snapshot = readSample(handleRef.current);
      if (snapshot) audit.samples.push(snapshot);
      audit.paint = instrumentationReport();
    }, 200);
    if (container) observer.observe(container, { childList: true, subtree: true });
    return () => {
      window.clearInterval(sampler);
      observer.disconnect();
    };
  }, [audit, handleRef]);

  // Drive the map exactly like a live delivery: fixes, a route and a sheet
  // snap (the layout change that is supposed to require only a resize).
  useEffect(() => {
    if (!audit) return;
    const start = { ...KITCHEN_ANCHOR };
    const destination = { lat: 5.603, lng: -0.166 };
    let step = 0;
    const push = window.setInterval(() => {
      step += 1;
      const progress = Math.min(1, step / 60);
      handleRef.current.setDriver(
        { lat: start.lat + (destination.lat - start.lat) * progress, lng: start.lng + (destination.lng - start.lng) * progress },
        { animate: true, accuracyMetres: 12 },
      );
      // Destination from the first tick: the harness mounts markers *before*
      // the style finishes, which is exactly the ordering that exposed the
      // missing-layers bug — both pins must still end up on screen.
      handleRef.current.setDestination(destination);
    }, 1000);

    // A synthetic route (OSRM is unreachable from this sandbox) for the layers.
    const routeTimer = window.setTimeout(() => {
      const coordinates: Array<[number, number]> = [];
      for (let index = 0; index <= 40; index += 1) {
        const progress = index / 40;
        coordinates.push([
          start.lng + (destination.lng - start.lng) * progress,
          start.lat + (destination.lat - start.lat) * progress + Math.sin(progress * 6) * 0.002,
        ]);
      }
      handleRef.current.setRoute(coordinates, { fit: false });
      audit.events.push({ t: now(), kind: 'note', detail: `route set with ${coordinates.length} points` });
    }, 3000);

    const snapTimer = window.setTimeout(() => setSnap('expanded'), 5000);
    return () => {
      window.clearInterval(push);
      window.clearTimeout(routeTimer);
      window.clearTimeout(snapTimer);
    };
  }, [audit, handleRef]);

  return (
    <div className="relative h-[100dvh] w-full overflow-hidden bg-slate-100">
      <LiveMap mapRef={hostRef} ariaLabel="Live driver navigation map" />
      <DragSheet snap={snap} onSnapChange={setSnap} header={<p className="pt-2 text-sm font-bold">Audit sheet</p>}>
        <p className="py-4 text-sm">Sheet content</p>
      </DragSheet>
    </div>
  );
}

async function boot(): Promise<void> {
  const startedAt = now();
  const api: AuditApi = {
    events: instrumentationEvents(),
    samples: [],
    paint: null,
    webglSupported: null,
    startedAt,
    ready: false,
    sample: () => null,
    handle: () => null,
  };
  window.__MAP_AUDIT__ = api;

  const mapboxgl = await loadMapGL();
  instrumentGL(mapboxgl);
  api.webglSupported = mapboxgl.supported();
  api.events.push({ t: now(), kind: 'note', detail: `mapboxgl.supported()=${api.webglSupported}` });

  createRoot(document.getElementById('root') as HTMLElement).render(
    <StrictMode>
      <PageTransition routeKey="/driver/map">
        <Harness />
      </PageTransition>
    </StrictMode>,
  );
}

void boot();
