import type { CookieOptions, NextFunction, Request, RequestHandler, Response } from 'express';
import helmet from 'helmet';
import crypto from 'node:crypto';
import { isAllowedOrigin, isProduction } from '../config/env';
import { AppError, forbidden } from '../lib/errors';
import { logger } from '../lib/logger';

export const REFRESH_COOKIE = 'ds_refresh';
export const CSRF_COOKIE = 'ds_csrf';

/**
 * Secure headers for a JSON/asset API.
 *
 * The API only ever answers JSON, files and one small receipt document, so the
 * Content-Security-Policy can be locked down to `default-src 'none'`. The
 * receipt print view is HTML and overrides this header with `RECEIPT_HTML_CSP`.
 * Cross-origin resource policy stays relaxed so the web app (different origin)
 * can render uploaded product images.
 */
export const securityHeaders: RequestHandler[] = [
  helmet({
    contentSecurityPolicy: {
      useDefaults: false,
      directives: {
        'default-src': ["'none'"],
        'base-uri': ["'none'"],
        'form-action': ["'none'"],
        'frame-ancestors': ["'none'"],
        'img-src': ["'self'", 'data:'],
      },
    },
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    crossOriginEmbedderPolicy: false,
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    hsts: isProduction ? { maxAge: 31_536_000, includeSubDomains: true } : false,
    frameguard: { action: 'deny' },
  }),
  // Helmet 8 has no permissions-policy middleware, so the header is set here.
  // The API itself never asks the browser for a device capability.
  (_req: Request, res: Response, next: NextFunction) => {
    res.setHeader(
      'Permissions-Policy',
      'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
    );
    next();
  },
];

/**
 * Content-Security-Policy for the self-contained receipt print page: inline
 * styles and the small print button are part of that document, everything else
 * (scripts from the network, framing, form posts) stays disabled.
 */
export const RECEIPT_HTML_CSP = [
  "default-src 'none'",
  "img-src data:",
  "style-src 'unsafe-inline'",
  "script-src 'unsafe-inline'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
].join('; ');

export const corsOptions = {
  origin(origin: string | undefined, callback: (error: Error | null, allow?: boolean) => void) {
    if (!origin) {
      // Same-origin requests, server-to-server calls and PWA installs from a file context.
      callback(null, true);
      return;
    }
    if (isAllowedOrigin(origin)) {
      callback(null, true);
      return;
    }
    callback(null, false);
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
    if (!isAllowedOrigin(origin)) {
      logger.warn('[security] rejected untrusted request origin', {
        method: req.method,
        path: req.path,
        origin,
      });
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
    partitioned: isProduction,
    path: '/',
    maxAge: maxAgeMs,
  };
}

export function csrfCookieOptions(maxAgeMs: number): CookieOptions {
  return {
    httpOnly: false, // must be readable by the client to echo it back in the header
    sameSite: isProduction ? 'none' : 'lax',
    secure: isProduction ? true : false,
    partitioned: isProduction,
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
  const cookies = req.cookies as Record<string, string> | undefined;
  if (req.path.endsWith('/refresh') && !cookies?.[REFRESH_COOKIE]) {
    next();
    return;
  }
  const headerToken = req.headers['x-csrf-token'];
  const cookieToken = cookies?.[CSRF_COOKIE];
  const rejectMismatch = () => {
    logger.warn('[security] rejected mismatched CSRF state', {
      path: req.path,
      origin: req.headers.origin ?? null,
      refreshCookiePresent: Boolean(cookies?.[REFRESH_COOKIE]),
      csrfCookiePresent: Boolean(cookieToken),
      csrfHeaderPresent: typeof headerToken === 'string',
    });
    next(new AppError(403, 'CSRF_MISMATCH', 'Refresh protection needs to be resynchronized.'));
  };
  if (!cookieToken) {
    if (req.path.endsWith('/refresh')) {
      rejectMismatch();
      return;
    }
    next();
    return;
  }
  if (typeof headerToken !== 'string' || headerToken !== cookieToken) {
    rejectMismatch();
    return;
  }
  next();
};