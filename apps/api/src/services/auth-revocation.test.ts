import { beforeEach, describe, expect, it, vi } from 'vitest';

const { prismaMock, disconnectSessionSockets, disconnectUserSockets } = vi.hoisted(() => ({
  prismaMock: {
    session: { findUnique: vi.fn(), findMany: vi.fn(), updateMany: vi.fn() },
    user: { findUnique: vi.fn(), update: vi.fn() },
    $transaction: vi.fn(),
  },
  disconnectSessionSockets: vi.fn(),
  disconnectUserSockets: vi.fn(),
}));

vi.mock('../lib/prisma', () => ({ prisma: prismaMock }));
vi.mock('../realtime/socket', () => ({
  disconnectSessionSockets,
  disconnectUserSockets,
  emitToRole: vi.fn(),
}));
vi.mock('../lib/password', () => ({
  generateTemporaryPassword: vi.fn(() => 'Synthetic-Temp-Password'),
  hashPassword: vi.fn(async () => 'hashed-password'),
  needsRehash: vi.fn(() => false),
  verifyPassword: vi.fn(async () => true),
}));
vi.mock('./activity-log.service', () => ({ logActivity: vi.fn(async () => undefined) }));
vi.mock('./notification.service', () => ({ notifyUser: vi.fn(async () => undefined) }));

import { changePassword, logout, logoutAllSessions, resetUserPassword, revokeSession } from './auth.service';

describe('session revocation closes matching sockets', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.session.findUnique.mockResolvedValue({ id: 'session-1' });
    prismaMock.session.findMany.mockResolvedValue([{ id: 'session-other-1' }, { id: 'session-other-2' }]);
    prismaMock.session.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.$transaction.mockImplementation((work) => work({ session: prismaMock.session }));
    prismaMock.user.findUnique.mockResolvedValue({
      id: 'user-1',
      name: 'Synthetic User',
      email: 'user@loadtest.invalid',
      role: 'CUSTOMER',
      isProtected: false,
      passwordHash: 'existing-hash',
    });
    prismaMock.user.update.mockResolvedValue({ id: 'user-1' });
  });

  it('disconnects the session socket on logout', async () => {
    await logout({ sessionId: 'session-1' });
    expect(prismaMock.session.updateMany).toHaveBeenCalledWith({
      where: { id: 'session-1', revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
    expect(disconnectSessionSockets).toHaveBeenCalledWith('session-1');
  });

  it('disconnects all account sockets on logout-all', async () => {
    await logoutAllSessions('user-1');
    expect(disconnectUserSockets).toHaveBeenCalledWith('user-1');
  });

  it('disconnects a single socket session when it is revoked from session settings', async () => {
    await revokeSession('user-1', 'session-1');
    expect(disconnectSessionSockets).toHaveBeenCalledWith('session-1');
  });

  it('disconnects all account sockets after an administrator password reset', async () => {
    await resetUserPassword('user-1', { id: 'admin-1', email: 'admin@loadtest.invalid', role: 'ADMIN' }, 'New-Synthetic-Password');
    expect(prismaMock.session.updateMany).toHaveBeenCalledWith({
      where: { userId: 'user-1', revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
    expect(disconnectUserSockets).toHaveBeenCalledWith('user-1');
  });

  it('disconnects only revoked devices after password change and preserves current session', async () => {
    await changePassword('user-1', 'current-password', 'new-password', 'session-current');
    expect(prismaMock.session.findMany).toHaveBeenCalledWith({
      where: { userId: 'user-1', revokedAt: null, id: { not: 'session-current' } },
      select: { id: true },
    });
    expect(disconnectSessionSockets).toHaveBeenCalledTimes(2);
    expect(disconnectSessionSockets).toHaveBeenNthCalledWith(1, 'session-other-1');
    expect(disconnectSessionSockets).toHaveBeenNthCalledWith(2, 'session-other-2');
    expect(disconnectUserSockets).not.toHaveBeenCalled();
  });
});