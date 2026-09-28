/**
 * Driver accounts are created by the Kitchen (Kitchen > Settings > Driver
 * Management). A driver always signs in with the short username the kitchen
 * issued; the email on the account is a non-routable internal alias used only to
 * satisfy the unique email column, never a mailbox.
 */
export const DRIVER_EMAIL_DOMAIN = 'drivers.waakyeapp.com';

/** True when the address is the internal sign-in alias (not a real mailbox). */
export function isPlaceholderDriverEmail(email: string | null | undefined): boolean {
  return Boolean(email && email.toLowerCase().endsWith(`@${DRIVER_EMAIL_DOMAIN}`));
}

/** A driver row as shown in Kitchen > Settings > Driver Management. */
export interface KitchenDriverDTO {
  id: string;
  name: string;
  /** Short sign-in name; null for accounts that only sign in with an email. */
  username: string | null;
  phone: string | null;
  email: string;
  isActive: boolean;
  /** True while the driver's device is sharing a live position. */
  isOnline: boolean;
  /** When the driver's position was last received (ISO string) or null. */
  lastSeenAt: string | null;
  lastLoginAt: string | null;
  createdAt: string;
  /** Kitchen note captured when the driver account was created. */
  notes: string | null;
  activeDeliveries: number;
  completedDeliveries: number;
  totalDeliveries: number;
}

/** The plain-text login handed to a driver. Never stored in the database. */
export interface DriverLoginCredentials {
  /** Sign-in name (a username, or the account email when no username was issued). */
  username: string;
  password: string;
}

/** One-tap copy block, e.g. "Username: driverjoy\nPassword: Abc12345". */
export function formatDriverCredentials(credentials: DriverLoginCredentials): string {
  return `Username: ${credentials.username}\nPassword: ${credentials.password}`;
}
