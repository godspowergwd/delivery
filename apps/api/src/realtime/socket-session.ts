type SocketSession = {
  userId: string;
  revokedAt: Date | null;
} | null;

type SocketUser = {
  id: string;
  isActive: boolean;
} | null;

export function isSocketSessionActive(
  session: SocketSession,
  user: SocketUser,
  tokenUserId: string,
): boolean {
  return Boolean(
    session &&
    session.userId === tokenUserId &&
    !session.revokedAt &&
    user &&
    user.id === tokenUserId &&
    user.isActive,
  );
}

export function socketAuthorizationExpiresAt(
  tokenExpiresAtSeconds: number | undefined,
): number {
  const tokenExpiresAt = typeof tokenExpiresAtSeconds === 'number'
    ? tokenExpiresAtSeconds * 1_000
    : Number.MAX_SAFE_INTEGER;
  return tokenExpiresAt;
}