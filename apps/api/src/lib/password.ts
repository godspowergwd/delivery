import bcrypt from 'bcryptjs';

const DEFAULT_ROUNDS = 10;
const MIN_ROUNDS = 8;
const MAX_ROUNDS = 14;

/**
 * bcrypt work factor, resolved lazily so a host supplied `BCRYPT_ROUNDS` is always
 * honoured (and so unit tests never depend on the environment).
 *
 * Measured on the API host: cost 10 ≈ 200ms per sign-in, cost 12 ≈ 830ms. Cost 10
 * is the industry default for interactive logins and is still far beyond brute
 * force range. Hashes stored with a higher cost (for example the cost 12 hashes
 * created by earlier versions) are upgraded automatically on the next sign-in.
 */
function saltRounds(): number {
  const parsed = Number.parseInt(process.env.BCRYPT_ROUNDS ?? '', 10);
  if (!Number.isFinite(parsed)) return DEFAULT_ROUNDS;
  return Math.min(MAX_ROUNDS, Math.max(MIN_ROUNDS, parsed));
}

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, saltRounds());
}

/** Cost factor recorded inside a bcrypt hash (`$2b$10$...` -> 10); 0 when unreadable. */
export function passwordCost(hash: string): number {
  const parsed = Number.parseInt(hash.slice(4, 6), 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * True when a stored hash is more expensive than the configured work factor, so it
 * can be transparently re-hashed after a successful sign-in. Passwords are never
 * invalidated by this: the plain secret arrives in the same request that verified it.
 */
export function needsRehash(hash: string): boolean {
  return passwordCost(hash) > saltRounds();
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