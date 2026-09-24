import { Router } from 'express';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { asyncHandler, paginate, paginateQuery } from '../lib/http';
import { idParamSchema, moneySchema, paginationSchema, optionalBooleanQuery } from '../lib/validation';
import { authenticate, getAuth, optionalAuthenticate, requireAdmin, requireKitchenOrAdmin } from '../middleware/authenticate';
import { writeLimiter } from '../middleware/rateLimit';
import { prisma } from '../lib/prisma';
import { badRequest, conflict, notFound } from '../lib/errors';
import { PRODUCT_INCLUDE, serializeProduct } from '../services/serializers';
import { logActivity } from '../services/activity-log.service';
import { emitToRole } from '../realtime/socket';
import type { AuthedRequest } from '../middleware/authenticate';

export const productsRouter = Router();

const productQuerySchema = paginationSchema.extend({
  q: z.string().trim().max(120).optional(),
  categoryId: z.string().trim().optional(),
  categorySlug: z.string().trim().optional(),
  sort: z
    .enum(['newest', 'price_asc', 'price_desc', 'name_asc', 'name_desc', 'popular'])
    .default('newest'),
  availableOnly: optionalBooleanQuery,
  popular: optionalBooleanQuery,
  isNew: optionalBooleanQuery,
  includeArchived: optionalBooleanQuery,
  minPrice: z.coerce.number().min(0).optional(),
  maxPrice: z.coerce.number().min(0).optional(),
});

const productBodySchema = z.object({
  name: z.string().trim().min(2, 'Product name is too short').max(120),
  description: z.string().trim().min(4, 'Add a short description').max(2000),
  imageUrl: z.string().trim().max(500).nullable().optional(),
  price: moneySchema,
  ingredients: z.array(z.string().trim().min(1).max(60)).max(30).optional().default([]),
  prepTimeMinutes: z.coerce.number().int().min(1).max(240).default(15),
  isAvailable: z.boolean().default(true),
  stock: z.coerce.number().int().min(0).max(100_000).default(50),
  isPopular: z.boolean().default(false),
  isNew: z.boolean().default(true),
  isArchived: z.boolean().optional(),
  categoryId: z.string().trim().min(1, 'Choose a category'),
});

const stockBodySchema = z.object({
  stock: z.coerce.number().int().min(0).max(100_000),
  isAvailable: z.boolean().optional(),
});

const idBodySchema = idParamSchema;

function productOrderBy(sort: string): Prisma.ProductOrderByWithRelationInput[] {
  switch (sort) {
    case 'price_asc':
      return [{ price: 'asc' }];
    case 'price_desc':
      return [{ price: 'desc' }];
    case 'name_asc':
      return [{ name: 'asc' }];
    case 'name_desc':
      return [{ name: 'desc' }];
    case 'popular':
      return [{ isPopular: 'desc' }, { orderItems: { _count: 'desc' } }];
    case 'newest':
    default:
      return [{ createdAt: 'desc' }];
  }
}

/** GET /api/products - public catalogue with search, filters, sorting and paging. */
productsRouter.get(
  '/',
  optionalAuthenticate,
  asyncHandler(async (req, res) => {
    const query = productQuerySchema.parse(req.query);
    const { skip, take } = paginateQuery(query);
    const viewer = (req as AuthedRequest).auth?.user;
    // Staff and admins may see archived products and inactive categories.
    const isPrivileged = viewer?.role === 'ADMIN' || viewer?.role === 'KITCHEN';

    const and: Prisma.ProductWhereInput[] = [];
    const where: Prisma.ProductWhereInput = { AND: and };

    if (!query.includeArchived || !isPrivileged) where.isArchived = false;
    if (!isPrivileged) and.push({ category: { isActive: true } });
    if (query.availableOnly) where.isAvailable = true;
    if (query.popular) where.isPopular = true;
    if (query.isNew) where.isNew = true;
    if (query.categoryId) where.categoryId = query.categoryId;
    if (query.categorySlug) where.category = { slug: query.categorySlug };
    if (query.minPrice !== undefined || query.maxPrice !== undefined) {
      where.price = {
        ...(query.minPrice !== undefined ? { gte: query.minPrice } : {}),
        ...(query.maxPrice !== undefined ? { lte: query.maxPrice } : {}),
      };
    }
    if (query.q) {
      const term = query.q.trim();
      and.push({
        OR: [
          { name: { contains: term, mode: 'insensitive' } },
          { description: { contains: term, mode: 'insensitive' } },
          { category: { name: { contains: term, mode: 'insensitive' } } },
          { ingredients: { has: term } },
        ],
      });
    }

    const [items, total] = await Promise.all([
      prisma.product.findMany({
        where,
        include: PRODUCT_INCLUDE,
        orderBy: productOrderBy(query.sort),
        skip,
        take,
      }),
      prisma.product.count({ where }),
    ]);

    res.json(
      paginate(
        items.map(serializeProduct),
        total,
        { page: query.page, pageSize: query.pageSize, skip, take },
      ),
    );
  }),
);

/** GET /api/products/:id */
productsRouter.get(
  '/:id',
  optionalAuthenticate,
  asyncHandler(async (req, res) => {
    const { id } = idParamSchema.parse(req.params);
    const product = await prisma.product.findUnique({ where: { id }, include: PRODUCT_INCLUDE });
    if (!product) throw notFound('That product no longer exists.');
    const viewer = (req as AuthedRequest).auth?.user;
    if (viewer?.role === 'CUSTOMER' && (product.isArchived || !product.isAvailable)) {
      throw notFound('That product is not available right now.');
    }
    res.json({ product: serializeProduct(product) });
  }),
);

async function assertCategoryExists(categoryId: string): Promise<void> {
  const category = await prisma.category.findUnique({
    where: { id: categoryId },
    select: { id: true },
  });
  if (!category) throw badRequest('Choose an existing category for this product.');
}

/** POST /api/products - create a product (kitchen staff can add dishes to their menu). */
productsRouter.post(
  '/',
  authenticate,
  requireKitchenOrAdmin,
  writeLimiter,
  asyncHandler(async (req, res) => {
    const body = productBodySchema.parse(req.body);
    await assertCategoryExists(body.categoryId);

    const created = await prisma.product.create({
      data: {
        name: body.name,
        description: body.description,
        imageUrl: body.imageUrl ?? null,
        price: body.price,
        ingredients: body.ingredients,
        prepTimeMinutes: body.prepTimeMinutes,
        isAvailable: body.isAvailable,
        stock: body.stock,
        isPopular: body.isPopular,
        isNew: body.isNew,
        isArchived: body.isArchived ?? false,
        categoryId: body.categoryId,
      },
      include: PRODUCT_INCLUDE,
    });

    const product = serializeProduct(created);
    for (const role of ['ADMIN', 'KITCHEN', 'CUSTOMER'] as const) {
      emitToRole(role, 'product:changed', { action: 'created', product });
    }
    emitToRole('ADMIN', 'analytics:refresh', {});

    const actor = getAuth(req).user;
    await logActivity({
      action: 'PRODUCT_CREATED',
      entity: 'Product',
      entityId: created.id,
      description: `Product "${created.name}" created`,
      userId: actor.id,
      actorEmail: actor.email,
      actorRole: actor.role,
      request: req,
    });

    res.status(201).json({ product });
  }),
);

/** PATCH /api/products/:id - edit a product (kitchen staff manage their menu; delete stays admin-only). */
productsRouter.patch(
  '/:id',
  authenticate,
  requireKitchenOrAdmin,
  writeLimiter,
  asyncHandler(async (req, res) => {
    const { id } = idParamSchema.parse(req.params);
    const body = productBodySchema.partial().parse(req.body);

    const existing = await prisma.product.findUnique({ where: { id } });
    if (!existing) throw notFound('That product no longer exists.');
    if (body.categoryId) await assertCategoryExists(body.categoryId);

    const updated = await prisma.product.update({
      where: { id },
      data: {
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.description !== undefined ? { description: body.description } : {}),
        ...(body.imageUrl !== undefined ? { imageUrl: body.imageUrl } : {}),
        ...(body.price !== undefined ? { price: body.price } : {}),
        ...(body.ingredients !== undefined ? { ingredients: body.ingredients } : {}),
        ...(body.prepTimeMinutes !== undefined ? { prepTimeMinutes: body.prepTimeMinutes } : {}),
        ...(body.isAvailable !== undefined ? { isAvailable: body.isAvailable } : {}),
        ...(body.stock !== undefined ? { stock: body.stock } : {}),
        ...(body.isPopular !== undefined ? { isPopular: body.isPopular } : {}),
        ...(body.isNew !== undefined ? { isNew: body.isNew } : {}),
        ...(body.isArchived !== undefined ? { isArchived: body.isArchived } : {}),
        ...(body.categoryId !== undefined ? { categoryId: body.categoryId } : {}),
      },
      include: PRODUCT_INCLUDE,
    });

    const product = serializeProduct(updated);
    for (const role of ['ADMIN', 'KITCHEN', 'CUSTOMER'] as const) {
      emitToRole(role, 'product:changed', { action: 'updated', product });
    }

    const actor = getAuth(req).user;
    await logActivity({
      action: 'PRODUCT_UPDATED',
      entity: 'Product',
      entityId: id,
      description: `Product "${updated.name}" updated`,
      metadata: { fields: Object.keys(body) },
      userId: actor.id,
      actorEmail: actor.email,
      actorRole: actor.role,
      request: req,
    });

    res.json({ product });
  }),
);
/** POST /api/products/:id/stock - adjust stock and availability (admin only). */
productsRouter.post(
  '/:id/stock',
  authenticate,
  requireAdmin,
  writeLimiter,
  asyncHandler(async (req, res) => {
    const { id } = idParamSchema.parse(req.params);
    const body = stockBodySchema.parse(req.body);

    const existing = await prisma.product.findUnique({ where: { id } });
    if (!existing) throw notFound('That product no longer exists.');

    const updated = await prisma.product.update({
      where: { id },
      data: {
        stock: body.stock,
        ...(body.isAvailable !== undefined ? { isAvailable: body.isAvailable } : {}),
      },
      include: PRODUCT_INCLUDE,
    });

    const product = serializeProduct(updated);
    for (const role of ['ADMIN', 'KITCHEN', 'CUSTOMER'] as const) {
      emitToRole(role, 'product:changed', { action: 'updated', product });
    }
    if (updated.stock <= 0) {
      emitToRole('ADMIN', 'stock:low', {
        productId: updated.id,
        name: updated.name,
        stock: updated.stock,
      });
    }

    const actor = getAuth(req).user;
    await logActivity({
      action: 'PRODUCT_STOCK_UPDATED',
      entity: 'Product',
      entityId: id,
      description: `Stock for "${updated.name}" set to ${updated.stock}`,
      userId: actor.id,
      actorEmail: actor.email,
      actorRole: actor.role,
      request: req,
    });

    res.json({ product });
  }),
);

/** DELETE /api/products/:id - permanently remove a product (admin only). */
productsRouter.delete(
  '/:id',
  authenticate,
  requireAdmin,
  writeLimiter,
  asyncHandler(async (req, res) => {
    const { id } = idParamSchema.parse(req.params);
    const existing = await prisma.product.findUnique({ where: { id } });
    if (!existing) throw notFound('That product no longer exists.');

    const activeOrders = await prisma.orderItem.count({
      where: {
        productId: id,
        order: {
          status: { in: ['RECEIVED', 'ACCEPTED', 'PREPARING', 'READY', 'OUT_FOR_DELIVERY'] },
        },
      },
    });
    if (activeOrders > 0) {
      throw conflict(
        'This product is part of orders that are still in progress. Archive it instead of deleting it.',
      );
    }

    await prisma.product.delete({ where: { id } });

    for (const role of ['ADMIN', 'KITCHEN', 'CUSTOMER'] as const) {
      emitToRole(role, 'product:changed', { action: 'deleted', productId: id });
    }

    const actor = getAuth(req).user;
    await logActivity({
      action: 'PRODUCT_DELETED',
      entity: 'Product',
      entityId: id,
      description: `Product "${existing.name}" deleted`,
      userId: actor.id,
      actorEmail: actor.email,
      actorRole: actor.role,
      request: req,
    });

    res.json({ success: true });
  }),
);