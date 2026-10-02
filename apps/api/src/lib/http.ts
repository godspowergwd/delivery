import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { Paginated } from '@delivery/shared';

type AsyncHandler = (req: Request, res: Response, next: NextFunction) => Promise<unknown> | unknown;

/** Forwards rejected promises into the Express error pipeline. */
export const asyncHandler =
  (handler: AsyncHandler): RequestHandler =>
  (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };

export interface PageMeta {
  page: number;
  pageSize: number;
  skip: number;
  take: number;
}

export function paginateQuery(query: { page?: number; pageSize?: number }): PageMeta {
  const page = Math.max(1, query.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, query.pageSize ?? 20));
  return { page, pageSize, skip: (page - 1) * pageSize, take: pageSize };
}

export function paginate<T>(items: T[], total: number, meta: PageMeta): Paginated<T> {
  const pageCount = meta.pageSize > 0 ? Math.ceil(total / meta.pageSize) : 0;
  return {
    items,
    total,
    page: meta.page,
    pageSize: meta.pageSize,
    pageCount,
    hasMore: meta.page < pageCount,
  };
}

/** Absolute URL for a stored upload (falls back to the raw value when it is already absolute). */
export function absoluteUrl(value: string | null | undefined, baseUrl: string): string | null {
  if (!value) return null;
  if (/^https?:\/\//i.test(value) || value.startsWith('data:')) return value;
  return `${baseUrl.replace(/\/$/, '')}${value.startsWith('/') ? value : `/${value}`}`;
}

/**
 * Best-effort client identity for audit logs.
 *
 * `req.ip` is derived by Express from the configured trust-proxy hop count, so it
 * is the very same value the rate limiters key on and can never be a raw header
 * a client made up. Anything IPv4-mapped (`::ffff:1.2.3.4`) is normalised.
 */
export function clientIp(req: Request): string | undefined {
  const raw = req.ip ?? req.socket?.remoteAddress ?? undefined;
  if (!raw) return undefined;
  return raw.startsWith('::ffff:') ? raw.slice(7) : raw;
}
