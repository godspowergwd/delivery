import { describe, expect, it } from 'vitest';
import { canViewCatalogProduct } from './product-access.service';

describe('catalog product visibility', () => {
  it('allows public and customer reads only for active, available products', () => {
    expect(canViewCatalogProduct({ isArchived: false, isAvailable: true }, undefined)).toBe(true);
    expect(canViewCatalogProduct({ isArchived: false, isAvailable: true }, 'CUSTOMER')).toBe(true);
    expect(canViewCatalogProduct({ isArchived: true, isAvailable: true }, undefined)).toBe(false);
    expect(canViewCatalogProduct({ isArchived: false, isAvailable: false }, 'DRIVER')).toBe(false);
  });

  it('allows kitchen and admin to inspect archived or unavailable products', () => {
    const hidden = { isArchived: true, isAvailable: false };
    expect(canViewCatalogProduct(hidden, 'KITCHEN')).toBe(true);
    expect(canViewCatalogProduct(hidden, 'ADMIN')).toBe(true);
  });
});