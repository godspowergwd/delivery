import { describe, expect, it } from 'vitest';
import { authenticationDenial } from './authentication-state';

const activeSession = { userId: 'user-1', revokedAt: null, expiresAt: new Date(20_000) };
const activeUser = { id: 'user-1', isActive: true };

describe('HTTP authentication state', () => {
  it('accepts only a matching active account and unexpired session', () => {
    expect(authenticationDenial(activeSession, activeUser, 'user-1', 10_000)).toBeNull();
  });

  it('rejects missing, revoked, and expired sessions', () => {
    expect(authenticationDenial(null, activeUser, 'user-1', 10_000)).toBe('SESSION_EXPIRED');
    expect(authenticationDenial({ ...activeSession, revokedAt: new Date(9_000) }, activeUser, 'user-1', 10_000)).toBe('SESSION_EXPIRED');
    expect(authenticationDenial({ ...activeSession, expiresAt: new Date(9_000) }, activeUser, 'user-1', 10_000)).toBe('SESSION_EXPIRED');
  });

  it('rejects session subject mismatch, missing user, and disabled user', () => {
    expect(authenticationDenial({ ...activeSession, userId: 'other' }, activeUser, 'user-1', 10_000)).toBe('SESSION_MISMATCH');
    expect(authenticationDenial(activeSession, null, 'user-1', 10_000)).toBe('ACCOUNT_MISSING');
    expect(authenticationDenial(activeSession, { ...activeUser, isActive: false }, 'user-1', 10_000)).toBe('ACCOUNT_DISABLED');
  });
});