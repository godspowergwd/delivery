import { Router } from 'express';
import { asyncHandler } from '../lib/http';
import { authenticate, getAuth, requireKitchenOrAdmin } from '../middleware/authenticate';
import { assertImageSignature, uploadImage } from '../middleware/upload';
import { uploadLimiter } from '../middleware/rateLimit';
import { badRequest } from '../lib/errors';
import { logActivity } from '../services/activity-log.service';
import { uploadToR2 } from '../services/r2.service';

export const uploadsRouter = Router();

/**
 * POST /api/uploads - multipart image upload used by product/category management.
 * Uploads directly to Cloudflare R2 and returns a public URL.
 *
 * Kitchen accounts upload product images as part of product management, so this
 * route allows kitchen *and* admin. Every other admin surface stays admin-only.
 * Uploads are rate limited and the payload must be a real image (magic bytes).
 */
uploadsRouter.post(
  '/',
  authenticate,
  requireKitchenOrAdmin,
  uploadLimiter,
  uploadImage,
  asyncHandler(async (req, res) => {
    if (!req.file) {
      throw badRequest('Choose an image file to upload (JPG, PNG, WEBP or AVIF).');
    }
    assertImageSignature(req.file);

    const uploaded = await uploadToR2(req.file);

    const actor = getAuth(req).user;
    await logActivity({
      action: 'IMAGE_UPLOADED',
      entity: 'Upload',
      entityId: uploaded.key,
      description: `Uploaded ${req.file.originalname} (${Math.round(uploaded.size / 1024)} KB)`,
      userId: actor.id,
      actorEmail: actor.email,
      actorRole: actor.role,
      request: req,
    });

    res.status(201).json({
      url: uploaded.url,
      fileName: uploaded.key,
      size: uploaded.size,
      mimeType: uploaded.mimeType,
    });
  }),
);
