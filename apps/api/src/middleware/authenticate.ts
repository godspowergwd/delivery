import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { Role } from '@delivery/shared';
import { prisma } from '../lib/prisma';
import { forbidden, unauthorized } from '../lib/errors';
import { verifyAccessToken } from '../lib/tokens';

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  role: Role;
  isActive: boolean;
  isProtected: boolean;
  avatarUrl: string | null;
}

export interface AuthContext {
  user: SessionUser;
  sessionId: string;
}

export type AuthedRequest = Request & { auth?: AuthContext };

export function getAuth(req: Request): AuthContext {
  const auth = (req as AuthedRequest).auth;
  if (!auth) throw unauthorized();
  return auth;
}

export function getUser(req: Request): SessionUser {
  return getAuth(req).user;
}

/** Verifies the bearer token, re-checks the account and validates the session row. */
export const authenticate: RequestHandler = async (req, _res, next) => {
  try {
    const header = req.headers.authorization ?? '';
    if (!header.toLowerCase().startsWith('bearer ')) {
      throw unauthorized('Missing authentication token.');
    }
    const token = header.slice(7).trim();
    if (!token) throw unauthorized('Missing authentication token.');

    const payload = verifyAccessToken(token);
    const session = await prisma.session.findUnique({
      where: { id: payload.sessionId },
      select: { id: true, revokedAt: true, expiresAt: true, userId: true },
    });
    if (!session || session.revokedAt || session.expiresAt.getTime() < Date.now()) {
      throw unauthorized('Your session has expired. Please sign in again.');
    }
    if (session.userId !== payload.sub) {
      throw unauthorized('Your session is no longer valid. Please sign in again.');
    }

    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        role: true,
        isActive: true,
        isProtected: true,
        avatarUrl: true,
      },
    });
    if (!user) throw unauthorized('Account not found.');
    if (!user.isActive) throw forbidden('Your account has been disabled. Contact support.');

    (req as AuthedRequest).auth = { user: user as SessionUser, sessionId: session.id };
    next();
  } catch (error) {
    next(error);
  }
};

export const optionalAuthenticate: RequestHandler = async (req, _res, next) => {
  const header = req.headers.authorization ?? '';
  if (!header.toLowerCase().startsWith('bearer ')) {
    next();
    return;
  }
  await authenticate(req, _res, next);
};

export const requireRole =
  (...roles: Role[]): RequestHandler =>
  (req, _res, next) => {
    try {
      const { user } = getAuth(req);
      if (!roles.includes(user.role)) {
        throw forbidden(`This action is limited to: ${roles.join(', ')}.`);
      }
      next();
    } catch (error) {
      next(error);
    }
  };

export const requireKitchenOrAdmin = requireRole('KITCHEN', 'ADMIN');
export const requireAdmin = requireRole('ADMIN');
export const requireCustomer = requireRole('CUSTOMER');
