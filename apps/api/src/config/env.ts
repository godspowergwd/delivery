import path from 'node:path';
import { config as loadEnv } from 'dotenv';
import { z } from 'zod';

// Load apps/api/.env regardless of whether we run from src (tsx) or dist (node).
loadEnv({ path: path.resolve(__dirname, '../../.env') });

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  API_PUBLIC_URL: z.string().default('http://localhost:4000'),
  APP_PUBLIC_URL: z.string().default('http://localhost:5173'),
  JWT_SECRET: z.string().min(16, 'JWT_SECRET must be at least 16 characters'),
  JWT_ACCESS_TTL: z.string().default('30m'),
  JWT_REFRESH_TTL: z.string().default('30d'),
  JWT_REMEMBER_TTL: z.string().default('90d'),
  BUSINESS_NAME: z.string().default('Delivery System'),
  CURRENCY_CODE: z.string().default('GHS'),
  CURRENCY_SYMBOL: z.string().default('GH\u20b5'),
  DELIVERY_FEE: z.coerce.number().min(0).default(8),
  TAX_RATE: z.coerce.number().min(0).default(2.5),
  MIN_ORDER_TOTAL: z.coerce.number().min(0).default(10),
  SUPPORT_PHONE: z.string().default('+233000000000'),
  SUPPORT_EMAIL: z.string().default('support@deliverysystem.app'),
  SEED_ADMIN_EMAIL: z.string().default('admin@deliverysystem.app'),
  SEED_ADMIN_PASSWORD: z.string().default('Admin@12345'),
  SEED_KITCHEN_EMAIL: z.string().default('kitchen@deliverysystem.app'),
  SEED_KITCHEN_PASSWORD: z.string().default('Kitchen@12345'),
  SEED_CUSTOMER_EMAIL: z.string().default('customer@deliverysystem.app'),
  SEED_CUSTOMER_PASSWORD: z.string().default('Customer@12345'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const details = parsed.error.issues
    .map((issue) => `  - ${issue.path.join('.') || 'env'}: ${issue.message}`)
    .join('\n');
  throw new Error(`Invalid environment configuration:\n${details}`);
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
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:4173',
  'http://127.0.0.1:4173',
];