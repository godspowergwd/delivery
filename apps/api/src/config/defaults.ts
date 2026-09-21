import type { SettingsDTO } from '@delivery/shared';

/**
 * Business configuration defaults.
 *
 * These values are only used when PostgreSQL has no stored value yet (fresh
 * database) or when a stored value cannot be parsed. They are deliberately
 * plain source constants instead of environment variables: business settings
 * live in the `Setting` table and are managed at runtime from
 * Admin > Settings, so changing the support phone never requires a redeploy.
 */
export const DEFAULT_SETTINGS: Omit<SettingsDTO, 'updatedAt'> = {
  businessName: 'Delivery System',
  businessAddress: '1 Market Street, Accra',
  businessPhone: '+233000000000',
  businessEmail: 'support@deliverysystem.app',
  currencyCode: 'GHS',
  // Escaped so the symbol survives any file encoding (GH + cedis sign).
  currencySymbol: 'GH\u20b5',
  deliveryFee: 8,
  taxRate: 2.5,
  minOrderTotal: 10,
  acceptingOrders: true,
  supportPhone: '+233000000000',
  supportEmail: 'support@deliverysystem.app',
  lowStockThreshold: 10,
};

/** Settings that may be read without authenticating (storefront + support contact). */
export const PUBLIC_SETTING_KEYS = [
  'businessName',
  'businessPhone',
  'currencyCode',
  'currencySymbol',
  'deliveryFee',
  'taxRate',
  'minOrderTotal',
  'acceptingOrders',
  'supportPhone',
  'supportEmail',
] as const satisfies ReadonlyArray<keyof Omit<SettingsDTO, 'updatedAt'>>;

/** The subset of settings every client (including anonymous storefront traffic) may read. */
export type PublicSettings = Pick<Omit<SettingsDTO, 'updatedAt'>, (typeof PUBLIC_SETTING_KEYS)[number]>;
