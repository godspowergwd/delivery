import type { Role } from '@delivery/shared';

export function canViewCatalogProduct(
  product: { isArchived: boolean; isAvailable: boolean },
  role: Role | undefined,
): boolean {
  if (role === 'ADMIN' || role === 'KITCHEN') return true;
  return !product.isArchived && product.isAvailable;
}