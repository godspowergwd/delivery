import { describe, expect, it } from 'vitest';
import type { Prisma } from '@prisma/client';
import { WAAKYE_MENU_PRODUCTS } from '../../prisma/menu-catalog';
import {
  assertProductHasConfiguredPrice,
  parseCustomizationOptions,
  validateCustomizationChoices,
} from './product-customization';

const choices = [
  {
    id: 'protein',
    label: 'Protein',
    options: ['Fish', 'Meat'],
    required: true,
    maxSelections: 1,
  },
  {
    id: 'side',
    label: 'Gari or salad',
    options: ['Gari', 'Salad'],
    required: true,
    maxSelections: 1,
  },
] satisfies Prisma.JsonArray;

describe('waakye pack customization', () => {
  it('defines exactly three fixed packs and ten unique, unpriced ingredients', () => {
    const packs = WAAKYE_MENU_PRODUCTS.filter((product) => product.productType === 'MEAL_PACK');
    const ingredients = WAAKYE_MENU_PRODUCTS.filter((product) => product.productType === 'INGREDIENT');

    expect(packs.map(({ name, description, price }) => ({ name, description, price }))).toEqual([
      {
        name: 'Premium Waakye Pack',
        description: 'Waakye, fish, meat, egg, wele, sausage, gari, macaroni salad, and plantain.',
        price: 100,
      },
      {
        name: 'Standard Waakye Pack',
        description: 'Waakye, choice of fish or meat, egg, wele, macaroni, gari, salad, and plantain.',
        price: 80,
      },
      {
        name: 'Basic Waakye Pack',
        description: 'Waakye, choice of fish or meat, macaroni, and choice of gari or salad.',
        price: 50,
      },
    ]);
    expect(ingredients.map((product) => product.name)).toEqual([
      'Waakye', 'Fish', 'Meat', 'Egg', 'Wele', 'Sausage', 'Gari', 'Macaroni', 'Salad', 'Plantain',
    ]);
    expect(new Set(WAAKYE_MENU_PRODUCTS.map((product) => product.menuKey)).size).toBe(13);
    expect(ingredients.every((product) => product.price === 0)).toBe(true);
  });

  it('accepts the configured fish/meat and gari/salad choices', () => {
    const groups = parseCustomizationOptions(choices);

    expect(validateCustomizationChoices(groups, { protein: ['Fish'], side: ['Salad'] })).toEqual([
      'Protein: Fish',
      'Gari or salad: Salad',
    ]);
  });

  it('rejects missing, unsupported, repeated, and excess selections', () => {
    const groups = parseCustomizationOptions(choices);

    expect(() => validateCustomizationChoices(groups, { protein: ['Fish'] })).toThrow('Choose Gari or salad');
    expect(() => validateCustomizationChoices(groups, { protein: ['Chicken'], side: ['Gari'] })).toThrow('Choose Protein');
    expect(() => validateCustomizationChoices(groups, { protein: ['Fish', 'Meat'], side: ['Gari'] })).toThrow('Choose Protein');
    expect(() => validateCustomizationChoices(groups, { protein: ['Fish'], side: ['Gari'], extra: ['Gari'] })).toThrow(
      'invalid customization selection',
    );
  });

  it('prevents sale of ingredients until a positive price is configured', () => {
    expect(() => assertProductHasConfiguredPrice(0, 'Fish')).toThrow('Fish does not have a configured price');
    expect(() => assertProductHasConfiguredPrice(-1, 'Fish')).toThrow('Fish does not have a configured price');
    expect(() => assertProductHasConfiguredPrice(12.5, 'Fish')).not.toThrow();
  });
});
