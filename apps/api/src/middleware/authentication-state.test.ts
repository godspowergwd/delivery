import { describe, expect, it } from 'vitest';
import { authenticationDenial } from './authentication-state';

const activeSession = { userId: 'user-1', revokedAt: null };
const activeUser = { id: 'user-1', isActive: true };

describe('HTTP authentication state', () => {
  it('accepts a matching active account with an unrevoked session', () => {
    expect(authenticationDenial(activeSession, activeUser, 'user-1')).toBeNull();
  });

  it('rejects missing and revoked sessions', () => {
    expect(authenticationDenial(null, activeUser, 'user-1')).toBe('SESSION_EXPIRED');
    expect(authenticationDenial({ ...activeSession, revokedAt: new Date() }, activeUser, 'user-1')).toBe('SESSION_EXPIRED');
  });

  it('rejects session subject mismatch, missing user, and disabled user', () => {
    expect(authenticationDenial({ ...activeSession, userId: 'other' }, activeUser, 'user-1')).toBe('SESSION_MISMATCH');
    expect(authenticationDenial(activeSession, null, 'user-1')).toBe('ACCOUNT_MISSING');
    expect(authenticationDenial(activeSession, { ...activeUser, isActive: false }, 'user-1')).toBe('ACCOUNT_DISABLED');
  });
});