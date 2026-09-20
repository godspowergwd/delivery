import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  BootSplashDocument,
  BootSplashWindow,
} from './boot-splash';

type Env = {
  splash: { style: Record<string, string>; remove: () => void };
  removed: string[];
  timers: Array<{ cb: () => void; ms: number }>;
  listeners: Map<string, Array<() => void>>;
  doc: BootSplashDocument;
  win: BootSplashWindow;
};

function makeEnv(splashId = 'boot-splash'): Env {
  const env: Env = {
    splash: { style: {}, remove: () => void env.removed.push('splash') },
    removed: [],
    timers: [],
    listeners: new Map(),
    doc: { getElementById: (id) => (id === splashId ? env.splash : null) },
    win: {
      setTimeout: (cb, ms) => {
        env.timers.push({ cb, ms });
        return env.timers.length;
      },
      addEventListener: (type, listener) => {
        const list = env.listeners.get(type) ?? [];
        list.push(listener);
        env.listeners.set(type, list);
        return undefined;
      },
      removeEventListener: (type, listener) => {
        const list = env.listeners.get(type) ?? [];
        env.listeners.set(type, list.filter((entry) => entry !== listener));
        return undefined;
      },
    },
  };
  return env;
}

/** The module keeps dismissal state; reset it between tests. */
async function freshModule() {
  vi.resetModules();
  return await import('./boot-splash');
}

describe('boot splash dismissal', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('fades the splash out and removes it from the DOM', async () => {
    const mod = await freshModule();
    const env = makeEnv();

    expect(mod.isBootSplashDismissed()).toBe(false);
    expect(mod.removeBootSplash(env.doc, env.win)).toBe(true);
    expect(env.splash.style.opacity).toBe('0');
    expect(env.splash.style.transition).toContain('opacity');
    expect(env.removed).toEqual([]); // removal happens after the fade timer

    env.timers[0].cb();
    expect(env.removed).toEqual(['splash']);
    expect(mod.isBootSplashDismissed()).toBe(true);
  });

  it('is idempotent: repeated calls never re-run the dismissal', async () => {
    const mod = await freshModule();
    const env = makeEnv();

    expect(mod.removeBootSplash(env.doc, env.win)).toBe(true);
    expect(mod.removeBootSplash(env.doc, env.win)).toBe(false);
    expect(env.timers).toHaveLength(1);
  });

  it('is safe when the splash element is missing (bundle fallback already ran)', async () => {
    const mod = await freshModule();
    const env = makeEnv('some-other-id');

    expect(mod.removeBootSplash(env.doc, env.win)).toBe(false);
    expect(env.splash.removed ?? null).toBeNull();
    expect(mod.isBootSplashDismissed()).toBe(true);
  });

  it('falls back to immediate removal when styling throws', async () => {
    const mod = await freshModule();
    const removed: string[] = [];
    const splash = {
      get style(): Record<string, string> {
        throw new Error('style unavailable');
      },
      remove: () => removed.push('splash'),
    };
    const doc: BootSplashDocument = { getElementById: () => splash as never };

    expect(mod.removeBootSplash(doc)).toBe(true);
    expect(removed).toEqual(['splash']);
  });

  it('installs safety nets that dismiss the splash on timeout or errors', async () => {
    const mod = await freshModule();
    const env = makeEnv();

    const dispose = mod.installBootSplashSafetyNet(env.win, 5000);
    expect(env.timers.some((timer) => timer.ms === 5000)).toBe(true);
    expect(env.listeners.get('error')).toHaveLength(1);
    expect(env.listeners.get('unhandledrejection')).toHaveLength(1);

    // A runtime error dismisses the splash (marks it dismissed; in a real
    // browser the element is faded out and removed).
    env.listeners.get('error')![0]();
    expect(mod.isBootSplashDismissed()).toBe(true);

    // The disposer unregisters the listeners.
    dispose();
    expect(env.listeners.get('error')).toHaveLength(0);
    expect(env.listeners.get('unhandledrejection')).toHaveLength(0);
  });
});
