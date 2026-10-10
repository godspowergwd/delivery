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
  businessName: 'Waakye App',
  businessAddress: 'Onyx Lounge, Gbawe, Accra, Ghana',
  businessPhone: '+233000000000',
  businessEmail: 'support@waakyeapp.com',
  currencyCode: 'GHS',
  // Escaped so the symbol survives any file encoding (GH + cedis sign).
  currencySymbol: 'GH\u20b5',
  // Adjustable starting rates, not a claim to reproduce Bolt's private fare model.
  deliveryBaseFee: 4,
  deliveryMinimumFee: 9,
  deliveryPerKmRate: 2,
  longDistanceWarningText:
    'This is a long-distance delivery route. The delivery charge may be significantly higher because of the road distance. Please review the quoted fee before confirming.',
  taxRate: 2.5,
  minOrderTotal: 10,
  acceptingOrders: true,
  // Restaurant open/close audit trail: written by the Kitchen every time the
  // status toggle is pressed (Kitchen > Settings > Restaurant Status).
  restaurantStatusChangedAt: '',
  restaurantStatusChangedBy: '',
  supportPhone: '+233000000000',
  supportEmail: 'support@waakyeapp.com',
  lowStockThreshold: 10,
  // Verified Onyx Lounge origin supplied by the business; admins can update it
  // from Admin > Settings. Used for routing and driver navigation.
  businessLatitude: 5.5789596,
  businessLongitude: -0.295258,
  // Long-distance warning threshold only; all valid routes remain orderable.
  deliveryRadiusKm: 12,
  // Admin-controlled checkout methods (Admin > Settings > Payments).
  momoEnabled: true,
  cashEnabled: true,
  momoNumber: '',
  momoAccountName: '',
  momoInstructions:
    'Send the exact order total to the MoMo number below, then place your order. Your order will be verified before dispatch.',
};

/** Settings that may be read without authenticating (storefront + support contact). */
export const PUBLIC_SETTING_KEYS = [
  'businessName',
  'businessPhone',
  'currencyCode',
  'currencySymbol',
  'deliveryBaseFee',
  'deliveryMinimumFee',
  'deliveryPerKmRate',
  'taxRate',
  'minOrderTotal',
  'acceptingOrders',
  'restaurantStatusChangedAt',
  'restaurantStatusChangedBy',
  'supportPhone',
  'supportEmail',
  'deliveryRadiusKm',
  // Checkout needs to know which methods are enabled + where to send MoMo.
  // Never expose anything else sensitive here.
  'momoEnabled',
  'cashEnabled',
  'momoNumber',
  'momoAccountName',
  'momoInstructions',
] as const satisfies ReadonlyArray<keyof Omit<SettingsDTO, 'updatedAt'>>;

/** The subset of settings every client (including anonymous storefront traffic) may read. */
export type PublicSettings = Pick<Omit<SettingsDTO, 'updatedAt'>, (typeof PUBLIC_SETTING_KEYS)[number]>;
