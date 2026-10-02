export function createDriverSocketRegistry() {
  const socketsByDriver = new Map<string, Set<string>>();
  return {
    add(driverId: string, socketId: string): void {
      const sockets = socketsByDriver.get(driverId) ?? new Set<string>();
      sockets.add(socketId);
      socketsByDriver.set(driverId, sockets);
    },
    remove(driverId: string, socketId: string): number | null {
      const sockets = socketsByDriver.get(driverId);
      if (!sockets || !sockets.has(socketId)) return null;
      sockets.delete(socketId);
      if (sockets.size === 0) socketsByDriver.delete(driverId);
      return sockets.size;
    },
    count(driverId: string): number {
      return socketsByDriver.get(driverId)?.size ?? 0;
    },
  };
}