import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { env, isProduction } from '../config/env';
import { logger } from './logger';

/**
 * Prisma 7 connects through driver adapters. The `pg` adapter owns the
 * connection pool and talks straight to PostgreSQL over TCP.
 *
 * Exactly one client (and therefore one pool) exists per process: requests reuse
 * warm sockets instead of paying for a TCP + TLS + auth handshake every time.
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

/**
 * Startup connectivity probe. Prisma opens sockets lazily, so a single
 * `SELECT 1` both proves the database is reachable and warms the first
 * connection - the previous `$connect()` + `SELECT 1` pair did the same work
 * twice on every boot.
 */
export async function connectDatabase(): Promise<void> {
  const startedAt = Date.now();
  await prisma.$queryRaw`SELECT 1`;
  logger.info(`Database connection ready in ${Date.now() - startedAt}ms`);
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

export const databaseUrl = env.DATABASE_URL;