import type { AuthUser, Role } from '@delivery/shared';
import { prisma } from '../lib/prisma';
import { badRequest, conflict, forbidden, unauthorized } from '../lib/errors';
import { generateTemporaryPassword, hashPassword, verifyPassword } from '../lib/password';
import {
  generateRefreshToken,
  hashToken,
  refreshTtlMs,
  signAccessToken,
} from '../lib/tokens';
import { logActivity } from './activity-log.service';
import { notifyUser } from './notification.service';
import { emitToRole } from '../realtime/socket';
import type { Request } from 'express';

type UserRow = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  role: Role;
  isActive: boolean;
  isProtected: boolean;
  avatarUrl: string | null;
  createdAt: Date;
  lastLoginAt: Date | null;
};

export function toAuthUser(user: UserRow): AuthUser {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    role: user.role,
    isActive: user.isActive,
    isProtected: user.isProtected,
    avatarUrl: user.avatarUrl,
    createdAt: user.createdAt.toISOString(),
    lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
  };
}

export interface SessionTokens {
  accessToken: string;
  refreshToken: string;
  csrfToken: string;
  sessionId: string;
  expiresAt: Date;
}

function randomCsrf(): string {
  return generateRefreshToken().token.slice(0, 32);
}

/** Creates a session row and the matching access/refresh token pair. */
export async function issueSession(
  user: UserRow,
  options: { rememberMe?: boolean; request?: Request } = {},
): Promise<SessionTokens> {
  const rememberMe = Boolean(options.rememberMe);
  const ttl = refreshTtlMs(rememberMe);
  const { token: refreshToken, hash } = generateRefreshToken();
  const csrfToken = randomCsrf();
  const expiresAt = new Date(Date.now() + ttl);

  const session = await prisma.session.create({
    data: {
      userId: user.id,
      refreshTokenHash: hash,
      rememberMe,
      expiresAt,
      userAgent: options.request?.headers['user-agent'] ?? null,
      ip: options.request?.ip ?? null,
    },
    select: { id: true },
  });

  const accessToken = signAccessToken({ sub: user.id, role: user.role, sessionId: session.id });

  return { accessToken, refreshToken, csrfToken, sessionId: session.id, expiresAt };
}

export interface RegisterInput {
  name: string;
  email: string;
  phone: string;
  password: string;
}

export async function registerCustomer(
  input: RegisterInput,
  request?: Request,
): Promise<{ user: AuthUser; tokens: SessionTokens }> {
  const existing = await prisma.user.findUnique({ where: { email: input.email } });
  if (existing) {
    throw conflict('An account with that email already exists. Try signing in instead.');
  }

  const user = await prisma.user.create({
    data: {
      name: input.name,
      email: input.email,
      phone: input.phone,
      passwordHash: await hashPassword(input.password),
      role: 'CUSTOMER',
    },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      role: true,
      isActive: true,
      isProtected: true,
      avatarUrl: true,
      createdAt: true,
      lastLoginAt: true,
    },
  });

  const tokens = await issueSession(user, { rememberMe: true, request });

  emitToRole('ADMIN', 'user:changed', { action: 'created', userId: user.id });
  emitToRole('ADMIN', 'analytics:refresh', {});

  await notifyUser(user.id, {
    title: 'Welcome aboard 🎉',
    body: 'Your account is ready. Browse the menu and place your first order.',
    type: 'SYSTEM',
    audience: 'CUSTOMER',
    link: '/app',
  });

  await logActivity({
    action: 'USER_REGISTERED',
    entity: 'User',
    entityId: user.id,
    description: `${user.name} created a customer account`,
    userId: user.id,
    actorEmail: user.email,
    actorRole: 'CUSTOMER',
    request: request ?? null,
  });

  return { user: toAuthUser(user), tokens };
}

export interface LoginInput {
  email: string;
  password: string;
  rememberMe?: boolean;
}

export async function login(
  input: LoginInput,
  request?: Request,
): Promise<{ user: AuthUser; tokens: SessionTokens }> {
  const user = await prisma.user.findUnique({ where: { email: input.email } });
  if (!user) {
    throw unauthorized('That email and password combination is not correct.');
  }
  const valid = await verifyPassword(input.password, user.passwordHash);
  if (!valid) {
    await logActivity({
      action: 'LOGIN_FAILED',
      entity: 'User',
      entityId: user.id,
      description: `Failed sign-in for ${user.email}`,
      actorEmail: user.email,
      actorRole: user.role,
      request: request ?? null,
    });
    throw unauthorized('That email and password combination is not correct.');
  }
  if (!user.isActive) {
    throw forbidden('This account has been disabled. Please contact an administrator.');
  }

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      role: true,
      isActive: true,
      isProtected: true,
      avatarUrl: true,
      createdAt: true,
      lastLoginAt: true,
    },
  });

  const tokens = await issueSession(updated, { rememberMe: input.rememberMe, request });

  await logActivity({
    action: 'LOGIN',
    entity: 'User',
    entityId: user.id,
    description: `${user.name} signed in`,
    userId: user.id,
    actorEmail: user.email,
    actorRole: user.role,
    request: request ?? null,
  });

  return { user: toAuthUser(updated), tokens };
}

const SESSION_USER_SELECT = {
  id: true,
  name: true,
  email: true,
  phone: true,
  role: true,
  isActive: true,
  isProtected: true,
  avatarUrl: true,
  createdAt: true,
  lastLoginAt: true,
} as const;

/** Rotates the refresh token: the used token is revoked and a fresh pair is issued. */
export async function refreshSession(
  refreshToken: string,
  request?: Request,
): Promise<{ user: AuthUser; tokens: SessionTokens }> {
  const session = await prisma.session.findUnique({
    where: { refreshTokenHash: hashToken(refreshToken) },
    include: { user: { select: SESSION_USER_SELECT } },
  });

  if (!session || session.revokedAt || session.expiresAt.getTime() < Date.now()) {
    throw unauthorized('Your session has expired. Please sign in again.');
  }
  if (!session.user.isActive) {
    throw forbidden('This account has been disabled. Please contact an administrator.');
  }

  await prisma.session.update({
    where: { id: session.id },
    data: { revokedAt: new Date(), lastUsedAt: new Date() },
  });

  const tokens = await issueSession(session.user, { rememberMe: session.rememberMe, request });
  return { user: toAuthUser(session.user), tokens };
}

export async function logout(options: {
  refreshToken?: string | null;
  sessionId?: string | null;
  request?: Request;
  userId?: string | null;
  email?: string | null;
  role?: Role | null;
}): Promise<void> {
  const where = options.sessionId
    ? { id: options.sessionId }
    : options.refreshToken
      ? { refreshTokenHash: hashToken(options.refreshToken) }
      : null;
  if (!where) return;

  await prisma.session.updateMany({
    where: { ...where, revokedAt: null },
    data: { revokedAt: new Date() },
  });

  await logActivity({
    action: 'LOGOUT',
    entity: 'User',
    entityId: options.userId ?? null,
    description: 'Session ended',
    userId: options.userId ?? null,
    actorEmail: options.email ?? null,
    actorRole: options.role ?? null,
    request: options.request ?? null,
  });
}

export async function logoutAllSessions(userId: string, request?: Request): Promise<number> {
  const result = await prisma.session.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  await logActivity({
    action: 'LOGOUT_ALL',
    entity: 'User',
    entityId: userId,
    description: `Signed out of ${result.count} device(s)`,
    userId,
    request: request ?? null,
  });
  return result.count;
}
export interface SessionSummary {
  id: string;
  userAgent: string | null;
  ip: string | null;
  rememberMe: boolean;
  createdAt: string;
  lastUsedAt: string;
  expiresAt: string;
  current: boolean;
}

export async function listSessions(
  userId: string,
  currentSessionId: string,
): Promise<SessionSummary[]> {
  const sessions = await prisma.session.findMany({
    where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { lastUsedAt: 'desc' },
  });
  return sessions.map((session) => ({
    id: session.id,
    userAgent: session.userAgent,
    ip: session.ip,
    rememberMe: session.rememberMe,
    createdAt: session.createdAt.toISOString(),
    lastUsedAt: session.lastUsedAt.toISOString(),
    expiresAt: session.expiresAt.toISOString(),
    current: session.id === currentSessionId,
  }));
}

export async function revokeSession(userId: string, sessionId: string): Promise<void> {
  const result = await prisma.session.updateMany({
    where: { id: sessionId, userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  if (result.count === 0) throw badRequest('That session is no longer active.');
}

export async function changePassword(
  userId: string,
  currentPassword: string,
  newPassword: string,
  currentSessionId?: string,
): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { passwordHash: true, email: true, role: true, name: true },
  });
  if (!user) throw unauthorized('Account not found.');

  const valid = await verifyPassword(currentPassword, user.passwordHash);
  if (!valid) throw badRequest('Your current password is not correct.');

  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash: await hashPassword(newPassword) },
  });

  // All other devices are signed out after a password change.
  await prisma.session.updateMany({
    where: {
      userId,
      revokedAt: null,
      ...(currentSessionId ? { id: { not: currentSessionId } } : {}),
    },
    data: { revokedAt: new Date() },
  });

  await logActivity({
    action: 'PASSWORD_CHANGED',
    entity: 'User',
    entityId: userId,
    description: `${user.name} changed their password`,
    userId,
    actorEmail: user.email,
    actorRole: user.role,
  });
}

/** Admin flow: resets an account password and returns the new temporary secret. */
export async function resetUserPassword(
  targetUserId: string,
  actor: { id: string; email: string; role: Role },
  newPassword?: string,
): Promise<{ temporaryPassword: string }> {
  const target = await prisma.user.findUnique({ where: { id: targetUserId } });
  if (!target) throw unauthorized('Account not found.');
  if (target.isProtected && actor.id !== target.id) {
    throw forbidden('Protected owner accounts can only reset their own password.');
  }

  const temporaryPassword = newPassword ?? generateTemporaryPassword(12);
  await prisma.user.update({
    where: { id: targetUserId },
    data: { passwordHash: await hashPassword(temporaryPassword) },
  });
  await prisma.session.updateMany({
    where: { userId: targetUserId, revokedAt: null },
    data: { revokedAt: new Date() },
  });

  await notifyUser(targetUserId, {
    title: 'Password reset',
    body: 'An administrator reset your password. Sign in with the new password and change it.',
    type: 'SYSTEM',
    audience:
      target.role === 'CUSTOMER' ? 'CUSTOMER' : target.role === 'KITCHEN' ? 'KITCHEN' : 'ADMIN',
  });

  await logActivity({
    action: 'PASSWORD_RESET',
    entity: 'User',
    entityId: targetUserId,
    description: `Password reset for ${target.email}`,
    userId: actor.id,
    actorEmail: actor.email,
    actorRole: actor.role,
  });

  return { temporaryPassword };
}