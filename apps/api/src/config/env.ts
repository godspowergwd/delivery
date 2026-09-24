import path from 'node:path';
import { config as loadEnv } from 'dotenv';
import { z } from 'zod';

// Load apps/api/.env regardless of whether we run from src (tsx) or dist (node).
loadEnv({ path: path.resolve(__dirname, '../../.env') });

/**
 * Infrastructure configuration only.
 *
 * Business configuration (business name, currency, fees, support phone) lives in
 * PostgreSQL and is editable at runtime from Admin > Settings. Default accounts
 * are created by `prisma/seed.ts`, which owns its own defaults.
 *
 * Rule: no credential - staff email, username or password - may ever be read from
 * the environment again. See apps/api/prisma/seed.ts.
 *
 * `DIRECT_URL` is deliberately not listed here: only prisma.config.ts
 * (migrations) reads it.
 */
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  API_PUBLIC_URL: z.string().default('http://localhost:4000'),
  APP_PUBLIC_URL: z.string().default('http://localhost:5173'),
  JWT_SECRET: z.string().min(16, 'JWT_SECRET must be at least 16 characters'),
  /**
   * Sessions are INDEFINITE by design: a signed-in user stays signed in until
   * they explicitly sign out (or an administrator revokes the session / disables
   * the account / changes the password). There is no automatic timeout.
   *
   * - The access token is long-lived and renewed silently before it expires.
   * - The refresh session uses the maximum lifetime browsers allow for cookies
   *   (400 days) and is slid forward on every refresh, so an active user never
   *   hits an expiry.
   */
  JWT_ACCESS_TTL: z.string().default('12h'),
  JWT_REFRESH_TTL: z.string().default('400d'),
  JWT_REMEMBER_TTL: z.string().default('400d'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const details = parsed.error.issues
    .map((issue) => `  - ${issue.path.join('.') || 'env'}: ${issue.message}`)
    .join('; ');
  throw new Error(`Invalid environment configuration: ${details}`);
}

export const env = parsed.data;

export const isProduction = env.NODE_ENV === 'production';
export const isTest = env.NODE_ENV === 'test';

/** Uploaded images are stored on disk next to the compiled server. */
export const UPLOAD_DIR = path.resolve(__dirname, '../../uploads');
/** Generated report files (PDF/Excel) are stored here. */
export const REPORT_DIR = path.resolve(__dirname, '../../storage');

export const corsOrigins = [
  env.APP_PUBLIC_URL,
  'https://godspowergwd.github.io',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:4173',
  'http://127.0.0.1:4173',
];
