import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  dismissInstallHelp,
  isAndroidDevice,
  markAppInstalled,
  markInstallPromptAttempted,
  wasAppInstalled,
  wasInstallHelpDismissed,
  wasInstallPromptAttempted,
} from './pwa-install';

afterEach(() => vi.unstubAllGlobals());

describe('Android PWA installation helpers', () => {
  it('detects Android user agents and platform hints only', () => {
    expect(isAndroidDevice('Mozilla/5.0 (Linux; Android 15)')).toBe(true);
    expect(isAndroidDevice('Mozilla/5.0 (X11; Linux x86_64)', 'Android')).toBe(true);
    expect(isAndroidDevice('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0)')).toBe(false);
    expect(isAndroidDevice('Mozilla/5.0 (Windows NT 10.0; Win64; x64)')).toBe(false);
  });

  it('remembers prompt attempts, dismissed help and installation', () => {
    const values = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    });

    expect(wasInstallPromptAttempted()).toBe(false);
    markInstallPromptAttempted();
    expect(wasInstallPromptAttempted()).toBe(true);

    expect(wasInstallHelpDismissed()).toBe(false);
    dismissInstallHelp();
    expect(wasInstallHelpDismissed()).toBe(true);

    expect(wasAppInstalled()).toBe(false);
    markAppInstalled();
    expect(wasAppInstalled()).toBe(true);
  });

  it('falls back to session storage if persistent storage is unavailable', () => {
    const values = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: () => { throw new Error('storage unavailable'); },
      setItem: () => { throw new Error('storage unavailable'); },
    });
    vi.stubGlobal('sessionStorage', {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    });

    markInstallPromptAttempted();
    expect(wasInstallPromptAttempted()).toBe(true);
  });
});
