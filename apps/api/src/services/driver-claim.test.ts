import { describe, expect, it } from 'vitest';
import { claimUnassignedDelivery } from './driver-claim';

function createClaimTransaction() {
  let driverId: string | null = null;
  let status = 'OUT_FOR_DELIVERY';
  const tx = {
    order: {
      async updateMany({ where, data }: {
        where: { id: string; driverId: null; status: 'OUT_FOR_DELIVERY' };
        data: { driverId: string };
      }) {
        if (where.id !== 'order-1' || driverId !== null || status !== 'OUT_FOR_DELIVERY') {
          return { count: 0 };
        }
        driverId = data.driverId;
        status = 'CLAIMED';
        return { count: 1 };
      },
    },
  };
  return { tx, getDriverId: () => driverId };
}

describe('atomic delivery claim', () => {
  it('allows only one of two concurrent drivers to claim the order', async () => {
    const { tx, getDriverId } = createClaimTransaction();
    const results = await Promise.allSettled([
      claimUnassignedDelivery(tx, 'order-1', 'driver-1'),
      claimUnassignedDelivery(tx, 'order-1', 'driver-2'),
    ]);

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
    expect(['driver-1', 'driver-2']).toContain(getDriverId());
  });

  it('refuses to claim an order that is no longer in the open pool', async () => {
    const { tx } = createClaimTransaction();
    await claimUnassignedDelivery(tx, 'order-1', 'driver-1');
    await expect(claimUnassignedDelivery(tx, 'order-1', 'driver-2')).rejects.toMatchObject({ statusCode: 409 });
  });
});