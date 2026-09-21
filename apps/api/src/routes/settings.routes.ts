import { Router } from 'express';
import { z } from 'zod';
import type { SettingsDTO } from '@delivery/shared';
import { asyncHandler } from '../lib/http';
import { emailSchema, percentSchema, phoneSchema } from '../lib/validation';
import { authenticate, getAuth, requireAdmin } from '../middleware/authenticate';
import { getPublicSettings, getSettings, updateSettings } from '../services/settings.service';
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
  deliveryFee: z.coerce.number().min(0).max(1000).optional(),
  taxRate: percentSchema.optional(),
  minOrderTotal: z.coerce.number().min(0).max(10_000).optional(),
  acceptingOrders: z.boolean().optional(),
  // Support contact block - stored in PostgreSQL and live the moment it is saved.
  supportPhone: phoneSchema.optional(),
  supportEmail: emailSchema.optional(),
  lowStockThreshold: z.coerce.number().int().min(0).max(10_000).optional(),
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
  asyncHandler(async (_req, res) => {
    const settings = await getSettings();
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

/** PATCH /api/settings - update business settings (admin only). */
settingsRouter.patch(
  '/',
  authenticate,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const patch = updateSettingsSchema.parse(req.body) as Partial<
      Omit<SettingsDTO, 'updatedAt'>
    >;
    const actor = getAuth(req).user;
    const settings = await updateSettings(patch, actor.id);
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