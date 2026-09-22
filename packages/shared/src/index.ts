export * from './roles';
export * from './order-status';
export * from './money';
export * from './format';
export * from './geo';
export * from './tracking';
export * from './types';
export * from './realtime';

/** Human readable constants reused by API validation messages and UI copy. */
export const APP_NAME = 'Delivery System';
export const APP_TAGLINE = 'Fresh food, delivered fast.';
export const SUPPORTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/avif'];
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;