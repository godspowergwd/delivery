/**
 * Navigation-map audit: mounts the real `LiveMap` component in a headless
 * browser (via the Vite dev server + `apps/web/map-audit.html`) and records,
 * over ~14 seconds, whether the renderer stays alive.
 *
 * Usage: node scripts/audit-map.mjs [webUrl]
 *   webUrl defaults to http://localhost:5173
 * Requires a locally installed Chrome or Edge and Node 22+.
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { WebSocket } from 'ws';

const WEB = (process.argv[2] || 'http://localhost:5173').replace(/\/$/, '');
const CDP_PORT = Number(process.env.CDP_PORT || 9314);

const CHROME_CANDIDATES = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
];

class Cdp {
  constructor(ws) {
    this.ws = ws;
    this.nextId = 0;
    this.pending = new Map();
    this.eventWaiters = new Map();
    this.ws.addEventListener('message', (event) => this.route(event.data));
  }

  static async connect(url) {
    const ws = new WebSocket(url);
    await new Promise((resolve, reject) => {
      ws.addEventListener('open', resolve, { once: true });
      ws.addEventListener('error', () => reject(new Error('CDP websocket failed')), { once: true });
    });
    return new Cdp(ws);
  }

  route(raw) {
    let msg;
    try {
      msg = JSON.parse(typeof raw === 'string' ? raw : raw.toString());
    } catch {
      return;
    }
    if (msg.id !== undefined && this.pending.has(msg.id)) {
      const { resolve, reject, timer } = this.pending.get(msg.id);
      clearTimeout(timer);
      this.pending.delete(msg.id);
      if (msg.error) reject(new Error(msg.error.message));
      else resolve(msg.result);
      return;
    }
    const waiters = this.eventWaiters.get(msg.method);
    if (waiters) {
      this.eventWaiters.delete(msg.method);
      for (const resolve of waiters) resolve(msg.params);
    }
  }

  send(method, params = {}, timeoutMs = 15_000) {
    const id = ++this.nextId;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`${method} timed out`));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  once(method, timeoutMs = 15_000) {
    return new Promise((resolve, reject) => {
      const list = this.eventWaiters.get(method) ?? [];
      list.push(resolve);
      this.eventWaiters.set(method, list);
      setTimeout(() => reject(new Error(`${method} event timed out`)), timeoutMs);
    });
  }

  async evaluate(expression) {
    const res = await this.send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    if (res.exceptionDetails) {
      throw new Error(res.exceptionDetails.exception?.description ?? res.exceptionDetails.text);
    }
    return res.result?.value;
  }

  close() {
    try {
      this.ws.close();
    } catch {
      // already closed
    }
  }
}

async function waitFor(label, fn, timeoutMs = 20_000) {
  const deadline = Date.now() + timeoutMs;
  let lastError = null;
  while (Date.now() < deadline) {
    try {
      const value = await fn();
      if (value) return value;
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`${label} did not become ready${lastError ? `: ${lastError.message}` : ''}`);
}

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} -> ${res.status}`);
  return res.json();
}

function summarizeSample(sample) {
  if (!sample) return 'no-shell';
  const zoom = Number.isFinite(sample.zoom) ? sample.zoom.toFixed(1) : '?';
  const canvas = sample.canvasAttached
    ? `${sample.canvasBufferW}x${sample.canvasBufferH}/${sample.canvasClientW}x${sample.canvasClientH}`
    : 'detached';
  return (
    `t=${(sample.t / 1000).toFixed(1)}s vis=${sample.visible ? 'YES' : 'no '} ` +
    `box=${sample.containerW}x${sample.containerH} canvas=${canvas} ` +
    `css=${sample.canvasDisplay}/${sample.canvasVisibility}/op${sample.canvasOpacity} ` +
    `markers=${sample.markers} route=${sample.routeLayer ? `${sample.routeFeatures}f` : 'none'} ` +
    `style=${sample.styleLoaded ? 'loaded' : 'pending'} zoom=${zoom} ` +
    `fallback=${sample.fallbackCard ? `"${sample.fallbackText}"` : 'none'}`
  );
}

async function main() {
  console.log('DELIVERY SYSTEM - navigation map audit');
  console.log(`WEB: ${WEB}`);
  console.log('HARNESS: /map-audit.html');

  const chrome = CHROME_CANDIDATES.find((candidate) => fs.existsSync(candidate));
  if (!chrome) throw new Error('No Chrome/Edge binary found for headless verification.');

  const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ds-mapaudit-'));
  const child = spawn(
    chrome,
    [
      '--headless=new',
      '--no-first-run',
      '--no-default-browser-check',
      '--enable-unsafe-swiftshader',
      `--remote-debugging-port=${CDP_PORT}`,
      `--user-data-dir=${profileDir}`,
      'about:blank',
    ],
    { stdio: 'ignore' },
  );

  let cdp = null;
  try {
    const version = await waitFor('Chrome DevTools endpoint', () =>
      fetchJson(`http://127.0.0.1:${CDP_PORT}/json/version`).catch(() => null),
    );
    console.log(`browser: ${version.Browser}`);

    const targets = await fetchJson(`http://127.0.0.1:${CDP_PORT}/json/list`);
    const page = targets.find((target) => target.type === 'page');
    cdp = await Cdp.connect(page.webSocketDebuggerUrl);

    const consoleErrors = [];
    const consoleWarnings = [];
    const originalRoute = cdp.route.bind(cdp);
    cdp.route = (raw) => {
      try {
        const msg = JSON.parse(typeof raw === 'string' ? raw : raw.toString());
        if (msg.method === 'Log.entryAdded') {
          const entry = msg.params?.entry;
          if (entry?.level === 'error') consoleErrors.push(entry.text);
          if (entry?.level === 'warning' && /map|webgl|style/i.test(entry.text ?? '')) {
            consoleWarnings.push(entry.text);
          }
        }
        if (msg.method === 'Runtime.exceptionThrown') {
          consoleErrors.push(msg.params?.exceptionDetails?.text ?? 'runtime exception');
        }
      } catch {
        // ignore malformed frames
      }
      originalRoute(raw);
    };

    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    await cdp.send('Log.enable');
    await cdp.send('Network.enable');

    const loaded = cdp.once('Page.loadEventFired');
    await cdp.send('Page.navigate', { url: `${WEB}/map-audit.html` });
    await loaded;
    await waitFor('audit harness ready', () => cdp.evaluate('window.__MAP_AUDIT__?.ready === true'), 30_000);

    // Observation window: 14 s, one verdict sample per 500 ms.
    const timeline = [];
    for (let i = 0; i < 28; i += 1) {
      await new Promise((resolve) => setTimeout(resolve, 500));
      timeline.push(await cdp.evaluate('window.__MAP_AUDIT__.sample()'));
    }

    const final = await cdp.evaluate(`(() => ({
      samples: window.__MAP_AUDIT__.samples.length,
      events: window.__MAP_AUDIT__.events,
      paint: window.__MAP_AUDIT__.paint,
      webgl: window.__MAP_AUDIT__.webglSupported,
    }))()`);

    console.log(`\nwebglSupported=${final.webgl} samplerTicks=${final.samples}`);
    console.log('\n--- visibility timeline (every 500 ms) ---');
    for (const sample of timeline) console.log(summarizeSample(sample));

    console.log('\n--- lifecycle log (new Map / remove / setStyle / dom wipes) ---');
    const interesting = final.events.filter((event) => event.kind !== 'note');
    if (interesting.length === 0) console.log('(no construction/teardown events captured)');
    for (const event of interesting) {
      console.log(`t=${(event.t / 1000).toFixed(1)}s ${event.kind} :: ${event.detail}`);
      if (event.stack) console.log(`    ${event.stack}`);
    }
    const mapsMade = final.events.filter((event) => event.kind === 'new Map');
    const removes = final.events.filter((event) => event.kind === 'map.remove');
    const swaps = final.events.filter((event) => event.kind === 'map.setStyle');
    const firstInvisible = timeline.find((sample) => sample && sample.visible === false);

    console.log('\n--- paint probe ---');
    console.log(
      `installed=${final.paint?.installed ?? false} paints=${final.paint?.paints ?? 0} ` +
        `removeCalls=${final.paint?.removeCalls ?? 0} styleSwaps=${final.paint?.styleSwaps ?? 0} ` +
        `lastPaint=${final.paint?.lastPaintAt ? new Date(final.paint.lastPaintAt).toISOString() : 'never'}`,
    );

    console.log('\n--- verdict ---');
    console.log(`maps constructed: ${mapsMade.length} (StrictMode double-mount accounts for the first two)`);
    console.log(`map.remove calls: ${removes.length}`);
    console.log(`style swaps: ${swaps.length}`);
    if (firstInvisible) {
      console.log(`map first NOT visible at t=${(firstInvisible.t / 1000).toFixed(1)}s:`);
      console.log(`  ${summarizeSample(firstInvisible)}`);
    } else {
      console.log('map stayed visible for the whole 14 s window');
    }

    console.log('\n--- console errors (map/style/webgl network failures first) ---');
    const noteworthy = consoleErrors.filter((text) => /map|style|webgl|tiles|glyph|sprite|openfreemap/i.test(text));
    const rest = consoleErrors.filter((text) => !/map|style|webgl|tiles|glyph|sprite|openfreemap/i.test(text));
    if (noteworthy.length === 0 && rest.length === 0) console.log('(none)');
    for (const text of [...noteworthy.slice(0, 15), ...rest.slice(0, 5)]) console.log(`  ${text}`);
    if (consoleWarnings.length > 0) {
      console.log('--- map-related warnings ---');
      for (const text of consoleWarnings.slice(0, 10)) console.log(`  ${text}`);
    }
  } finally {
    cdp?.close();
    child.kill();
    try {
      fs.rmSync(profileDir, { recursive: true, force: true });
    } catch {
      // best-effort cleanup
    }
  }
}

main().catch((error) => {
  console.error(`\nFATAL: ${error.message}`);
  process.exit(1);
});
