/**
 * Dismissal of the static boot splash rendered by index.html.
 *
 * The splash is a full-viewport overlay (`z-index: 9999`) painted by plain HTML
 * so there is never a white flash while the bundle loads. It must be removed
 * the moment React owns the screen — and, as a safety net, even when
 * initialization fails or hangs, so the app can never be stuck on the splash.
 *
 * Pure and injectable so it stays unit-testable without a DOM library.
 */
export interface BootSplashElement {
  style: { opacity?: string; transition?: string };
  remove: () => void;
}

export interface BootSplashDocument {
  getElementById(id: string): BootSplashElement | null;
}

export interface BootSplashWindow {
  setTimeout(callback: () => void, ms: number): unknown;
  addEventListener(type: string, listener: () => void, options?: { once?: boolean }): unknown;
  removeEventListener(type: string, listener: () => void): unknown;
}

const SPLASH_ID = 'boot-splash';
const FADE_MS = 180;
const FALLBACK_MS = 8_000;

let dismissed = false;

/** True once the splash has been dismissed (guards StrictMode double mounts). */
export function isBootSplashDismissed(): boolean {
  return dismissed;
}

/**
 * Fades the boot splash out and removes it. Idempotent, safe to call any
 * number of times from any code path. Returns true when this call dismissed it.
 */
export function removeBootSplash(
  doc: BootSplashDocument | undefined = typeof document === 'undefined' ? undefined : document,
  win: BootSplashWindow | undefined = typeof window === 'undefined' ? undefined : window,
): boolean {
  if (dismissed) return false;
  const splash = doc?.getElementById(SPLASH_ID) ?? null;
  dismissed = true;
  if (!splash) return false;
  try {
    splash.style.transition = `opacity ${FADE_MS}ms ease-out`;
    splash.style.opacity = '0';
    win?.setTimeout(() => splash.remove(), FADE_MS + 40);
  } catch {
    splash.remove();
  }
  return true;
}

/**
 * Browser-level safety nets: if the app bundle never executes (script error,
 * blocked module) or bootstrap hangs, the splash is still dismissed after
 * `fallbackMs`. The app dismisses it much earlier on the happy path.
 */
export function installBootSplashSafetyNet(
  win: BootSplashWindow = window,
  fallbackMs: number = FALLBACK_MS,
): () => void {
  const onFail = () => removeBootSplash();
  win.setTimeout(onFail, fallbackMs);
  win.addEventListener('error', onFail, { once: true });
  win.addEventListener('unhandledrejection', onFail, { once: true });
  return () => {
    win.removeEventListener('error', onFail);
    win.removeEventListener('unhandledrejection', onFail);
  };
}
