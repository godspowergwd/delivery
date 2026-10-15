import type { Prisma } from '@prisma/client';
import type { ProductCustomizationOption } from '@delivery/shared';
import { badRequest } from '../lib/errors';

function isObject(value: Prisma.JsonValue): value is Prisma.JsonObject {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function parseCustomizationOptions(
  value: Prisma.JsonValue | null,
): ProductCustomizationOption[] {
  if (value === null) return [];
  if (!Array.isArray(value)) throw new Error('Product customization options must be an array.');

  return value.map((entry) => {
    if (!isObject(entry)) throw new Error('A product customization option group is invalid.');
    const { id, label, options, required, maxSelections } = entry;
    if (
      typeof id !== 'string' ||
      typeof label !== 'string' ||
      !Array.isArray(options) ||
      !options.every((option) => typeof option === 'string') ||
      typeof required !== 'boolean' ||
      typeof maxSelections !== 'number' ||
      !Number.isInteger(maxSelections) ||
      maxSelections < 1 ||
      maxSelections > options.length
    ) {
      throw new Error('A product customization option group is invalid.');
    }
    return { id, label, options, required, maxSelections };
  });
}

export function validateCustomizationChoices(
  groups: ProductCustomizationOption[],
  choices: Record<string, string[]> | undefined,
): string[] {
  const selected: string[] = [];
  const submitted = choices ?? {};
  const allowedGroupIds = new Set(groups.map((group) => group.id));

  if (Object.keys(submitted).some((id) => !allowedGroupIds.has(id))) {
    throw badRequest('This product has an invalid customization selection.');
  }

  for (const group of groups) {
    const values = submitted[group.id] ?? [];
    if (
      values.length > group.maxSelections ||
      new Set(values).size !== values.length ||
      values.some((value) => !group.options.includes(value)) ||
      (group.required && values.length === 0)
    ) {
      throw badRequest(`Choose ${group.label} for this product.`);
    }
    if (values.length > 0) selected.push(`${group.label}: ${values.join(', ')}`);
  }

  return selected;
}

export function assertProductHasConfiguredPrice(price: number, name: string): void {
  if (!Number.isFinite(price) || price <= 0) {
    throw badRequest(`${name} does not have a configured price and cannot be ordered yet.`);
  }
}
