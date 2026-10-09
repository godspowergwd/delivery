import { useEffect, useRef, useState } from 'react';
import { isInstalledDisplay } from '../lib/pwa-display';
import {
  dismissInstallHelp,
  isAndroidDevice,
  markAppInstalled,
  markInstallPromptAttempted,
  wasAppInstalled,
  wasInstallHelpDismissed,
  wasInstallPromptAttempted,
} from '../lib/pwa-install';
import { XIcon } from './icons';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

const FALLBACK_DELAY_MS = 5000;

/** Automatically offers Android installation when the browser exposes its native prompt. */
export function PwaInstallPrompt() {
  const deferredPrompt = useRef<BeforeInstallPromptEvent | null>(null);
  const promptStarted = useRef(false);
  const [showInstallHelp, setShowInstallHelp] = useState(false);
  const [installed, setInstalled] = useState(
    () => isInstalledDisplay() || wasAppInstalled(),
  );

  useEffect(() => {
    if (!isAndroidDevice() || installed || wasInstallPromptAttempted()) return;

    let active = true;
    const fallbackTimer = window.setTimeout(() => {
      if (!active || deferredPrompt.current || wasInstallHelpDismissed()) return;
      setShowInstallHelp(true);
    }, FALLBACK_DELAY_MS);

    const onBeforeInstallPrompt = (event: Event) => {
      const installEvent = event as BeforeInstallPromptEvent;
      installEvent.preventDefault();
      deferredPrompt.current = installEvent;
      window.clearTimeout(fallbackTimer);
      setShowInstallHelp(false);

      if (promptStarted.current || wasInstallPromptAttempted()) return;
      promptStarted.current = true;
      markInstallPromptAttempted();

      void (async () => {
        try {
          await installEvent.prompt();
          const choice = await installEvent.userChoice;
          if (choice.outcome === 'accepted') {
            setShowInstallHelp(false);
          }
        } catch (error) {
          console.warn('[Maame’s Waakye] The browser could not show the install prompt:', error);
          if (active && !wasInstallHelpDismissed()) setShowInstallHelp(true);
        } finally {
          deferredPrompt.current = null;
        }
      })();
    };

    const onAppInstalled = () => {
      markAppInstalled();
      deferredPrompt.current = null;
      setInstalled(true);
      setShowInstallHelp(false);
    };

    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
    window.addEventListener('appinstalled', onAppInstalled);

    return () => {
      active = false;
      window.clearTimeout(fallbackTimer);
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
      window.removeEventListener('appinstalled', onAppInstalled);
    };
  }, [installed]);

  if (installed || !showInstallHelp) return null;

  return (
    <aside
      className="fixed inset-x-3 bottom-24 z-[70] mx-auto flex w-[min(92%,28rem)] items-start gap-3 rounded-2xl border border-green-200 bg-white p-4 shadow-xl lg:bottom-8"
      role="status"
      aria-live="polite"
    >
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold text-green-900">Install Maame’s Waakye</p>
        <p className="mt-1 text-sm leading-5 text-slate-600">
          Open your browser menu and choose <strong>Install app</strong> or{' '}
          <strong>Add to Home screen</strong>.
        </p>
      </div>
      <button
        type="button"
        className="flex h-9 w-9 flex-none items-center justify-center rounded-full text-slate-500 hover:bg-slate-100 hover:text-slate-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green-700"
        aria-label="Dismiss installation instructions"
        onClick={() => {
          dismissInstallHelp();
          setShowInstallHelp(false);
        }}
      >
        <XIcon className="h-5 w-5" />
      </button>
    </aside>
  );
}
