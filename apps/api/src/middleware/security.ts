import type { CookieOptions, NextFunction, Request, RequestHandler, Response } from 'express';
import helmet from 'helmet';
import crypto from 'node:crypto';
import { corsOrigins, isProduction } from '../config/env';
import { forbidden } from '../lib/errors';

export const REFRESH_COOKIE = 'ds_refresh';
export const CSRF_COOKIE = 'ds_csrf';

/**
 * Secure headers for a JSON/asset API. Cross-origin resource policy is relaxed so the
 * web app (different origin in development) can render uploaded product images.
 */
export const securityHeaders = helmet({
  contentSecurityPolicy: false,
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  crossOriginEmbedderPolicy: false,
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  hsts: isProduction ? { maxAge: 31_536_000, includeSubDomains: true } : false,
});

export const corsOptions = {
  origin(origin: string | undefined, callback: (error: Error | null, allow?: boolean) => void) {
    if (!origin) {
      // Same-origin requests, server-to-server calls and PWA installs from a file context.
      callback(null, true);
      return;
    }
    const allowed =
      corsOrigins.includes(origin) ||
      /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(origin) ||
      /^https:\/\/(\d{1,3}\.){3}\d{1,3}(:\d+)?$/.test(origin) ||
      /^https?:\/\/[a-z0-9-]+(:\d+)?$/i.test(origin);
    if (allowed) {
      callback(null, true);
      return;
    }
    callback(new Error(`Origin ${origin} is not allowed to call this API.`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token', 'X-Requested-With'],
  exposedHeaders: ['X-Request-Id'],
  maxAge: 86_400,
};

const STATE_CHANGING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * Defence in depth against CSRF: any state-changing request that carries an Origin
 * header must come from a trusted origin (the browser always sends it cross-origin).
 */
export const originGuard: RequestHandler = (req: Request, _res: Response, next: NextFunction) => {
  if (!STATE_CHANGING.has(req.method)) {
    next();
    return;
  }
  const origin = req.headers.origin;
  if (!origin) {
    next();
    return;
  }
  try {
    const parsed = new URL(origin);
    const host = req.headers.host ?? '';
    const sameHost = parsed.host === host;
    const allowed =
      sameHost ||
      corsOrigins.includes(origin) ||
      /^(localhost|127\.0\.0\.1|\[::1\])$/.test(parsed.hostname) ||
      /^(\d{1,3}\.){3}\d{1,3}$/.test(parsed.hostname) ||
      /^[a-z0-9-]+$/i.test(parsed.hostname);
    if (!allowed) {
      next(forbidden('This request was blocked because it came from an untrusted origin.'));
      return;
    }
    next();
  } catch {
    next(forbidden('This request was blocked because its origin header is malformed.'));
  }
};

export function createCsrfToken(): string {
  return crypto.randomBytes(24).toString('base64url');
}

export function refreshCookieOptions(maxAgeMs: number): CookieOptions {
  return {
    httpOnly: true,
    // Cross-origin deployments (PWA on GitHub Pages calling the API on
    // Render) require SameSite=None + Secure, otherwise the browser never
    // sends the refresh cookie and every reload looks like an expiry.
    sameSite: isProduction ? 'none' : 'lax',
    secure: isProduction ? true : false,
    path: '/',
    maxAge: maxAgeMs,
  };
}

export function csrfCookieOptions(maxAgeMs: number): CookieOptions {
  return {
    httpOnly: false, // must be readable by the client to echo it back in the header
    sameSite: isProduction ? 'none' : 'lax',
    secure: isProduction ? true : false,
    path: '/',
    maxAge: maxAgeMs,
  };
}

/** Double-submit validation for the cookie-authenticated auth endpoints. */
export const csrfGuard: RequestHandler = (req: Request, _res: Response, next: NextFunction) => {
  if (!STATE_CHANGING.has(req.method)) {
    next();
    return;
  }
  const headerToken = req.headers['x-csrf-token'];
  const cookieToken = (req.cookies as Record<string, string> | undefined)?.[CSRF_COOKIE];
  if (!cookieToken) {
    next();
    return;
  }
  if (typeof headerToken !== 'string' || headerToken !== cookieToken) {
    next(forbidden('Your session token could not be verified. Please sign in again.'));
    return;
  }
  next();
};