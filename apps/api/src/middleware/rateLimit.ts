import rateLimit from 'express-rate-limit';
import type { RequestHandler } from 'express';
import { isTest } from '../config/env';

const disable = isTest;

function limiter(options: {
  windowMs: number;
  limit: number;
  code: string;
  message: string;
}): RequestHandler {
  if (disable) {
    // Tests must be deterministic; rate limiting is verified manually.
    return (_req, _res, next) => next();
  }
  return rateLimit({
    windowMs: options.windowMs,
    limit: options.limit,
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => req.method === 'OPTIONS',
    handler: (_req, res) => {
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

/** Order creation and other write-heavy endpoints. */
export const writeLimiter = limiter({
  windowMs: 60_000,
  limit: 90,
  code: 'RATE_LIMITED',
  message: 'You are doing that too often. Please slow down.',
});