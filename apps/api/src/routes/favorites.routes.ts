import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../lib/http';
import { idParamSchema } from '../lib/validation';
import { authenticate, getAuth } from '../middleware/authenticate';
import { prisma } from '../lib/prisma';
import { notFound } from '../lib/errors';
import { PRODUCT_INCLUDE, serializeProduct } from '../services/serializers';

export const favoritesRouter = Router();

const productIdParamSchema = z.object({ productId: z.string().trim().min(1) });

/** GET /api/favorites - the customer's saved products. */
favoritesRouter.get(
  '/',
  authenticate,
  asyncHandler(async (req, res) => {
    const { user } = getAuth(req);
    const favorites = await prisma.favorite.findMany({
      where: { userId: user.id, product: { isArchived: false } },
      include: { product: { include: PRODUCT_INCLUDE } },
      orderBy: { createdAt: 'desc' },
    });
    res.json({
      favorites: favorites.map((favorite) => ({
        id: favorite.id,
        createdAt: favorite.createdAt.toISOString(),
        product: serializeProduct(favorite.product),
      })),
    });
  }),
);

/** POST /api/favorites/:productId - toggles a product in/out of favourites. */
favoritesRouter.post(
  '/:productId',
  authenticate,
  asyncHandler(async (req, res) => {
    const { productId } = productIdParamSchema.parse(req.params);
    const { user } = getAuth(req);

    const product = await prisma.product.findUnique({ where: { id: productId } });
    if (!product) throw notFound('That product no longer exists.');

    const existing = await prisma.favorite.findUnique({
      where: { userId_productId: { userId: user.id, productId } },
    });

    if (existing) {
      await prisma.favorite.delete({ where: { id: existing.id } });
      res.json({ favorited: false, productId });
      return;
    }

    await prisma.favorite.create({ data: { userId: user.id, productId } });
    res.status(201).json({ favorited: true, productId });
  }),
);

/** DELETE /api/favorites/:productId */
favoritesRouter.delete(
  '/:productId',
  authenticate,
  asyncHandler(async (req, res) => {
    const { productId } = productIdParamSchema.parse(req.params);
    const { user } = getAuth(req);
    await prisma.favorite.deleteMany({ where: { userId: user.id, productId } });
    res.json({ favorited: false, productId });
  }),
);

/** GET /api/favorites/ids - lightweight list used for heart icons in the catalogue. */
favoritesRouter.get(
  '/ids',
  authenticate,
  asyncHandler(async (req, res) => {
    const { user } = getAuth(req);
    const favorites = await prisma.favorite.findMany({
      where: { userId: user.id },
      select: { productId: true },
    });
    res.json({ productIds: favorites.map((favorite) => favorite.productId) });
  }),
);

export const favoritesIdParamSchema = idParamSchema;