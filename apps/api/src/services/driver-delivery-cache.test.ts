import { beforeEach, describe, expect, it, vi } from 'vitest';
import { activeDeliveryTargets, invalidateActiveDeliveryTargets } from './driver-delivery-cache';

describe('active delivery target cache', () => {
  beforeEach(() => {
    invalidateActiveDeliveryTargets('driver-1');
  });

  it('coalesces location lookups within the cache interval', async () => {
    const load = vi.fn(async () => ['order-1:customer-1']);
    await activeDeliveryTargets('driver-1', load, 1_000);
    await activeDeliveryTargets('driver-1', load, 10_000);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('reloads after expiry and immediately after an order mutation', async () => {
    const load = vi.fn(async () => ['order-1:customer-1']);
    await activeDeliveryTargets('driver-1', load, 1_000);
    await activeDeliveryTargets('driver-1', load, 17_000);
    invalidateActiveDeliveryTargets('driver-1');
    await activeDeliveryTargets('driver-1', load, 18_000);
    expect(load).toHaveBeenCalledTimes(3);
  });

  it('does not cache stale results when invalidated during a database read', async () => {
    let finish!: (values: string[]) => void;
    const load = vi.fn(() => new Promise<string[]>((resolve) => { finish = resolve; }));
    const inFlight = activeDeliveryTargets('driver-1', load, 1_000);
    invalidateActiveDeliveryTargets('driver-1');
    const fresh = await activeDeliveryTargets('driver-1', async () => ['fresh-order:customer-1'], 2_000);
    finish(['stale-order:customer-1']);
    await inFlight;
    expect(fresh).toEqual(['fresh-order:customer-1']);
    expect(load).toHaveBeenCalledTimes(1);
  });
});