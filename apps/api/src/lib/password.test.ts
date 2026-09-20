import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword } from './password';

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
