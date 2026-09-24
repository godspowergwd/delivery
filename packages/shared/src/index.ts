export * from './roles';
export * from './order-status';
export * from './money';
export * from './format';
export * from './geo';
export * from './tracking';
export * from './types';
export * from './realtime';

/** Human readable constants reused by API validation messages and UI copy. */
export const APP_NAME = 'Maame’s Waakye App';
export const APP_TAGLINE = 'Hot waakye, delivered around Malam & Gbawe.';
export const SUPPORTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/avif'];
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;