import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS } from '../config/defaults';
import { AppError } from '../lib/errors';
import { getMapboxRoadRoute } from './mapbox.service';
import {
  assertQuotedDeliveryFee,
  calculateDistanceDeliveryFee,
  createDeliveryPricing,
} from './delivery-pricing.service';

vi.mock('./mapbox.service', () => ({
  getMapboxRoadRoute: vi.fn(),
}));

const settings = { ...DEFAULT_SETTINGS, updatedAt: null };

function mockRoute(distanceKm: number): void {
  vi.mocked(getMapboxRoadRoute).mockResolvedValue({
    coordinates: [],
    distanceKm,
    durationMin: 20,
    legs: [],
    steps: [],
    road: true,
    provider: 'mapbox',
  });
}

describe('distance delivery pricing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('applies the configurable minimum, base fee, rate, and cent rounding', () => {
    expect(calculateDistanceDeliveryFee(1, settings)).toBe(9);
    expect(calculateDistanceDeliveryFee(4, settings)).toBe(12);
    expect(calculateDistanceDeliveryFee(4.333, settings)).toBe(12.67);
  });

  it('uses a road route from the configured origin and warns beyond the threshold without a cap', async () => {
    mockRoute(20);

    const result = await createDeliveryPricing(5.6, -0.2, settings);

    expect(getMapboxRoadRoute).toHaveBeenCalledWith(
      { latitude: settings.businessLatitude, longitude: settings.businessLongitude },
      { latitude: 5.6, longitude: -0.2 },
    );
    expect(result.quote).toMatchObject({
      origin: {
        latitude: settings.businessLatitude,
        longitude: settings.businessLongitude,
        address: settings.businessAddress,
      },
      destination: { latitude: 5.6, longitude: -0.2 },
      drivingDistanceKm: 20,
      deliveryFee: 44,
      isLongDistance: true,
      warning: settings.longDistanceWarningText,
    });
    expect(result.snapshot).toMatchObject({
      provider: 'mapbox',
      drivingDistanceKm: 20,
      acceptedFee: 44,
      baseFee: settings.deliveryBaseFee,
      perKilometerRate: settings.deliveryPerKmRate,
    });
  });

  it('does not quote invalid destinations or substitute a fee when routing fails', async () => {
    await expect(createDeliveryPricing(0, 0, settings)).rejects.toMatchObject({
      code: 'INVALID_DELIVERY_LOCATION',
    });
    expect(getMapboxRoadRoute).not.toHaveBeenCalled();

    vi.mocked(getMapboxRoadRoute).mockRejectedValue(new AppError(
      504,
      'MAPBOX_TIMEOUT',
      'Mapbox directions timed out. Please try again.',
    ));
    await expect(createDeliveryPricing(5.6, -0.2, settings)).rejects.toMatchObject({
      code: 'MAPBOX_TIMEOUT',
      statusCode: 504,
    });
  });

  it('rejects invalid route distances and invalid pricing settings', () => {
    expect(() => calculateDistanceDeliveryFee(0, settings)).toThrowError(
      expect.objectContaining({ code: 'INVALID_ROUTE_DISTANCE' }),
    );
    expect(() => calculateDistanceDeliveryFee(3, {
      ...settings,
      deliveryPerKmRate: -1,
    })).toThrowError(expect.objectContaining({ code: 'INVALID_DELIVERY_PRICING' }));
  });

  it('rejects a customer-submitted fee that differs from the server quote', () => {
    expect(() => assertQuotedDeliveryFee(8, 9, 'GH₵')).toThrowError(
      expect.objectContaining({ statusCode: 409, code: 'CONFLICT' }),
    );
    expect(() => assertQuotedDeliveryFee(9, 9, 'GH₵')).not.toThrow();
  });
});
