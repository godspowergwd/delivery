import { registerSW } from 'virtual:pwa-register';

/**
 * Registers the service worker with automatic update handling.
 * `applyUpdate` activates a waiting worker immediately (autoUpdate strategy),
 * and toast events keep the user informed about offline readiness.
 */
let applyUpdate: (() => Promise<void>) | undefined;

export function setupPwa(): void {
  try {
    applyUpdate = registerSW({
      immediate: true,
      onNeedRefresh: () => window.dispatchEvent(new Event('ds:pwa-update-available')),
      onOfflineReady: () => window.dispatchEvent(new Event('ds:pwa-offline-ready')),
      onRegisteredSW: () => window.dispatchEvent(new Event('ds:pwa-registered')),
    });
  } catch {
    // The PWA plugin is disabled in plain `vite` dev mode; ignore.
  }
}

export function applyPwaUpdate(): void {
  void applyUpdate?.();
}
