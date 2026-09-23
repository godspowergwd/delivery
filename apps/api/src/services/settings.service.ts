import type { SettingsDTO } from '@delivery/shared';
import { DEFAULT_SETTINGS, PUBLIC_SETTING_KEYS, type PublicSettings } from '../config/defaults';
import { prisma } from '../lib/prisma';

type SettingKey = keyof Omit<SettingsDTO, 'updatedAt'>;

/**
 * Business configuration is always read from PostgreSQL; these constants are the
 * fallback for values that have never been stored. Nothing here (and in
 * particular no support phone number) comes from the environment, so contact
 * details can change from Admin > Settings without a redeploy.
 */
const DEFAULTS: Omit<SettingsDTO, 'updatedAt'> = { ...DEFAULT_SETTINGS };

const NUMERIC_KEYS: SettingKey[] = [
  'deliveryFee',
  'taxRate',
  'minOrderTotal',
  'lowStockThreshold',
  'businessLatitude',
  'businessLongitude',
  'deliveryRadiusKm',
];
const BOOLEAN_KEYS: SettingKey[] = ['acceptingOrders'];

/** Short-lived cache so pricing does not hit the database on every request. */
let cache: { value: SettingsDTO; expiresAt: number } | null = null;
const CACHE_TTL_MS = 15_000;

function coerce(key: SettingKey, value: unknown): string | number | boolean {
  if (NUMERIC_KEYS.includes(key)) {
    const parsed = typeof value === 'number' ? value : Number.parseFloat(String(value));
    return Number.isFinite(parsed) ? parsed : (DEFAULTS[key] as number);
  }
  if (BOOLEAN_KEYS.includes(key)) {
    if (typeof value === 'boolean') return value;
    return String(value).toLowerCase() === 'true' || String(value) === '1';
  }
  if (value === null || value === undefined) return DEFAULTS[key] as string;
  return String(value);
}

export function invalidateSettingsCache(): void {
  cache = null;
}

export async function getSettings(): Promise<SettingsDTO> {
  if (cache && cache.expiresAt > Date.now()) return cache.value;

  const rows = await prisma.setting.findMany({ select: { key: true, value: true, updatedAt: true } });
  const merged: Omit<SettingsDTO, 'updatedAt'> = { ...DEFAULTS };
  let updatedAt: Date | null = null;

  for (const row of rows) {
    const key = row.key as SettingKey;
    if (!(key in merged)) continue;
    const record = merged as Record<string, unknown>;
    record[key] = coerce(key, row.value as unknown);
    if (!updatedAt || row.updatedAt > updatedAt) updatedAt = row.updatedAt;
  }

  const value: SettingsDTO = { ...merged, updatedAt: updatedAt ? updatedAt.toISOString() : null };
  cache = { value, expiresAt: Date.now() + CACHE_TTL_MS };
  return value;
}

export async function updateSettings(
  patch: Partial<Omit<SettingsDTO, 'updatedAt'>>,
  updatedById?: string | null,
): Promise<SettingsDTO> {
  const entries = Object.entries(patch).filter(([key, value]) => value !== undefined && key in DEFAULTS);
  if (entries.length === 0) return getSettings();

  // One batched transaction instead of one round-trip per changed field, with a
  // generous timeout so a slow pooled connection cannot abort a full settings save.
  await prisma.$transaction(
    entries.map(([key, value]) =>
      prisma.setting.upsert({
        where: { key },
        create: { key, value: value as never, updatedById: updatedById ?? null },
        update: { value: value as never, updatedById: updatedById ?? null },
      }),
    ),
    { maxWait: 15_000, timeout: 30_000 },
  );
  invalidateSettingsCache();
  return getSettings();
}

/** Projects the full settings document down to the publicly readable fields. */
export function toPublicSettings(settings: SettingsDTO): PublicSettings {
  const source = settings as unknown as Record<string, unknown>;
  const projected: Record<string, unknown> = {};
  for (const key of PUBLIC_SETTING_KEYS) projected[key] = source[key];
  return projected as PublicSettings;
}

/**
 * The settings anyone may read: storefront pricing/currency plus the support
 * contact block, with the timestamp of the latest change so a client can display
 * "support number updated ..." without extra requests.
 */
export async function getPublicSettings(): Promise<PublicSettings & { updatedAt: string | null }> {
  const settings = await getSettings();
  return { ...toPublicSettings(settings), updatedAt: settings.updatedAt };
}

export const defaultSettings = DEFAULTS;