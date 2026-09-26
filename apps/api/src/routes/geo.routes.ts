import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../lib/http';
import { authenticate, getAuth, requireAdmin } from '../middleware/authenticate';
import { haversineDistance, isWithinDeliveryZone } from '../services/geo.service';
import { getMapboxRoadRoute, reverseMapboxAddress, searchMapboxAddresses } from '../services/mapbox.service';
import { getSettings } from '../services/settings.service';

export const geoRouter = Router();

const searchQuerySchema = z.object({
  q: z.string().trim().min(3, 'Enter at least 3 characters'),
});

/**
 * GET /api/geo/search?q=Accra+Mall
 * Public: returns Mapbox address suggestions, including validated coordinates.
 */
geoRouter.get(
  '/search',
  asyncHandler(async (req, res) => {
    const { q } = searchQuerySchema.parse(req.query);
    const suggestions = await searchMapboxAddresses(q);
    res.json({ suggestions });
  }),
);

geoRouter.get(
  '/reverse',
  asyncHandler(async (req, res) => {
    const { latitude, longitude } = z.object({
      latitude: z.coerce.number().finite().min(-90).max(90),
      longitude: z.coerce.number().finite().min(-180).max(180),
    }).parse(req.query);
    const suggestion = await reverseMapboxAddress(latitude, longitude);
    res.json({ suggestion });
  }),
);

const routeQuerySchema = z.object({
  fromLatitude: z.coerce.number().finite().min(-90).max(90),
  fromLongitude: z.coerce.number().finite().min(-180).max(180),
  toLatitude: z.coerce.number().finite().min(-90).max(90),
  toLongitude: z.coerce.number().finite().min(-180).max(180),
});

/**
 * GET /api/geo/directions?fromLatitude=...&fromLongitude=...&toLatitude=...&toLongitude=...
 * Authenticated: the Mapbox access token remains on the server.
 */
geoRouter.get(
  '/directions',
  authenticate,
  asyncHandler(async (req, res) => {
    const { fromLatitude, fromLongitude, toLatitude, toLongitude } = routeQuerySchema.parse(req.query);
    const route = await getMapboxRoadRoute(
      { latitude: fromLatitude, longitude: fromLongitude },
      { latitude: toLatitude, longitude: toLongitude },
    );
    res.json({ route });
  }),
);

/**
 * GET /api/geo/check-zone?latitude=...&longitude=...
 * Public-ish: checks if coordinates are within delivery area.
 * Requires auth to prevent abuse.
 */
geoRouter.get(
  '/check-zone',
  authenticate,
  asyncHandler(async (req, res) => {
    const { latitude, longitude } = z.object({
      latitude: z.coerce.number().min(-90).max(90),
      longitude: z.coerce.number().min(-180).max(180),
    }).parse(req.query);

    const settings = await getSettings();
    const result = isWithinDeliveryZone(
      latitude,
      longitude,
      settings.businessLatitude,
      settings.businessLongitude,
      settings.deliveryRadiusKm,
    );

    res.json({
      within: result.within,
      distanceKm: Math.round(result.distanceKm * 100) / 100,
      radiusKm: settings.deliveryRadiusKm,
      message: result.message,
    });
  }),
);

/**
 * GET /api/geo/delivery-radius
 * Admin only: returns the current delivery radius setting.
 */
geoRouter.get(
  '/delivery-radius',
  authenticate,
  requireAdmin,
  asyncHandler(async (_req, res) => {
    const settings = await getSettings();
    const kitchen = { lat: settings.businessLatitude, lng: settings.businessLongitude };
    res.json({
      kitchen,
      radiusKm: settings.deliveryRadiusKm,
    });
  }),
);
