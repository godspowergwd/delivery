type SocketSession = {
  userId: string;
  revokedAt: Date | null;
  expiresAt: Date;
} | null;

type SocketUser = {
  id: string;
  isActive: boolean;
} | null;

export function isSocketSessionActive(
  session: SocketSession,
  user: SocketUser,
  tokenUserId: string,
  now = Date.now(),
): boolean {
  return Boolean(
    session &&
    session.userId === tokenUserId &&
    !session.revokedAt &&
    session.expiresAt.getTime() >= now &&
    user &&
    user.id === tokenUserId &&
    user.isActive,
  );
}

export function socketAuthorizationExpiresAt(
  sessionExpiresAt: Date,
  tokenExpiresAtSeconds: number | undefined,
): number {
  const tokenExpiresAt = typeof tokenExpiresAtSeconds === 'number'
    ? tokenExpiresAtSeconds * 1_000
    : sessionExpiresAt.getTime();
  return Math.min(sessionExpiresAt.getTime(), tokenExpiresAt);
}