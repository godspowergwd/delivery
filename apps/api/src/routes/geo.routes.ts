import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../lib/http';
import { authenticate, getAuth, requireAdmin } from '../middleware/authenticate';
import { geoLimiter } from '../middleware/rateLimit';
import { getMapboxRoadRoute, reverseMapboxAddress, searchMapboxAddresses } from '../services/mapbox.service';
import { getSettings } from '../services/settings.service';
import { createDeliveryPricing } from '../services/delivery-pricing.service';

export const geoRouter = Router();

/**
 * Every geo route spends paid Mapbox quota, so the whole router is rate limited
 * per client (60 lookups per minute) in addition to the global API limit.
 */
geoRouter.use(geoLimiter);

const searchQuerySchema = z.object({
  q: z.string().trim().min(3, 'Enter at least 3 characters').max(120),
});

/**
 * GET /api/geo/search?q=Accra+Mall
 * Public: returns Mapbox address suggestions, including validated coordinates.
 */
geoRouter.get(
  '/search',
  asyncHandler(async (req, res) => {
    const { q } = searchQuerySchema.parse(req.query);
    const settings = await getSettings();
    const suggestions = await searchMapboxAddresses(q, {
      latitude: settings.businessLatitude,
      longitude: settings.businessLongitude,
    });
    res.json({ suggestions });
  }),
);

const deliveryQuoteQuerySchema = z.object({
  latitude: z.coerce.number().finite().min(-90).max(90),
  longitude: z.coerce.number().finite().min(-180).max(180),
});

/** POST /api/geo/delivery-quote: prices a verified Mapbox driving route server-side. */
geoRouter.post(
  '/delivery-quote',
  authenticate,
  asyncHandler(async (req, res) => {
    const { latitude, longitude } = deliveryQuoteQuerySchema.parse(req.body);
    const settings = await getSettings();
    const { quote } = await createDeliveryPricing(latitude, longitude, settings);
    res.json({ quote });
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
 * Compatibility endpoint: all valid destinations can be attempted; the radius
 * is only a long-distance warning threshold, never a delivery restriction.
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
    const pricing = await createDeliveryPricing(latitude, longitude, settings);

    res.json({
      within: true,
      distanceKm: pricing.quote.drivingDistanceKm,
      radiusKm: settings.deliveryRadiusKm,
      message: pricing.quote.warning,
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
