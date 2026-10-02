import type { Prisma } from '@prisma/client';
import { conflict } from '../lib/errors';

type StockTransaction = Pick<Prisma.TransactionClient, 'product'>;

export async function decrementOrderStock(
  tx: StockTransaction,
  line: { productId: string; quantity: number },
): Promise<void> {
  const result = await tx.product.updateMany({
    where: {
      id: line.productId,
      isArchived: false,
      isAvailable: true,
      stock: { gte: line.quantity },
    },
    data: { stock: { decrement: line.quantity } },
  });
  if (result.count !== 1) {
    throw conflict('A product in your cart is no longer available in that quantity. Please review your cart.');
  }
}