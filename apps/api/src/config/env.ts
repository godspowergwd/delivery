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
  APP_ALLOWED_ORIGINS: z.string().default(''),
  JWT_SECRET: z.string().min(16, 'JWT_SECRET must be at least 16 characters'),
  /**
   * Access tokens are renewed silently using a rotating, database-backed refresh
   * session. Refresh-cookie persistence is fixed at the browser maximum (400 days).
   */
  JWT_ACCESS_TTL: z.string().default('12h'),
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

const configuredOrigins = [
  env.APP_PUBLIC_URL,
  ...env.APP_ALLOWED_ORIGINS.split(','),
  'https://godspowergwd.github.io',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:4173',
  'http://127.0.0.1:4173',
];

export const corsOrigins = [...new Set(configuredOrigins.flatMap((value) => {
  try {
    const url = new URL(value.trim());
    return url.pathname === '/' && !url.search && !url.hash ? [url.origin] : [];
  } catch {
    return [];
  }
}))];

export function isAllowedOrigin(origin: string): boolean {
  if (corsOrigins.includes(origin)) return true;
  if (isProduction) return false;
  return (
    /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(origin) ||
    /^https?:\/\/(\d{1,3}\.){3}\d{1,3}(:\d+)?$/.test(origin) ||
    /^https?:\/\/[a-z0-9-]+(:\d+)?$/i.test(origin)
  );
}
