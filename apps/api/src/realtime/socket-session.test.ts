import { describe, expect, it } from 'vitest';
import { isSocketSessionActive, socketAuthorizationExpiresAt } from './socket-session';

const validSession = {
  userId: 'user-1',
  revokedAt: null,
};
const validUser = { id: 'user-1', isActive: true };

describe('socket session admission', () => {
  it('allows a matching active account and unrevoked session', () => {
    expect(isSocketSessionActive(validSession, validUser, 'user-1')).toBe(true);
  });

  it('rejects missing, revoked, or mismatched sessions', () => {
    expect(isSocketSessionActive(null, validUser, 'user-1')).toBe(false);
    expect(isSocketSessionActive({ ...validSession, revokedAt: new Date() }, validUser, 'user-1')).toBe(false);
    expect(isSocketSessionActive({ ...validSession, userId: 'user-2' }, validUser, 'user-1')).toBe(false);
  });

  it('rejects missing, disabled, or mismatched accounts', () => {
    expect(isSocketSessionActive(validSession, null, 'user-1')).toBe(false);
    expect(isSocketSessionActive(validSession, { ...validUser, isActive: false }, 'user-1')).toBe(false);
    expect(isSocketSessionActive(validSession, { ...validUser, id: 'user-2' }, 'user-1')).toBe(false);
  });

  it('renews socket authorization at access-token expiry, independent of session lifetime', () => {
    expect(socketAuthorizationExpiresAt(20)).toBe(20_000);
    expect(socketAuthorizationExpiresAt(undefined)).toBe(Number.MAX_SAFE_INTEGER);
  });
});