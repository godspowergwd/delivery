import { Router } from 'express';
import { z } from 'zod';
import type { SettingsDTO } from '@delivery/shared';
import { asyncHandler } from '../lib/http';
import { emailSchema, percentSchema, phoneSchema } from '../lib/validation';
import { authenticate, getAuth, requireAdmin } from '../middleware/authenticate';
import { publicReadLimiter, writeLimiter } from '../middleware/rateLimit';
import { badRequest } from '../lib/errors';
import { getPublicSettings, getSettings, updateSettings } from '../services/settings.service';
import { applyRestaurantStatus, getRestaurantStatus } from '../services/restaurant.service';
import { logActivity } from '../services/activity-log.service';
import { emitToRole } from '../realtime/socket';

export const settingsRouter = Router();

const updateSettingsSchema = z.object({
  businessName: z.string().trim().min(2).max(120).optional(),
  businessAddress: z.string().trim().min(4).max(240).optional(),
  businessPhone: phoneSchema.optional(),
  businessEmail: emailSchema.optional(),
  currencyCode: z.string().trim().min(2).max(6).optional(),
  currencySymbol: z.string().trim().min(1).max(6).optional(),
  deliveryBaseFee: z.coerce.number().finite().min(0).max(1000).optional(),
  deliveryMinimumFee: z.coerce.number().finite().min(0).max(1000).optional(),
  deliveryPerKmRate: z.coerce.number().finite().min(0).max(1000).optional(),
  longDistanceWarningText: z.string().trim().min(10).max(500).optional(),
  deliveryRadiusKm: z.coerce.number().finite().min(0).max(1000).optional(),
  taxRate: percentSchema.optional(),
  minOrderTotal: z.coerce.number().min(0).max(10_000).optional(),
  acceptingOrders: z.boolean().optional(),
  // Support contact block - stored in PostgreSQL and live the moment it is saved.
  supportPhone: phoneSchema.optional(),
  supportEmail: emailSchema.optional(),
  // Admin-controlled payment methods (Admin > Settings > Payments).
  momoEnabled: z.boolean().optional(),
  cashEnabled: z.boolean().optional(),
  momoNumber: z.string().trim().max(20).optional(),
  momoAccountName: z.string().trim().max(120).optional(),
  momoInstructions: z.string().trim().max(500).optional(),
  lowStockThreshold: z.coerce.number().int().min(0).max(10_000).optional(),
  // Kitchen / pickup anchor used as the trusted route origin and map location.
  businessLatitude: z.coerce.number().finite().min(4.4).max(11.3).optional(),
  businessLongitude: z.coerce.number().finite().min(-3.5).max(1.5).optional(),
}).superRefine((settings, context) => {
  if ((settings.businessLatitude === undefined) !== (settings.businessLongitude === undefined)) {
    context.addIssue({
      code: 'custom',
      path: ['businessLongitude'],
      message: 'Update the origin latitude and longitude together.',
    });
  }
  if (settings.momoNumber && !/^\+?[0-9\s()-]{7,20}$/.test(settings.momoNumber)) {
    context.addIssue({
      code: 'custom',
      path: ['momoNumber'],
      message: 'Enter a valid Mobile Money number.',
    });
  }
  if (settings.momoAccountName && settings.momoAccountName.length < 2) {
    context.addIssue({
      code: 'custom',
      path: ['momoAccountName'],
      message: 'Recipient name must contain at least 2 characters.',
    });
  }
});

function broadcastSettingsChange(): void {
  for (const role of ['ADMIN', 'KITCHEN', 'CUSTOMER'] as const) {
    emitToRole(role, 'settings:changed');
  }
}

/**
 * GET /api/settings - public storefront configuration (pricing, fees, contact).
 * The client needs this to show accurate cart totals before checkout.
 */
settingsRouter.get(
  '/',
  publicReadLimiter,
  asyncHandler(async (_req, res) => {
    const settings = await getPublicSettings();
    res.json({ settings });
  }),
);

/**
 * GET /api/settings/support - public support contact block only. Small and
 * cacheable, so even an anonymous client can show the current support phone.
 */
settingsRouter.get(
  '/support',
  asyncHandler(async (_req, res) => {
    const settings = await getPublicSettings();
    res.json({
      support: {
        businessName: settings.businessName,
        supportPhone: settings.supportPhone,
        supportEmail: settings.supportEmail,
        updatedAt: settings.updatedAt,
      },
    });
  }),
);

/** GET /api/settings/admin - full settings document including internal thresholds. */
settingsRouter.get(
  '/admin',
  authenticate,
  requireAdmin,
  asyncHandler(async (_req, res) => {
    res.json({ settings: await getSettings() });
  }),
);

/**
 * GET /api/settings/restaurant-status - live open/closed state of the kitchen.
 *
 * Public on purpose: the storefront shows it to browsing guests before any
 * account exists, and every signed-in client also refreshes it through the
 * `restaurant:status` socket event.
 */
settingsRouter.get(
  '/restaurant-status',
  asyncHandler(async (_req, res) => {
    res.json({ status: await getRestaurantStatus() });
  }),
);

/** PATCH /api/settings - update business settings (admin only). */
settingsRouter.patch(
  '/',
  authenticate,
  requireAdmin,
  writeLimiter,
  asyncHandler(async (req, res) => {
    const patch = updateSettingsSchema.parse(req.body) as Partial<
      Omit<SettingsDTO, 'updatedAt'>
    >;
    const actor = getAuth(req).user;
    const current = await getSettings();
    const nextMomoEnabled = patch.momoEnabled ?? current.momoEnabled;
    const nextMomoNumber = patch.momoNumber ?? current.momoNumber;
    const nextMomoAccountName = patch.momoAccountName ?? current.momoAccountName;
    if (nextMomoEnabled && (!nextMomoNumber.trim() || !nextMomoAccountName.trim())) {
      throw badRequest('Configure the MoMo wallet number and recipient name before enabling Mobile Money.');
    }

    // Flipping "accepting orders" from Admin > Settings is the same business
    // event as the Kitchen toggle: it is written with its audit trail and
    // announced to every client on the same real-time event.
    const { acceptingOrders, ...rest } = patch;
    const settings =
      acceptingOrders === undefined
        ? await updateSettings(rest, actor.id)
        : (
            await applyRestaurantStatus({
              open: acceptingOrders,
              actor,
              alsoPatch: rest,
              request: req,
            })
          ).settings;

    broadcastSettingsChange();

    await logActivity({
      action: 'SETTINGS_UPDATED',
      entity: 'Setting',
      description: 'Business settings updated',
      metadata: patch as Record<string, unknown>,
      userId: actor.id,
      actorEmail: actor.email,
      actorRole: actor.role,
      request: req,
    });

    res.json({ settings });
  }),
);