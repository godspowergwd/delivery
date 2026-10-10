import { describe, expect, it } from 'vitest';
import { assertCanDispatchOrder, allowedKitchenTransitions } from './order.service';

describe('delivery and payment workflow', () => {
  it('does not let kitchen transitions dispatch orders', () => {
    expect(allowedKitchenTransitions('PREPARING')).not.toContain('OUT_FOR_DELIVERY');
    expect(allowedKitchenTransitions('READY')).not.toContain('OUT_FOR_DELIVERY');
  });

  it('blocks MoMo dispatch until payment is verified', () => {
    expect(() =>
      assertCanDispatchOrder({ paymentMethod: 'MOBILE_MONEY', paymentStatus: 'PENDING' }),
    ).toThrow(/verified before dispatch/i);
    expect(() =>
      assertCanDispatchOrder({ paymentMethod: 'MOBILE_MONEY', paymentStatus: 'PAID' }),
    ).not.toThrow();
  });

  it('does not block Cash on Delivery while payment is pending', () => {
    expect(() =>
      assertCanDispatchOrder({ paymentMethod: 'CASH', paymentStatus: 'PENDING' }),
    ).not.toThrow();
  });
});
