import { describe, expect, it } from 'vitest';
import { hashPassword, needsRehash, passwordCost, verifyPassword } from './password';

describe('password authentication', () => {
  // bcrypt cost 12 is intentionally slow; allow enough time on slow machines.
  it('stores a salted hash and accepts only the correct password', { timeout: 30_000 }, async () => {
    const password = 'Customer@12345';
    const first = await hashPassword(password);
    const second = await hashPassword(password);
    expect(first).not.toBe(password);
    expect(first).not.toBe(second);
    expect(await verifyPassword(password, first)).toBe(true);
    expect(await verifyPassword('Incorrect@12345', first)).toBe(false);
    expect(await verifyPassword('', first)).toBe(false);
  });

  it('rejects malformed stored hashes without throwing', async () => {
    expect(await verifyPassword('Customer@12345', 'invalid-hash')).toBe(false);
    expect(await verifyPassword('Customer@12345', '')).toBe(false);
  });
});

describe('password work factor', () => {
  it('hashes new passwords with the configured cost (10 by default)', async () => {
    const hash = await hashPassword('Customer@12345');
    expect(passwordCost(hash)).toBe(10);
    expect(needsRehash(hash)).toBe(false);
  });

  it('flags hashes from the previous (cost 12) default for a transparent upgrade', () => {
    const legacy = '$2b$12$C6UzMDM.H6dfI/f/IKcEeO2K3FyQ9EYq3vSj/EEXGS4hLKGMNh3Ay';
    expect(passwordCost(legacy)).toBe(12);
    expect(needsRehash(legacy)).toBe(true);
  });

  it('ignores unreadable hashes instead of trying to upgrade them', () => {
    expect(passwordCost('invalid-hash')).toBe(0);
    expect(needsRehash('invalid-hash')).toBe(false);
    expect(needsRehash('')).toBe(false);
  });
});
