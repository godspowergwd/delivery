type SessionRecord = {
  userId: string;
  revokedAt: Date | null;
  expiresAt: Date;
} | null;

type UserRecord = {
  id: string;
  isActive: boolean;
} | null;

export type AuthenticationDenial =
  | 'SESSION_EXPIRED'
  | 'SESSION_MISMATCH'
  | 'ACCOUNT_MISSING'
  | 'ACCOUNT_DISABLED';

export function authenticationDenial(
  session: SessionRecord,
  user: UserRecord,
  subject: string,
  now = Date.now(),
): AuthenticationDenial | null {
  if (!session || session.revokedAt || session.expiresAt.getTime() < now) return 'SESSION_EXPIRED';
  if (session.userId !== subject) return 'SESSION_MISMATCH';
  if (!user || user.id !== subject) return 'ACCOUNT_MISSING';
  if (!user.isActive) return 'ACCOUNT_DISABLED';
  return null;
}