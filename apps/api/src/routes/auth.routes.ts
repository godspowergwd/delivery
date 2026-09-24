import { Router, type Response } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../lib/http';
import {
  emailSchema,
  idParamSchema,
  loginIdentifierSchema,
  nameSchema,
  passwordSchema,
  phoneSchema,
} from '../lib/validation';
import { authenticate, getAuth } from '../middleware/authenticate';
import { authLimiter } from '../middleware/rateLimit';
import {
  CSRF_COOKIE,
  REFRESH_COOKIE,
  csrfCookieOptions,
  csrfGuard,
  refreshCookieOptions,
} from '../middleware/security';
import { durationToMs, refreshTtlMs, verifyAccessToken } from '../lib/tokens';
import { env } from '../config/env';
import { unauthorized } from '../lib/errors';
import {
  changePassword,
  listSessions,
  login,
  logout,
  logoutAllSessions,
  refreshSession,
  registerCustomer,
  revokeSession,
  toAuthUser,
  type SessionTokens,
} from '../services/auth.service';
import { prisma } from '../lib/prisma';
import { getPublicSettings } from '../services/settings.service';

export const authRouter = Router();

const registerSchema = z.object({
  name: nameSchema,
  email: emailSchema,
  phone: phoneSchema,
  password: passwordSchema,
});

const loginSchema = z.object({
  // Accepts an email address or a username; the API resolves either form.
  email: loginIdentifierSchema,
  password: z.string().min(1, 'Enter your password'),
  rememberMe: z.boolean().optional().default(false),
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Enter your current password'),
  newPassword: passwordSchema,
});

/** Stores the rotating refresh token in an httpOnly cookie plus a CSRF companion cookie. */
function sendTokens(res: Response, tokens: SessionTokens): void {
  const maxAge = Math.max(tokens.expiresAt.getTime() - Date.now(), 60_000);
  res.cookie(REFRESH_COOKIE, tokens.refreshToken, refreshCookieOptions(maxAge));
  res.cookie(CSRF_COOKIE, tokens.csrfToken, csrfCookieOptions(maxAge));
}

function tokenResponse(user: unknown, tokens: SessionTokens) {
  return {
    user,
    accessToken: tokens.accessToken,
    csrfToken: tokens.csrfToken,
    expiresAt: tokens.expiresAt.toISOString(),
    sessionId: tokens.sessionId,
  };
}

/** POST /api/auth/register - customer self-registration. */
authRouter.post(
  '/register',
  authLimiter,
  asyncHandler(async (req, res) => {
    const input = registerSchema.parse(req.body);
    const { user, tokens } = await registerCustomer(input, req);
    sendTokens(res, tokens);
    res.status(201).json(tokenResponse(user, tokens));
  }),
);

/** POST /api/auth/login */
authRouter.post(
  '/login',
  authLimiter,
  asyncHandler(async (req, res) => {
    const input = loginSchema.parse(req.body);
    const { user, tokens } = await login(input, req);
    sendTokens(res, tokens);
    res.json(tokenResponse(user, tokens));
  }),
);

/** POST /api/auth/refresh - rotates the refresh cookie into a fresh session. */
authRouter.post(
  '/refresh',
  csrfGuard,
  asyncHandler(async (req, res) => {
    const token = (req.cookies as Record<string, string> | undefined)?.[REFRESH_COOKIE];
    if (!token) throw unauthorized('Your session has expired. Please sign in again.');
    const { user, tokens } = await refreshSession(token, req);
    sendTokens(res, tokens);
    res.json(tokenResponse(user, tokens));
  }),
);
authRouter.get(
  '/me',
  authenticate,
  asyncHandler(async (req, res) => {
    const auth = getAuth(req);
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: auth.user.id },
      select: {
        id: true,
        name: true,
        email: true,
        username: true,
        phone: true,
        role: true,
        isActive: true,
        isProtected: true,
        avatarUrl: true,
        createdAt: true,
        lastLoginAt: true,
      },
    });
    res.json({ user: toAuthUser(user), sessionId: auth.sessionId });
  }),
);

/** GET /api/auth/sessions - every active device for the signed-in account. */
authRouter.get(
  '/sessions',
  authenticate,
  asyncHandler(async (req, res) => {
    const { user, sessionId } = getAuth(req);
    res.json({ sessions: await listSessions(user.id, sessionId) });
  }),
);

/** DELETE /api/auth/sessions/:id */
authRouter.delete(
  '/sessions/:id',
  authenticate,
  asyncHandler(async (req, res) => {
    const { id } = idParamSchema.parse(req.params);
    const { user } = getAuth(req);
    await revokeSession(user.id, id);
    res.json({ success: true });
  }),
);

/** POST /api/auth/logout-all */
authRouter.post(
  '/logout-all',
  authenticate,
  asyncHandler(async (req, res) => {
    const { user } = getAuth(req);
    const revoked = await logoutAllSessions(user.id, req);
    res.clearCookie(REFRESH_COOKIE, { path: '/' });
    res.clearCookie(CSRF_COOKIE, { path: '/' });
    res.json({ success: true, revoked });
  }),
);

/** POST /api/auth/logout */
authRouter.post(
  '/logout',
  csrfGuard,
  asyncHandler(async (req, res) => {
    const refreshToken = (req.cookies as Record<string, string> | undefined)?.[REFRESH_COOKIE];
    const header = req.headers.authorization ?? '';

    let userId: string | null = null;
    let email: string | null = null;
    let role = null;
    let sessionId: string | null = null;

    // The verified access token already carries the identity, so no database read
    // is needed before revoking the session: sign-out returns immediately.
    if (header.toLowerCase().startsWith('bearer ')) {
      try {
        const payload = verifyAccessToken(header.slice(7).trim());
        sessionId = payload.sessionId;
        userId = payload.sub;
        email = payload.email ?? null;
        role = payload.role;
      } catch {
        // An expired access token must never block signing out.
      }
    }

    await logout({ refreshToken, sessionId, request: req, userId, email, role });
    res.clearCookie(REFRESH_COOKIE, { path: '/' });
    res.clearCookie(CSRF_COOKIE, { path: '/' });
    res.json({ success: true });
  }),
);

/** POST /api/auth/password - change the signed-in user's password. */
authRouter.post(
  '/password',
  authenticate,
  asyncHandler(async (req, res) => {
    const input = changePasswordSchema.parse(req.body);
    const { user, sessionId } = getAuth(req);
    await changePassword(user.id, input.currentPassword, input.newPassword, sessionId);
    res.json({ success: true });
  }),
);

/**
 * GET /api/auth/config - public bootstrap payload for the client. Business and
 * support details come from PostgreSQL (Admin > Settings), so a changed support
 * phone is visible to clients without a redeploy.
 */
authRouter.get(
  '/config',
  asyncHandler(async (_req, res) => {
    const settings = await getPublicSettings();
    res.json({
      accessTokenTtlMs: durationToMs(env.JWT_ACCESS_TTL, 12 * 3_600_000),
      rememberTtlMs: refreshTtlMs(true),
      appName: settings.businessName,
      supportPhone: settings.supportPhone,
      supportEmail: settings.supportEmail,
      settingsUpdatedAt: settings.updatedAt,
    });
  }),
);