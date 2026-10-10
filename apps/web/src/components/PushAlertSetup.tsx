import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { toast } from '../lib/realtime';
import { Button } from './ui';

interface PushConfig {
  enabled: boolean;
  publicKey: string | null;
}

interface PushSubscriptionPayload {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

function decodeVapidKey(value: string): ArrayBuffer {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=');
  const bytes = Uint8Array.from(atob(padded), (character) => character.charCodeAt(0));
  return bytes.buffer;
}

export function PushAlertSetup({ alertLabel }: { alertLabel: string }) {
  const [subscribed, setSubscribed] = useState(false);
  const [busy, setBusy] = useState(false);
  const supported =
    typeof window !== 'undefined' &&
    'Notification' in window &&
    'serviceWorker' in navigator &&
    'PushManager' in window;

  useEffect(() => {
    if (!supported) return;
    let cancelled = false;
    void navigator.serviceWorker.ready
      .then((registration) => registration.pushManager.getSubscription())
      .then(async (subscription) => {
        if (!subscription) return false;
        const serialized = subscription.toJSON();
        if (!serialized.endpoint || !serialized.keys?.p256dh || !serialized.keys.auth) return false;
        await api.post('/notifications/push/subscriptions', {
          endpoint: serialized.endpoint,
          keys: { p256dh: serialized.keys.p256dh, auth: serialized.keys.auth },
        } satisfies PushSubscriptionPayload);
        return true;
      })
      .then((hasSubscription) => {
        if (!cancelled) setSubscribed(hasSubscription);
      })
      .catch(() => {
        if (!cancelled) setSubscribed(false);
      });
    return () => {
      cancelled = true;
    };
  }, [supported]);

  async function enableNotifications() {
    if (!supported) {
      toast('Push notifications are not supported in this browser. Install the app from a supported browser.', 'error');
      return;
    }

    setBusy(true);
    try {
      const config = await api.get<PushConfig>('/notifications/push/config');
      if (!config.enabled || !config.publicKey) {
        throw new Error('Background alerts are not configured on the server yet.');
      }

      const permission = Notification.permission === 'default'
        ? await Notification.requestPermission()
        : Notification.permission;
      if (permission !== 'granted') {
        throw new Error('Allow notifications for this app in your device settings to receive background alerts.');
      }

      const registration = await navigator.serviceWorker.ready;
      const subscription =
        (await registration.pushManager.getSubscription()) ??
        (await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: decodeVapidKey(config.publicKey),
        }));
      const serialized = subscription.toJSON();
      if (!serialized.endpoint || !serialized.keys?.p256dh || !serialized.keys.auth) {
        throw new Error('The browser returned an incomplete push subscription. Please try again.');
      }

      const payload: PushSubscriptionPayload = {
        endpoint: serialized.endpoint,
        keys: { p256dh: serialized.keys.p256dh, auth: serialized.keys.auth },
      };
      await api.post('/notifications/push/subscriptions', payload);
      setSubscribed(true);
      toast(`Background ${alertLabel} notifications are enabled. Your device controls notification sound and volume.`, 'success');
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Could not enable background notifications.', 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        type="button"
        size="sm"
        variant={subscribed ? 'success' : 'secondary'}
        loading={busy}
        disabled={!supported || subscribed}
        onClick={() => void enableNotifications()}
      >
        {subscribed ? 'Notifications enabled' : 'Enable background alerts'}
      </Button>
      <span className="text-xs text-slate-500">
        {supported
          ? 'Sound and vibration follow your device settings.'
          : 'Install this app in a supported browser to enable push alerts.'}
      </span>
    </div>
  );
}
