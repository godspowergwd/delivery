import type { DeliveryPricingSnapshotDTO, DeliveryQuoteDTO, SettingsDTO } from '@delivery/shared';
import { isValidLatitude, isValidLongitude } from '@delivery/shared';
import { AppError, conflict } from '../lib/errors';
import { getMapboxRoadRoute } from './mapbox.service';

export interface DeliveryPricingResult {
  quote: DeliveryQuoteDTO;
  snapshot: DeliveryPricingSnapshotDTO;
}

function roundCurrency(amount: number): number {
  return Math.round((amount + Number.EPSILON) * 100) / 100;
}

export function calculateDistanceDeliveryFee(
  drivingDistanceKm: number,
  settings: Pick<SettingsDTO, 'deliveryBaseFee' | 'deliveryMinimumFee' | 'deliveryPerKmRate'>,
): number {
  if (!Number.isFinite(drivingDistanceKm) || drivingDistanceKm <= 0) {
    throw new AppError(422, 'INVALID_ROUTE_DISTANCE', 'A valid driving route is required to price this delivery.');
  }
  const values = [settings.deliveryBaseFee, settings.deliveryMinimumFee, settings.deliveryPerKmRate];
  if (values.some((value) => !Number.isFinite(value) || value < 0)) {
    throw new AppError(500, 'INVALID_DELIVERY_PRICING', 'Delivery pricing settings are invalid. Please contact the restaurant.');
  }

  return roundCurrency(
    Math.max(settings.deliveryMinimumFee, settings.deliveryBaseFee + drivingDistanceKm * settings.deliveryPerKmRate),
  );
}

export function assertQuotedDeliveryFee(
  quotedFee: number,
  calculatedFee: number,
  currencySymbol: string,
): void {
  if (
    !Number.isFinite(quotedFee) ||
    quotedFee < 0 ||
    Math.round(quotedFee * 100) !== Math.round(calculatedFee * 100)
  ) {
    throw conflict(
      `The delivery fee is now ${currencySymbol}${calculatedFee.toFixed(2)}. Review the updated fee before placing your order.`,
    );
  }
}

export async function createDeliveryPricing(
  latitude: number,
  longitude: number,
  settings: SettingsDTO,
): Promise<DeliveryPricingResult> {
  if (
    !isValidLatitude(latitude) ||
    !isValidLongitude(longitude) ||
    (latitude === 0 && longitude === 0)
  ) {
    throw new AppError(422, 'INVALID_DELIVERY_LOCATION', 'Choose a valid delivery address from the location suggestions.');
  }

  if (
    !isValidLatitude(settings.businessLatitude) ||
    !isValidLongitude(settings.businessLongitude) ||
    (settings.businessLatitude === 0 && settings.businessLongitude === 0) ||
    !settings.businessAddress.trim()
  ) {
    throw new AppError(503, 'INVALID_RESTAURANT_ORIGIN', 'The restaurant delivery origin is not configured. Please contact the restaurant.');
  }

  const origin = {
    latitude: settings.businessLatitude,
    longitude: settings.businessLongitude,
  };
  const destination = { latitude, longitude };
  const route = await getMapboxRoadRoute(origin, destination);
  if (!route.road || route.provider !== 'mapbox') {
    throw new AppError(502, 'ROAD_ROUTE_REQUIRED', 'A road route could not be verified. Please correct the address or contact the restaurant.');
  }

  const drivingDistanceKm = roundCurrency(route.distanceKm);
  const deliveryFee = calculateDistanceDeliveryFee(route.distanceKm, settings);
  const isLongDistance = route.distanceKm > settings.deliveryRadiusKm;
  const warning = isLongDistance ? settings.longDistanceWarningText : null;
  const quotedAt = new Date().toISOString();

  return {
    quote: {
      origin: { ...origin, address: settings.businessAddress },
      destination,
      drivingDistanceKm,
      estimatedDurationMinutes: route.durationMin,
      deliveryFee,
      isLongDistance,
      warning,
    },
    snapshot: {
      provider: 'mapbox',
      model: 'distance-v1',
      origin: { ...origin, address: settings.businessAddress },
      destination,
      drivingDistanceKm,
      estimatedDurationMinutes: route.durationMin,
      baseFee: settings.deliveryBaseFee,
      minimumFee: settings.deliveryMinimumFee,
      perKilometerRate: settings.deliveryPerKmRate,
      acceptedFee: deliveryFee,
      quotedAt,
    },
  };
}
