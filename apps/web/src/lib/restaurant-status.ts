import { useQuery } from '@tanstack/react-query';
import type { RestaurantStatusDTO, SettingsDTO } from '@delivery/shared';
import { restaurantStatusFromSettings } from '@delivery/shared';
import { api } from './api';

/** React Query key shared by every screen that shows the restaurant status. */
export const RESTAURANT_STATUS_KEY = 'restaurant-status';

/**
 * Live restaurant open/closed state.
 *
 * One tiny public endpoint backs every screen (customer home/menu/checkout,
 * kitchen dashboard/settings and the driver dashboard). Signed-in devices are
 * updated instantly by the `restaurant:status` socket event — which invalidates
 * this key — while guests, who have no socket connection, stay fresh through the
 * poll below. The API always re-checks the state when an order is placed, so a
 * stale client can never slip an order through.
 */
export function useRestaurantStatus(options: { enabled?: boolean } = {}): {
  status: RestaurantStatusDTO | null;
  open: boolean;
  isLoading: boolean;
} {
  const { data, isLoading } = useQuery({
    queryKey: [RESTAURANT_STATUS_KEY],
    queryFn: () => api.get<{ status: RestaurantStatusDTO }>('/settings/restaurant-status'),
    enabled: options.enabled ?? true,
    staleTime: 10_000,
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  });

  return {
    status: data?.status ?? null,
    // Fail open for the storefront: the API refuses the order anyway, and a
    // network hiccup must never black out ordering for a customer.
    open: data?.status?.open ?? true,
    isLoading,
  };
}

/** Derives the same status shape from an already-loaded settings document. */
export function restaurantStatusFromSettingsData(
  settings: SettingsDTO | undefined,
): RestaurantStatusDTO | null {
  return settings ? restaurantStatusFromSettings(settings) : null;
}
