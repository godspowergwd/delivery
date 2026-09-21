import { z } from 'zod';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export const emailSchema = z
  .string()
  .trim()
  .min(5, 'Email is too short')
  .max(200, 'Email is too long')
  .regex(EMAIL_PATTERN, 'Enter a valid email address')
  .transform((value) => value.toLowerCase());

export const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(72, 'Password must be at most 72 characters');

export const phoneSchema = z
  .string()
  .trim()
  .min(7, 'Enter a valid phone number')
  .max(20, 'Enter a valid phone number')
  .regex(/^[+0-9()\-\s]+$/, 'Phone numbers can only contain digits, spaces and + - ( )');

export const nameSchema = z.string().trim().min(2, 'Name is too short').max(120, 'Name is too long');

export const idSchema = z.string().trim().min(1, 'A valid id is required');

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export const searchSchema = z.object({
  q: z.string().trim().max(120).optional(),
});

export const moneySchema = z.coerce.number().min(0, 'Amount cannot be negative').max(1_000_000);

export const percentSchema = z.coerce.number().min(0).max(100);

export const sortDirectionSchema = z.enum(['asc', 'desc']).default('desc');

/** Query-string boolean that understands "true"/"false"/"1"/"0" as well as real booleans. */
export const booleanQuery = z
  .union([z.boolean(), z.enum(['true', 'false', '1', '0'])])
  .transform((value) => value === true || value === 'true' || value === '1');

export const optionalBooleanQuery = booleanQuery.optional();

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

export const idParamSchema = z.object({ id: idSchema });

/** Turns a comma separated query string into a trimmed list. */
export const csvSchema = z
  .string()
  .optional()
  .transform((value) =>
    value
      ? value
          .split(',')
          .map((part) => part.trim())
          .filter(Boolean)
      : [],
  );

export function formatZodError(error: z.ZodError): Array<{ path: string; message: string }> {
  return error.issues.map((issue) => ({
    path: issue.path.length > 0 ? issue.path.join('.') : 'request',
    message: issue.message,
  }));
}
const USERNAME_PATTERN = /^[a-z0-9][a-z0-9._-]{2,31}$/;

/** Optional short sign-in name for staff accounts. Always stored lowercase. */
export const usernameSchema = z
  .string()
  .trim()
  .min(3, 'Username must be at least 3 characters')
  .max(32, 'Username must be at most 32 characters')
  .regex(USERNAME_PATTERN, 'Use letters, numbers, dots, dashes or underscores')
  .transform((value) => value.toLowerCase());

/**
 * Sign-in identifier: an email address or a username. Deliberately looser than
 * `emailSchema` so the very same login field can carry either form.
 */
export const loginIdentifierSchema = z
  .string()
  .trim()
  .min(3, 'Enter your email or username')
  .max(200, 'That value is too long')
  .transform((value) => value.toLowerCase());
