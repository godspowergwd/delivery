import type { SettingsDTO } from '@delivery/shared';
import { env } from '../config/env';
import { prisma } from '../lib/prisma';

type SettingKey = keyof Omit<SettingsDTO, 'updatedAt'>;

const DEFAULTS: Omit<SettingsDTO, 'updatedAt'> = {
  businessName: env.BUSINESS_NAME,
  businessAddress: '1 Market Street, Accra',
  businessPhone: env.SUPPORT_PHONE,
  businessEmail: env.SUPPORT_EMAIL,
  currencyCode: env.CURRENCY_CODE,
  currencySymbol: env.CURRENCY_SYMBOL,
  deliveryFee: env.DELIVERY_FEE,
  taxRate: env.TAX_RATE,
  minOrderTotal: env.MIN_ORDER_TOTAL,
  acceptingOrders: true,
  supportPhone: env.SUPPORT_PHONE,
  supportEmail: env.SUPPORT_EMAIL,
  lowStockThreshold: 10,
};

const NUMERIC_KEYS: SettingKey[] = ['deliveryFee', 'taxRate', 'minOrderTotal', 'lowStockThreshold'];
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

  for (const [key, value] of entries) {
    await prisma.setting.upsert({
      where: { key },
      create: { key, value: value as never, updatedById: updatedById ?? null },
      update: { value: value as never, updatedById: updatedById ?? null },
    });
  }
  invalidateSettingsCache();
  return getSettings();
}

export const defaultSettings = DEFAULTS;