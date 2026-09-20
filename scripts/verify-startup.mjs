#!/usr/bin/env node
/**
 * Headless startup verification for the web app.
 *
 * Guards the "stuck on the loading screen" regression class:
 *   1. the static boot splash (#boot-splash) must be dismissed,
 *   2. the login screen must render for an anonymous visitor,
 *   3. an authenticated user must land on their dashboard,
 *   4. no console errors during startup.
 *
 * Usage: node scripts/verify-startup.mjs [webUrl] [apiUrl]
 *   webUrl defaults to http://localhost:5173 (dev server)
 *   apiUrl defaults to http://localhost:4000/api
 * Requires a locally installed Chrome or Edge and Node 22+.
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const WEB = (process.argv[2] || 'http://localhost:5173').replace(/\/$/, '');
const API = (process.argv[3] || 'http://localhost:4000/api').replace(/\/$/, '');
const CDP_PORT = Number(process.env.CDP_PORT || 9313);

const CHROME_CANDIDATES = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
];

let pass = 0;
let fail = 0;
function check(cond, name, detail = '') {
  if (cond) {
    pass++;
    console.log(`  PASS  ${name}${detail ? ' - ' + detail : ''}`);
  } else {
    fail++;
    console.log(`  FAIL  ${name}${detail ? ' - ' + detail : ''}`);
  }
  return !!cond;
}

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

async function fetchJson(url, options) {
  const res = await fetch(url, options);
  if (!res.ok) throw new Error(`${url} -> ${res.status}`);
  return res.json();
}

async function main() {
  console.log('DELIVERY SYSTEM - startup verification');
  console.log(`WEB: ${WEB}`);
  console.log(`API: ${API}`);

  const chrome = CHROME_CANDIDATES.find((candidate) => fs.existsSync(candidate));
  if (!chrome) throw new Error('No Chrome/Edge binary found for headless verification.');

  const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ds-startup-'));
  const child = spawn(
    chrome,
    [
      '--headless=new',
      '--disable-gpu',
      '--no-first-run',
      '--no-default-browser-check',
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
    check(Boolean(version.Browser), 'headless browser started', version.Browser);

    const targets = await fetchJson(`http://127.0.0.1:${CDP_PORT}/json/list`);
    const page = targets.find((target) => target.type === 'page');
    cdp = await Cdp.connect(page.webSocketDebuggerUrl);

    const consoleErrors = [];
    const originalRoute = cdp.route.bind(cdp);
    cdp.route = (raw) => {
      try {
        const msg = JSON.parse(typeof raw === 'string' ? raw : raw.toString());
        if (msg.method === 'Log.entryAdded' && msg.params?.entry?.level === 'error') {
          consoleErrors.push(msg.params.entry.text);
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

    // ---- Anonymous visitor: splash dismissed, login screen visible. ----
    const loaded = cdp.once('Page.loadEventFired');
    await cdp.send('Page.navigate', { url: `${WEB}/` });
    await loaded;
    await waitFor('React mount (#root)', () =>
      cdp.evaluate("!!document.querySelector('#root') && document.querySelector('#root').children.length > 0"),
    );
    await new Promise((resolve) => setTimeout(resolve, 700)); // let the splash fade finish

    const anonymous = await cdp.evaluate(`(() => ({
      splashPresent: !!document.getElementById('boot-splash'),
      text: document.body.innerText,
    }))()`);
    check(!anonymous.splashPresent, 'boot splash is dismissed after startup');
    check(
      anonymous.text.includes('Welcome back'),
      'login screen is rendered for anonymous visitors',
      `textLength=${anonymous.text.length}`,
    );

    // ---- Authenticated visitor: dashboard renders. ----
    const login = await cdp.evaluate(`(async () => {
      const res = await fetch('${API}/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email: 'admin@deliverysystem.app', password: 'Admin@12345' }),
      });
      if (!res.ok) return { ok: false, status: res.status };
      const data = await res.json();
      localStorage.setItem('ds_access_token', data.accessToken);
      if (data.csrfToken) localStorage.setItem('ds_csrf_token', data.csrfToken);
      localStorage.setItem('ds_user', JSON.stringify(data.user));
      return { ok: true, role: data.user.role };
    })()`);
    check(login?.ok === true, 'headless login succeeds', `role=${login?.role}`);

    // Navigate back to the entry route so RoleHome redirects to the dashboard.
    const reloaded = cdp.once('Page.loadEventFired');
    await cdp.send('Page.navigate', { url: `${WEB}/` });
    await reloaded;
    await waitFor('authenticated render', async () => {
      const text = await cdp.evaluate('document.body.innerText');
      return text.includes('Revenue today');
    });

    const authed = await cdp.evaluate(`(() => ({
      splashPresent: !!document.getElementById('boot-splash'),
      text: document.body.innerText,
    }))()`);
    check(!authed.splashPresent, 'boot splash is dismissed for authenticated visitors');
    check(
      authed.text.includes('Revenue today'),
      'authenticated admin lands on the dashboard',
      `textLength=${authed.text.length}`,
    );

    check(
      consoleErrors.length === 0,
      'no console errors during startup',
      consoleErrors.slice(0, 3).join(' | '),
    );
  } finally {
    cdp?.close();
    child.kill();
    try {
      fs.rmSync(profileDir, { recursive: true, force: true });
    } catch {
      // best-effort cleanup
    }
  }

  console.log('\n============================================');
  console.log(`RESULT: ${pass} passed, ${fail} failed`);
  console.log('============================================');
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(`\nFATAL: ${error.message}`);
  process.exit(1);
});

