import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { env, isProduction } from '../config/env';

/**
 * Prisma 7 connects through driver adapters. The `pg` adapter owns the
 * connection pool and talks straight to PostgreSQL over TCP.
 */
const adapter = new PrismaPg({
  connectionString: env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
});

export const prisma = new PrismaClient({
  adapter,
  log: isProduction ? ['error'] : ['warn', 'error'],
});

export async function connectDatabase(): Promise<void> {
  await prisma.$connect();
  await prisma.$queryRaw`SELECT 1`;
}

export async function disconnectDatabase(): Promise<void> {
  await prisma.$disconnect();
}

/** Convert Prisma Decimal (or null) into a plain number for JSON responses. */
export function decimalToNumber(value: unknown): number {
  if (value === null || value === undefined) return 0;
  if (typeof value === 'number') return value;
  if (typeof value === 'string') return Number.parseFloat(value) || 0;
  const asNumber = Number(value);
  return Number.isFinite(asNumber) ? asNumber : 0;
}

if (!isProduction) {
  // Surface connection problems early instead of failing on the first request.
  prisma
    .$queryRaw`SELECT 1`
    .catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`[api] database is not reachable yet: ${message}`);
    });
}

export const databaseUrl = env.DATABASE_URL;