import { Router } from 'express';
import { asyncHandler } from '../lib/http';
import { authenticate, getAuth, requireKitchenOrAdmin } from '../middleware/authenticate';
import { uploadImage } from '../middleware/upload';
import { badRequest } from '../lib/errors';
import { logActivity } from '../services/activity-log.service';

export const uploadsRouter = Router();

/**
 * POST /api/uploads - multipart image upload used by product/category management.
 * Responds with a relative path so the PWA works from any host (localhost, POS LAN, domain).
 *
 * Kitchen accounts upload product images as part of product management, so this
 * route allows kitchen *and* admin. Every other admin surface stays admin-only.
 */
uploadsRouter.post(
  '/',
  authenticate,
  requireKitchenOrAdmin,
  uploadImage,
  asyncHandler(async (req, res) => {
    if (!req.file) {
      throw badRequest('Choose an image file to upload (JPG, PNG, WEBP or AVIF).');
    }

    const actor = getAuth(req).user;
    await logActivity({
      action: 'IMAGE_UPLOADED',
      entity: 'Upload',
      entityId: req.file.filename,
      description: `Uploaded ${req.file.originalname} (${Math.round(req.file.size / 1024)} KB)`,
      userId: actor.id,
      actorEmail: actor.email,
      actorRole: actor.role,
      request: req,
    });

    res.status(201).json({
      url: `/uploads/${req.file.filename}`,
      fileName: req.file.filename,
      size: req.file.size,
      mimeType: req.file.mimetype,
    });
  }),
);