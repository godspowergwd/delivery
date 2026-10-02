export function createKeyedIntervalLimit(intervalMs: number, now: () => number = Date.now) {
  const lastAcceptedAt = new Map<string, number>();
  return {
    accept(key: string): boolean {
      const current = now();
      const previous = lastAcceptedAt.get(key);
      if (previous !== undefined && current - previous < intervalMs) return false;
      lastAcceptedAt.set(key, current);
      return true;
    },
    forget(key: string): void {
      lastAcceptedAt.delete(key);
    },
  };
}