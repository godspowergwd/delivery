import type { DriverLoginCredentials } from '@delivery/shared';
import { DRIVER_EMAIL_DOMAIN } from '@delivery/shared';
import { formatDriverCredentials } from '@delivery/shared';

/**
 * Plain-text driver logins exist only in this tab's memory.
 *
 * The server stores nothing but the bcrypt hash, so a password can never be read
 * back later — it is remembered here only long enough for the kitchen to copy or
 * share it, right after the account is created or a password is reset. Nothing
 * is written to localStorage and nothing is sent to analytics.
 */
const issuedLogins = new Map<string, DriverLoginCredentials>();

export function rememberDriverLogin(driverId: string, credentials: DriverLoginCredentials): void {
  issuedLogins.set(driverId, credentials);
}

export function recallDriverLogin(driverId: string): DriverLoginCredentials | null {
  return issuedLogins.get(driverId) ?? null;
}

/** The exact block copied to the clipboard / share sheet. */
export function driverLoginText(credentials: DriverLoginCredentials): string {
  return formatDriverCredentials(credentials);
}

/**
 * Copies text with the async Clipboard API and falls back to the legacy
 * selection trick for older mobile browsers and non-secure origins.
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fall through to the legacy path below.
  }
  try {
    const field = document.createElement('textarea');
    field.value = text;
    field.setAttribute('readonly', '');
    field.style.position = 'fixed';
    field.style.opacity = '0';
    document.body.appendChild(field);
    field.select();
    field.setSelectionRange(0, text.length);
    const copied = document.execCommand('copy');
    document.body.removeChild(field);
    return copied;
  } catch {
    return false;
  }
}

export type LoginShareResult = 'shared' | 'copied' | 'failed';

export function canUseDeviceShareSheet(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.share === 'function';
}

/**
 * Shares the login through the device share sheet (WhatsApp, Telegram, SMS,
 * email, copy…). When the browser has no share sheet — or the driver cancels
 * it — the same text is copied to the clipboard instead, so the kitchen always
 * ends up with the credentials in hand and never retypes anything.
 */
export async function shareDriverLogin(params: {
  driverName: string;
  credentials: DriverLoginCredentials;
}): Promise<LoginShareResult> {
  const { driverName, credentials } = params;
  const text = `${driverName} - Waakye App driver login\n${driverLoginText(credentials)}`;

  if (canUseDeviceShareSheet()) {
    try {
      await navigator.share({ title: 'Driver login', text });
      return 'shared';
    } catch (error) {
      // AbortError = the driver closed the share sheet; copy instead.
      if ((error as { name?: string })?.name === 'AbortError') return 'failed';
    }
  }
  return (await copyText(text)) ? 'copied' : 'failed';
}

/** True when the account email is the internal sign-in alias, not a mailbox. */
export function isDriverAliasEmail(email: string | null | undefined): boolean {
  return Boolean(email && email.toLowerCase().endsWith(`@${DRIVER_EMAIL_DOMAIN}`));
}
