import bcrypt from 'bcryptjs';

const SALT_ROUNDS = 12;

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, SALT_ROUNDS);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  try {
    return await bcrypt.compare(plain, hash);
  } catch {
    return false;
  }
}

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
const SYMBOLS = '!@#$%&*?';

/** Generates a strong temporary password used by the admin reset-password flow. */
export function generateTemporaryPassword(length = 12): string {
  let out = '';
  for (let index = 0; index < length - 2; index += 1) {
    out += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  }
  const symbol = SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)];
  const digit = String(Math.floor(Math.random() * 10));
  const combined = (out + symbol + digit).split('');
  // Deterministic shuffle keeps the password random but always satisfies the policy.
  for (let index = combined.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(Math.random() * (index + 1));
    [combined[index], combined[swap]] = [combined[swap], combined[index]];
  }
  return combined.join('');
}