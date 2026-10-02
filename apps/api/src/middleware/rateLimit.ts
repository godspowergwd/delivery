import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import type { Request, RequestHandler } from 'express';
import { isTest } from '../config/env';
import { clientIp } from '../lib/http';
import { logger } from '../lib/logger';

const disable = isTest;

/**
 * Every limiter is keyed on the client address Express derived from the
 * configured trust-proxy hop count, so a spoofed X-Forwarded-For can never mint
 * a fresh bucket and shared NAT addresses stay distinguishable from one another
 * where the infrastructure allows it.
 */
function keyFor(req: Request): string {
  const ip = clientIp(req);
  // express-rate-limit's helper throws on non-IP input, so only use it for real
  // addresses and fall back to a stable bucket for the rest.
  if (ip && /^[\d.:a-fA-F]+$/.test(ip) && (ip.includes('.') || ip.includes(':'))) {
    return ipKeyGenerator(ip);
  }
  return `unknown-${ip ?? 'client'}`;
}

function limiter(options: {
  windowMs: number;
  limit: number;
  code: string;
  message: string;
}): RequestHandler {
  if (disable) {
    // Tests must be deterministic; rate limiting is verified by the dedicated
    // tests in rateLimit.test.ts and by the load-test harness.
    return (_req, _res, next) => next();
  }
  return rateLimit({
    windowMs: options.windowMs,
    limit: options.limit,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: keyFor,
    skip: (req) => req.method === 'OPTIONS',
    handler: (req, res) => {
      // A rate-limit violation is a security event worth keeping in the logs.
      logger.warn('[security] rate limit exceeded', {
        path: req.path,
        method: req.method,
        code: options.code,
        client: clientIp(req) ?? null,
      });
      res.status(429).json({
        error: {
          code: options.code,
          message: options.message,
        },
      });
    },
  });
}

/** Broad protection for every API route. */
export const globalLimiter = limiter({
  windowMs: 60_000,
  limit: 600,
  code: 'RATE_LIMITED',
  message: 'Too many requests from this device. Please wait a moment and try again.',
});

/** Tighter protection for credential endpoints to blunt brute-force attempts. */
export const authLimiter = limiter({
  windowMs: 10 * 60_000,
  limit: 40,
  code: 'TOO_MANY_ATTEMPTS',
  message: 'Too many sign-in attempts. Please wait a few minutes before trying again.',
});

/**
 * Access-token renewal happens a handful of times per session (12h access TTL),
 * so a low ceiling costs nothing and stops refresh-token guessing.
 */
export const refreshLimiter = limiter({
  windowMs: 10 * 60_000,
  limit: 60,
  code: 'TOO_MANY_ATTEMPTS',
  message: 'Too many session renewals. Please wait a moment and try again.',
});

/** Password change and administrator reset flows. */
export const passwordLimiter = limiter({
  windowMs: 15 * 60_000,
  limit: 12,
  code: 'TOO_MANY_ATTEMPTS',
  message: 'Too many password attempts. Please wait a few minutes and try again.',
});

/** Order creation and other write-heavy endpoints. */
export const writeLimiter = limiter({
  windowMs: 60_000,
  limit: 90,
  code: 'RATE_LIMITED',
  message: 'You are doing that too often. Please slow down.',
});

/** A single customer may not flood the kitchen with new orders. */
export const orderCreateLimiter = limiter({
  windowMs: 60_000,
  limit: 20,
  code: 'RATE_LIMITED',
  message: 'You have placed several orders in the last minute. Please wait a moment.',
});

/**
 * Address search, reverse geocoding and directions all spend paid Mapbox quota,
 * so they get their own small budget per device.
 */
export const geoLimiter = limiter({
  windowMs: 60_000,
  limit: 60,
  code: 'RATE_LIMITED',
  message: 'Too many map lookups. Please wait a moment and try again.',
});

/** Public catalogue reads (products, categories, settings). */
export const publicReadLimiter = limiter({
  windowMs: 60_000,
  limit: 240,
  code: 'RATE_LIMITED',
  message: 'Too many requests. Please wait a moment and try again.',
});

/** Administrative reporting and audit listings - heavy, indexed reads. */
export const adminLimiter = limiter({
  windowMs: 60_000,
  limit: 300,
  code: 'RATE_LIMITED',
  message: 'Too many administrative requests. Please wait a moment.',
});

/** Image uploads reach paid object storage. */
export const uploadLimiter = limiter({
  windowMs: 10 * 60_000,
  limit: 30,
  code: 'RATE_LIMITED',
  message: 'Too many uploads. Please wait a few minutes and try again.',
});