import { describe, expect, it } from 'vitest';
import { decrementOrderStock } from './order-stock';

type Inventory = {
  stock: Map<string, number>;
  orders: string[];
  transaction<T>(work: (tx: unknown) => Promise<T>): Promise<T>;
};

function createInventory(initialStock: Record<string, number>): Inventory {
  let transactionTail = Promise.resolve();
  let tx: unknown;
  const inventory: Inventory = {
    stock: new Map(Object.entries(initialStock)),
    orders: [],
    async transaction<T>(work: (tx: unknown) => Promise<T>): Promise<T> {
      const previous = transactionTail;
      let release = () => undefined;
      transactionTail = new Promise<void>((resolve) => { release = resolve; });
      await previous;
      const snapshotStock = new Map(inventory.stock);
      const snapshotOrders = inventory.orders.length;
      try {
        return await work(tx);
      } catch (error) {
        inventory.stock.clear();
        for (const [id, amount] of snapshotStock) inventory.stock.set(id, amount);
        inventory.orders.length = snapshotOrders;
        throw error;
      } finally {
        release();
      }
    },
  };

  tx = {
    order: { create: async () => inventory.orders.push('pending') },
    product: {
      updateMany: async ({ where, data }: {
        where: { id: string; isArchived: boolean; isAvailable: boolean; stock: { gte: number } };
        data: { stock: { decrement: number } };
      }) => {
        const available = inventory.stock.get(where.id);
        if (
          available === undefined || where.isArchived || !where.isAvailable ||
          available < where.stock.gte
        ) return { count: 0 };
        inventory.stock.set(where.id, available - data.stock.decrement);
        return { count: 1 };
      },
    },
  };

  return inventory;
}

describe('transactional order stock decrement', () => {
  it('decrements normal stock', async () => {
    const inventory = createInventory({ product: 6 });
    await inventory.transaction(async (tx) => {
      await decrementOrderStock(tx as never, { productId: 'product', quantity: 2 });
    });
    expect(inventory.stock.get('product')).toBe(4);
  });

  it('allows exact stock consumption and never makes stock negative', async () => {
    const inventory = createInventory({ product: 3 });
    await inventory.transaction(async (tx) => {
      await decrementOrderStock(tx as never, { productId: 'product', quantity: 3 });
    });
    expect(inventory.stock.get('product')).toBe(0);
  });

  it('rejects insufficient inventory', async () => {
    const inventory = createInventory({ product: 2 });
    await expect(inventory.transaction(async (tx) => {
      await decrementOrderStock(tx as never, { productId: 'product', quantity: 3 });
    })).rejects.toMatchObject({ statusCode: 409 });
    expect(inventory.stock.get('product')).toBe(2);
  });

  it('allows only one concurrent order to consume the final unit', async () => {
    const inventory = createInventory({ product: 1 });
    const attempt = () => inventory.transaction(async (tx) => {
      inventory.orders.push('pending');
      await decrementOrderStock(tx as never, { productId: 'product', quantity: 1 });
    });
    const results = await Promise.allSettled([attempt(), attempt()]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(inventory.stock.get('product')).toBe(0);
    expect(inventory.orders).toHaveLength(1);
  });

  it('bounds multiple competing orders by available stock', async () => {
    const inventory = createInventory({ product: 5 });
    const results = await Promise.allSettled(
      Array.from({ length: 5 }, () => inventory.transaction(async (tx) => {
        inventory.orders.push('pending');
        await decrementOrderStock(tx as never, { productId: 'product', quantity: 2 });
      })),
    );
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(2);
    expect(inventory.stock.get('product')).toBe(1);
    expect(inventory.orders).toHaveLength(2);
  });

  it('rolls back prior decrements and the order when a later line is unavailable', async () => {
    const inventory = createInventory({ first: 4, second: 0 });
    await expect(inventory.transaction(async (tx) => {
      inventory.orders.push('pending');
      await decrementOrderStock(tx as never, { productId: 'first', quantity: 2 });
      await decrementOrderStock(tx as never, { productId: 'second', quantity: 1 });
    })).rejects.toMatchObject({ statusCode: 409 });
    expect(inventory.stock.get('first')).toBe(4);
    expect(inventory.stock.get('second')).toBe(0);
    expect(inventory.orders).toHaveLength(0);
  });
});