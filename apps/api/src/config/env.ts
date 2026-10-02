import path from 'node:path';
import { config as loadEnv } from 'dotenv';
import { z } from 'zod';
import { isIsolatedLoadTestDatabaseUrl } from '@delivery/shared';

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
  /**
   * Number of reverse proxies that sit in front of the API.
   *
   * Express uses this to derive `req.ip` from X-Forwarded-For, and the rate
   * limiters key on that identity: too low and every visitor behind the CDN
   * looks like one client, too high and a visitor could spoof an address.
   * Render alone = 1 (default), Cloudflare in front of Render = 2.
   */
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(10).default(1),
  /**
   * Development and test only: answers address search, reverse geocoding and
   * directions with deterministic synthetic data instead of calling Mapbox, so
   * load tests never consume Mapbox usage. Permanently ignored when
   * NODE_ENV=production (see services/mapbox.service.ts).
   */
  MAPBOX_MOCK: z.enum(['true', 'false', '1', '0']).default('false'),
  LOAD_TEST_ENV: z.enum(['disabled', 'isolated']).default('disabled'),
  JWT_SECRET: z.string().min(16, 'JWT_SECRET must be at least 16 characters'),
  /**
   * Access tokens are renewed silently using a rotating, database-backed refresh
   * session. Refresh-cookie persistence is fixed at the browser maximum (400 days).
   */
  JWT_ACCESS_TTL: z.string().default('12h'),
  /**
   * Cloudflare R2 object storage credentials and bucket configuration.
   */
  R2_ACCOUNT_ID: z.string().trim().default(''),
  R2_ACCESS_KEY_ID: z.string().trim().default(''),
  R2_SECRET_ACCESS_KEY: z.string().trim().default(''),
  R2_BUCKET_NAME: z.string().trim().default(''),
  R2_PUBLIC_URL: z.string().trim().default(''),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const details = parsed.error.issues
    .map((issue) => `  - ${issue.path.join('.') || 'env'}: ${issue.message}`)
    .join('; ');
  throw new Error(`Invalid environment configuration: ${details}`);
}

export const env = parsed.data;

export const loadTestAttestationPath = path.resolve(
  __dirname,
  `../../.load-test-runtime-${env.PORT}.json`,
);

export const isProduction = env.NODE_ENV === 'production';
export const isTest = env.NODE_ENV === 'test';

if (isProduction && env.LOAD_TEST_ENV === 'isolated') {
  throw new Error('LOAD_TEST_ENV=isolated is not permitted when NODE_ENV=production.');
}

/**
 * Mock map mode never applies to a production build, whatever the environment
 * variable says: a production deployment must always talk to the real provider.
 */
export const mapboxMockEnabled =
  !isProduction && (env.MAPBOX_MOCK === 'true' || env.MAPBOX_MOCK === '1');

const LOAD_TEST_PROVIDER_SECRET =
  /^(?:SEED_.*_PASSWORD|R2_(?:ACCOUNT_ID|ACCESS_KEY_ID|SECRET_ACCESS_KEY|BUCKET_NAME)|MAPBOX_(?:ACCESS_TOKEN|TOKEN)|VITE_MAPBOX_TOKEN|HUBTEL_|SMS_|TWILIO_|STRIPE_|PAYSTACK_|FLUTTERWAVE_|PAYMENT_|MOMO_)/i;

function hasLoadTestProviderCredentials(): boolean {
  return Object.entries(process.env).some(
    ([key, value]) => LOAD_TEST_PROVIDER_SECRET.test(key) && Boolean(value?.trim()),
  );
}

export function configuredLoadTestAccountCount(): number {
  try {
    const accounts = JSON.parse(process.env.LOAD_TEST_ACCOUNTS_JSON ?? 'null');
    if (!Array.isArray(accounts)) return 0;
    const roles = new Set<string>();
    const emails = new Set<string>();
    for (const account of accounts) {
      if (
        !account ||
        typeof account.email !== 'string' ||
        !/@loadtest\.invalid$/i.test(account.email) ||
        typeof account.password !== 'string' ||
        account.password.length < 12 ||
        !['CUSTOMER', 'DRIVER', 'KITCHEN', 'ADMIN'].includes(account.role)
      ) return 0;
      const email = account.email.toLowerCase();
      if (emails.has(email)) return 0;
      emails.add(email);
      roles.add(account.role);
    }
    return ['CUSTOMER', 'DRIVER', 'KITCHEN', 'ADMIN'].every((role) => roles.has(role))
      ? accounts.length
      : 0;
  } catch {
    return 0;
  }
}

export const loadTestAccountCount = configuredLoadTestAccountCount();

export const loadTestSafeConfiguration =
  env.NODE_ENV === 'development' &&
  env.LOAD_TEST_ENV === 'isolated' &&
  mapboxMockEnabled &&
  isIsolatedLoadTestDatabaseUrl(env.DATABASE_URL) &&
  (!process.env.DIRECT_URL || isIsolatedLoadTestDatabaseUrl(process.env.DIRECT_URL)) &&
  loadTestAccountCount > 0 &&
  !hasLoadTestProviderCredentials();

/** Uploaded images are stored on disk next to the compiled server. */
export const UPLOAD_DIR = path.resolve(__dirname, '../../uploads');
/** Generated report files (PDF/Excel) are stored here. */
export const REPORT_DIR = path.resolve(__dirname, '../../storage');

/**
 * Exact origins allowed to call the API with credentials.
 *
 * Localhost entries are only ever added outside production: a production API has
 * no reason to accept a browser session from a developer machine, and the public
 * PWA origin stays explicitly listed.
 */
const LOCAL_DEV_ORIGINS = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:4173',
  'http://127.0.0.1:4173',
];

const configuredOrigins = [
  env.APP_PUBLIC_URL,
  ...env.APP_ALLOWED_ORIGINS.split(','),
  'https://godspowergwd.github.io',
  ...(isProduction ? [] : LOCAL_DEV_ORIGINS),
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
