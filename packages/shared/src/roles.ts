/** Account types supported by the platform. */
export const ROLES = ['CUSTOMER', 'KITCHEN', 'DRIVER', 'ADMIN'] as const;

export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  CUSTOMER: 'Customer',
  KITCHEN: 'Kitchen',
  DRIVER: 'Driver',
  ADMIN: 'Administrator',
};

/** Landing route for each role after authentication. */
export const ROLE_HOME: Record<Role, string> = {
  CUSTOMER: '/app/home',
  KITCHEN: '/kitchen',
  DRIVER: '/driver/deliveries',
  ADMIN: '/admin',
};

export function isRole(value: unknown): value is Role {
  return typeof value === 'string' && (ROLES as readonly string[]).includes(value);
}