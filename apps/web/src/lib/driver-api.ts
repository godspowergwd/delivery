import { api } from './api';
import type { OrderDTO } from '@delivery/shared';

export interface DriverSummary {
  active: number;
  available: number;
  completedToday: number;
  completedTotal: number;
  earningsToday: number;
}

/** Lists share the `{ data: Order[] }` envelope used by the driver endpoints. */
export async function fetchDriverDeliveries(path: string): Promise<OrderDTO[]> {
  const response = await api.get<{ data: OrderDTO[] }>(path);
  return response.data ?? [];
}

/** Actions (accept / pickup / complete / issue) return the updated order. */
export async function postDriverAction(path: string, body?: unknown): Promise<OrderDTO> {
  const response = await api.post<{ data: OrderDTO }>(path, body ?? {});
  return response.data;
}

export function fetchDriverSummary(): Promise<DriverSummary> {
  return api.get<DriverSummary>('/driver/summary');
}

