import { describe, expect, it } from 'vitest';
import { createDriverSocketRegistry } from './driver-socket-registry';

describe('driver socket registry', () => {
  it('keeps a driver online while another socket remains connected', () => {
    const registry = createDriverSocketRegistry();
    registry.add('driver-1', 'socket-a');
    registry.add('driver-1', 'socket-b');
    expect(registry.remove('driver-1', 'socket-a')).toBe(1);
    expect(registry.count('driver-1')).toBe(1);
  });

  it('reports the final disconnect and allows a clean reconnect', () => {
    const registry = createDriverSocketRegistry();
    registry.add('driver-1', 'socket-a');
    expect(registry.remove('driver-1', 'socket-a')).toBe(0);
    registry.add('driver-1', 'socket-b');
    expect(registry.remove('driver-1', 'socket-b')).toBe(0);
    expect(registry.count('driver-1')).toBe(0);
  });

  it('does not treat an already inactive socket as the final disconnect', () => {
    const registry = createDriverSocketRegistry();
    registry.add('driver-1', 'socket-a');
    expect(registry.remove('driver-1', 'socket-a')).toBe(0);
    registry.add('driver-1', 'socket-b');
    expect(registry.remove('driver-1', 'socket-a')).toBeNull();
    expect(registry.count('driver-1')).toBe(1);
  });
});