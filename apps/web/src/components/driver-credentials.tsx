import { useState } from 'react';
import type { DriverLoginCredentials } from '@delivery/shared';
import { canUseDeviceShareSheet, copyText, driverLoginText, shareDriverLogin } from '../lib/credentials';
import { toast } from '../lib/realtime';
import { Button } from './ui';
import { CheckCircleIcon, CopyIcon, ShareIcon, UserIcon } from './icons';

/**
 * The credentials handover panel.
 *
 * Shown the moment a driver account is created (or a password is reissued):
 * the username and the plain-text password side by side, with exactly two
 * actions — Copy Login (one tap, both values) and Share (the device share
 * sheet: WhatsApp, Telegram, SMS, email, copy…). The kitchen never types a
 * credential again.
 */
export function DriverCredentialsCard({
  title,
  driverName,
  credentials,
  className,
}: {
  title: string;
  driverName: string;
  credentials: DriverLoginCredentials;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  const copyLogin = async (): Promise<void> => {
    const ok = await copyText(driverLoginText(credentials));
    if (ok) {
      setCopied(true);
      toast('Username and password copied', 'success');
      window.setTimeout(() => setCopied(false), 4000);
    } else {
      toast('Could not copy — select the text and copy manually.', 'error');
    }
  };

  const share = async (): Promise<void> => {
    const result = await shareDriverLogin({ driverName, credentials });
    if (result === 'shared') return;
    if (result === 'copied') {
      toast('Share sheet unavailable — the login was copied instead.', 'info');
      return;
    }
    toast('Could not share or copy the login.', 'error');
  };

  return (
    <section
      className={
        className ??
        'rg-corners overflow-hidden rounded-card border border-green-200 bg-white shadow-card'
      }
    >
      <div className="flex items-center gap-3 border-b border-green-100 bg-green-50 px-4 py-3">
        <span className="flex h-10 w-10 flex-none items-center justify-center rounded-2xl bg-green-600 text-white">
          <CheckCircleIcon className="h-5 w-5" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <p className="text-[15px] font-extrabold leading-tight text-green-900">{title}</p>
          <p className="truncate text-[13px] font-semibold text-green-700">
            {driverName} can sign in right now.
          </p>
        </div>
      </div>

      <div className="space-y-2 px-4 py-4">
        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3.5 py-2.5">
          <p className="text-[11px] font-extrabold uppercase tracking-wide text-slate-400">
            Username
          </p>
          <p className="truncate text-[17px] font-extrabold text-slate-900">{credentials.username}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3.5 py-2.5">
          <p className="text-[11px] font-extrabold uppercase tracking-wide text-slate-400">
            Password
          </p>
          <p className="break-all text-[17px] font-extrabold text-slate-900">{credentials.password}</p>
        </div>

        <div className="grid gap-2 pt-1 sm:grid-cols-2">
          <Button size="lg" variant="primary" onClick={() => void copyLogin()} className="min-h-13">
            {copied ? (
              <CheckCircleIcon className="h-5 w-5" aria-hidden="true" />
            ) : (
              <CopyIcon className="h-5 w-5" aria-hidden="true" />
            )}
            Copy Login
          </Button>
          <Button size="lg" variant="success" onClick={() => void share()} className="min-h-13">
            <ShareIcon className="h-5 w-5" aria-hidden="true" />
            Share
          </Button>
        </div>

        <p className="pt-1 text-center text-[12px] font-medium text-slate-400">
          {canUseDeviceShareSheet()
            ? 'Share opens WhatsApp, Telegram, SMS, email and more.'
            : 'This browser copies the login instead of opening a share sheet.'}
        </p>
      </div>
    </section>
  );
}

/** Compact credentials line with the driver's identity, used in empty headers. */
export function DriverIdentityBadge({ name, username }: { name: string; username: string }) {
  return (
    <span className="inline-flex min-w-0 items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-[12px] font-bold text-slate-700">
      <UserIcon className="h-3.5 w-3.5 flex-none text-slate-400" aria-hidden="true" />
      <span className="truncate">{name}</span>
      <span className="text-slate-400">·</span>
      <span className="truncate text-slate-500">{username}</span>
    </span>
  );
}
