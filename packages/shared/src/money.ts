/** Money is stored and calculated in minor units (cents/pesewas) to avoid float drift. */

export const PAYMENT_METHODS = ['CASH', 'MOBILE_MONEY'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  CASH: 'Cash on delivery',
  MOBILE_MONEY: 'Mobile Money',
};

export const PAYMENT_STATUSES = ['PENDING', 'PAID', 'FAILED', 'REFUNDED'] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  PENDING: 'Payment pending',
  PAID: 'Paid',
  FAILED: 'Payment failed',
  REFUNDED: 'Refunded',
};

export function toCents(amount: number | string): number {
  const value = typeof amount === 'string' ? Number.parseFloat(amount) : amount;
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 100);
}

export function fromCents(cents: number): number {
  return Math.round(cents) / 100;
}

/** Round a money amount to 2 decimals (used when persisting to Decimal columns). */
export function roundMoney(amount: number): number {
  return fromCents(toCents(amount));
}

export interface PricingInput {
  items: Array<{ unitPrice: number; quantity: number }>;
  deliveryFee: number;
  taxRate: number;
  discount?: number;
}

export interface PricingResult {
  subtotal: number;
  deliveryFee: number;
  tax: number;
  discount: number;
  total: number;
  itemCount: number;
}

/**
 * Authoritative pricing calculation. The API recomputes every order with this
 * function so the client can never influence the amount that is charged.
 */
export function computeTotals(input: PricingInput): PricingResult {
  const itemCount = input.items.reduce((sum, item) => sum + item.quantity, 0);
  const subtotalCents = input.items.reduce(
    (sum, item) => sum + toCents(item.unitPrice) * item.quantity,
    0,
  );
  const deliveryFeeCents = itemCount > 0 ? toCents(input.deliveryFee) : 0;
  const discountCents = Math.max(0, Math.min(toCents(input.discount ?? 0), subtotalCents));
  const taxableCents = subtotalCents - discountCents + deliveryFeeCents;
  const taxCents = Math.round((taxableCents * input.taxRate) / 100);
  return {
    subtotal: fromCents(subtotalCents),
    deliveryFee: fromCents(deliveryFeeCents),
    tax: fromCents(taxCents),
    discount: fromCents(discountCents),
    total: fromCents(taxableCents + taxCents),
    itemCount,
  };
}

/** Percentage of incoming orders that were completed, rounded to 1 decimal. */
export function completionRate(total: number, delivered: number): number {
  if (total <= 0) return 0;
  return Math.round((delivered / total) * 1000) / 10;
}