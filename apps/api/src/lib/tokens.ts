import crypto from 'node:crypto';
import jwt, { type SignOptions } from 'jsonwebtoken';
import type { Role } from '@delivery/shared';
import { env } from '../config/env';
import { unauthorized } from './errors';

export interface AccessTokenPayload {
  sub: string;
  role: Role;
  sessionId: string;
  type: 'access';
}

/** Parses "30m", "12h", "90d" (also plain seconds) into milliseconds. */
export function durationToMs(value: string, fallbackMs: number): number {
  const match = /^(\d+)\s*(ms|s|m|h|d|w)?$/i.exec(value.trim());
  if (!match) return fallbackMs;
  const amount = Number.parseInt(match[1], 10);
  const unit = (match[2] ?? 's').toLowerCase();
  const multipliers: Record<string, number> = {
    ms: 1,
    s: 1000,
    m: 60_000,
    h: 3_600_000,
    d: 86_400_000,
    w: 604_800_000,
  };
  return amount * (multipliers[unit] ?? 1000);
}

export const accessTokenTtlMs = durationToMs(env.JWT_ACCESS_TTL, 30 * 60_000);

export function signAccessToken(payload: Omit<AccessTokenPayload, 'type'>): string {
  return jwt.sign({ ...payload, type: 'access' }, env.JWT_SECRET, {
    expiresIn: env.JWT_ACCESS_TTL as SignOptions['expiresIn'],
  });
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  try {
    const decoded = jwt.verify(token, env.JWT_SECRET) as AccessTokenPayload;
    if (decoded.type !== 'access' || !decoded.sub || !decoded.sessionId) {
      throw unauthorized('Your session is no longer valid. Please sign in again.');
    }
    return decoded;
  } catch {
    throw unauthorized('Your session has expired. Please sign in again.');
  }
}

/** Opaque refresh token - only its SHA-256 hash is stored in the database. */
export function generateRefreshToken(): { token: string; hash: string } {
  const token = crypto.randomBytes(48).toString('base64url');
  return { token, hash: hashToken(token) };
}

export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function randomCode(length = 10): string {
  return crypto.randomBytes(length).toString('hex').slice(0, length).toUpperCase();
}

export function refreshTtlMs(rememberMe: boolean): number {
  return rememberMe
    ? durationToMs(env.JWT_REMEMBER_TTL, 90 * 86_400_000)
    : durationToMs(env.JWT_REFRESH_TTL, 30 * 86_400_000);
}