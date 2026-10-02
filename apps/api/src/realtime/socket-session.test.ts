import { describe, expect, it } from 'vitest';
import { isSocketSessionActive, socketAuthorizationExpiresAt } from './socket-session';

const validSession = {
  userId: 'user-1',
  revokedAt: null,
  expiresAt: new Date(20_000),
};
const validUser = { id: 'user-1', isActive: true };

describe('socket session admission', () => {
  it('allows a matching active account and unexpired session', () => {
    expect(isSocketSessionActive(validSession, validUser, 'user-1', 10_000)).toBe(true);
  });

  it('rejects missing, revoked, expired, or mismatched sessions', () => {
    expect(isSocketSessionActive(null, validUser, 'user-1', 10_000)).toBe(false);
    expect(isSocketSessionActive({ ...validSession, revokedAt: new Date(9_000) }, validUser, 'user-1', 10_000)).toBe(false);
    expect(isSocketSessionActive({ ...validSession, expiresAt: new Date(9_000) }, validUser, 'user-1', 10_000)).toBe(false);
    expect(isSocketSessionActive({ ...validSession, userId: 'user-2' }, validUser, 'user-1', 10_000)).toBe(false);
  });

  it('rejects missing, disabled, or mismatched accounts', () => {
    expect(isSocketSessionActive(validSession, null, 'user-1', 10_000)).toBe(false);
    expect(isSocketSessionActive(validSession, { ...validUser, isActive: false }, 'user-1', 10_000)).toBe(false);
    expect(isSocketSessionActive(validSession, { ...validUser, id: 'user-2' }, 'user-1', 10_000)).toBe(false);
  });

  it('expires a socket at the earlier of JWT or session expiry', () => {
    expect(socketAuthorizationExpiresAt(new Date(50_000), 20)).toBe(20_000);
    expect(socketAuthorizationExpiresAt(new Date(20_000), 50)).toBe(20_000);
    expect(socketAuthorizationExpiresAt(new Date(20_000), undefined)).toBe(20_000);
  });
});