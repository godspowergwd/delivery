import { conflict } from '../lib/errors';

type ClaimTransaction = {
  order: {
    updateMany(args: {
      where: { id: string; driverId: null; status: 'OUT_FOR_DELIVERY' };
      data: { driverId: string };
    }): Promise<{ count: number }>;
  };
};

export async function claimUnassignedDelivery(
  tx: ClaimTransaction,
  orderId: string,
  driverId: string,
): Promise<void> {
  const result = await tx.order.updateMany({
    where: { id: orderId, driverId: null, status: 'OUT_FOR_DELIVERY' },
    data: { driverId },
  });
  if (result.count !== 1) throw conflict('Another driver already accepted this delivery.');
}