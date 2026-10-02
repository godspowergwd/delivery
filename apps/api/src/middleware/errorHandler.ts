import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { ZodError } from 'zod';
import { Prisma } from '@prisma/client';
import { AppError } from '../lib/errors';
import { formatZodError } from '../lib/validation';
import { logger } from '../lib/logger';
import { isProduction } from '../config/env';
import { clientIp } from '../lib/http';

interface ErrorBody {
  error: {
    code: string;
    message: string;
    details?: Array<{ path: string; message: string }>;
  };
}

function isZodError(error: unknown): error is ZodError {
  return (
    typeof error === 'object' &&
    error !== null &&
    'issues' in error &&
    Array.isArray((error as { issues?: unknown }).issues)
  );
}

export function notFoundHandler(req: Request, res: Response): void {
  const body: ErrorBody = {
    error: {
      code: 'NOT_FOUND',
      message: `No API route matches ${req.method} ${req.path}`,
    },
  };
  res.status(404).json(body);
}

export function errorHandler(
  error: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  const send = (status: number, body: ErrorBody) => {
    res.status(status).json(body);
  };

  if (error instanceof AppError) {
    // Authentication and authorization failures are security events: keep them
    // in the server log (with the caller identity) without leaking anything back.
    if (error.statusCode === 401 || error.statusCode === 403) {
      logger.warn('[security] request denied', {
        status: error.statusCode,
        code: error.code,
        method: req.method,
        path: req.originalUrl.split('?')[0],
        ip: clientIp(req),
        userId: (req as { auth?: { user?: { id?: string; role?: string } } }).auth?.user?.id ?? null,
        role: (req as { auth?: { user?: { id?: string; role?: string } } }).auth?.user?.role ?? null,
      });
    }
    send(error.statusCode, {
      error: { code: error.code, message: error.message, details: error.details },
    });
    return;
  }

  if (isZodError(error)) {
    send(400, {
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Please correct the highlighted fields and try again.',
        details: formatZodError(error),
      },
    });
    return;
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === 'P2002') {
      const target = Array.isArray(error.meta?.target)
        ? (error.meta?.target as string[]).join(', ')
        : 'value';
      send(409, {
        error: {
          code: 'DUPLICATE',
          message: `That ${target} is already in use. Please choose another one.`,
        },
      });
      return;
    }
    if (error.code === 'P2025') {
      send(404, { error: { code: 'NOT_FOUND', message: 'The requested record no longer exists.' } });
      return;
    }
    if (error.code === 'P2003') {
      send(409, {
        error: {
          code: 'RELATION_CONFLICT',
          message: 'This record is still referenced by other data and cannot be changed.',
        },
      });
      return;
    }
    logger.warn(`Prisma error ${error.code} on ${req.method} ${req.path}`, {
      code: error.code,
    });
    send(400, {
      error: { code: 'DATABASE_ERROR', message: 'The database rejected that request.' },
    });
    return;
  }

  if (error instanceof Prisma.PrismaClientInitializationError) {
    logger.error('Database connection failed', { errorType: error.name });
    send(503, {
      error: {
        code: 'DATABASE_UNAVAILABLE',
        message: 'The database is unavailable. Start it with "npm run db:up" and try again.',
      },
    });
    return;
  }

  if (error instanceof SyntaxError && 'body' in error) {
    send(400, {
      error: { code: 'INVALID_JSON', message: 'The request body contains invalid JSON.' },
    });
    return;
  }

  // Multer upload failures (file too large, too many files, unexpected field).
  if (typeof error === 'object' && error !== null && (error as { name?: string }).name === 'MulterError') {
    const multerCode = (error as { code?: string }).code ?? 'UPLOAD_FAILED';
    const message =
      multerCode === 'LIMIT_FILE_SIZE'
        ? 'That image is larger than the 5 MB limit.'
        : multerCode === 'LIMIT_UNEXPECTED_FILE'
          ? 'Unexpected upload field. Use the "file" field for images.'
          : 'The image could not be uploaded. Please try again.';
    send(400, { error: { code: multerCode, message } });
    return;
  }

  const message = error instanceof Error ? error.message : 'Unexpected error';
  logger.error(`Unhandled error on ${req.method} ${req.path}`, {
    errorType: error instanceof Error ? error.name : 'UnknownError',
    ip: clientIp(req),
    ...(!isProduction && error instanceof Error
      ? { diagnostic: error.message, stack: error.stack }
      : {}),
  });
  send(500, {
    error: {
      code: 'INTERNAL_ERROR',
      message: isProduction
        ? 'Something went wrong on our side. Please try again.'
        : message,
    },
  });
}