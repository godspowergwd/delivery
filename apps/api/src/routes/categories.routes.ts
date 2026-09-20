import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, paginate, paginateQuery } from '../lib/http';
import { idParamSchema, optionalBooleanQuery, paginationSchema, slugify } from '../lib/validation';
import { authenticate, getAuth, requireAdmin } from '../middleware/authenticate';
import { prisma } from '../lib/prisma';
import { badRequest, conflict, notFound } from '../lib/errors';
import { CATEGORY_INCLUDE, serializeCategory } from '../services/serializers';
import { logActivity } from '../services/activity-log.service';
import { emitToRole } from '../realtime/socket';

export const categoriesRouter = Router();

export const categoryBodySchema = z.object({
  name: z.string().trim().min(2, 'Category name is too short').max(60),
  description: z.string().trim().max(400).nullable().optional(),
  imageUrl: z.string().trim().max(500).nullable().optional(),
  sortOrder: z.coerce.number().int().min(0).max(999).default(0),
  isActive: z.boolean().default(true),
});

const reorderSchema = z.object({ ids: z.array(z.string().trim().min(1)).min(1) });

async function uniqueSlug(name: string, excludeId?: string): Promise<string> {
  const base = slugify(name) || 'category';
  let candidate = base;
  let suffix = 2;
  for (;;) {
    const existing = await prisma.category.findUnique({ where: { slug: candidate } });
    if (!existing || existing.id === excludeId) return candidate;
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
}

/** GET /api/categories - categories with live (non-archived) product counts. */
categoriesRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const query = paginationSchema
      .extend({ includeInactive: optionalBooleanQuery, withProductsOnly: optionalBooleanQuery })
      .parse(req.query);
    const { skip, take } = paginateQuery(query);

    const where: { isActive?: boolean } = {};
    if (!query.includeInactive) where.isActive = true;

    const [items, total] = await Promise.all([
      prisma.category.findMany({
        where,
        include: CATEGORY_INCLUDE,
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        skip,
        take,
      }),
      prisma.category.count({ where }),
    ]);

    const mapped = items.map(serializeCategory);
    const visible = query.withProductsOnly
      ? mapped.filter((category) => (category.productCount ?? 0) > 0)
      : mapped;

    res.json(paginate(visible, total, { page: query.page, pageSize: query.pageSize, skip, take }));
  }),
);

/** POST /api/categories - create a category (admin only). */
categoriesRouter.post(
  '/',
  authenticate,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const body = categoryBodySchema.parse(req.body);
    const duplicate = await prisma.category.findFirst({
      where: { name: { equals: body.name, mode: 'insensitive' } },
    });
    if (duplicate) throw conflict('A category with that name already exists.');

    const created = await prisma.category.create({
      data: {
        name: body.name,
        slug: await uniqueSlug(body.name),
        description: body.description ?? null,
        imageUrl: body.imageUrl ?? null,
        sortOrder: body.sortOrder,
        isActive: body.isActive,
      },
      include: CATEGORY_INCLUDE,
    });

    const category = serializeCategory(created);
    for (const role of ['ADMIN', 'KITCHEN', 'CUSTOMER'] as const) {
      emitToRole(role, 'category:changed', { action: 'created', category });
    }

    const actor = getAuth(req).user;
    await logActivity({
      action: 'CATEGORY_CREATED',
      entity: 'Category',
      entityId: created.id,
      description: `Category "${created.name}" created`,
      userId: actor.id,
      actorEmail: actor.email,
      actorRole: actor.role,
      request: req,
    });

    res.status(201).json({ category });
  }),
);

/** PATCH /api/categories/reorder - persist the admin's category ordering. */
categoriesRouter.patch(
  '/reorder',
  authenticate,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { ids } = reorderSchema.parse(req.body);
    const existing = await prisma.category.findMany({
      where: { id: { in: ids } },
      select: { id: true },
    });
    if (existing.length !== ids.length) throw badRequest('Some categories no longer exist.');

    await prisma.$transaction(
      ids.map((id, index) => prisma.category.update({ where: { id }, data: { sortOrder: index } })),
    );

    const categories = await prisma.category.findMany({
      include: CATEGORY_INCLUDE,
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });

    for (const role of ['ADMIN', 'KITCHEN', 'CUSTOMER'] as const) {
      emitToRole(role, 'category:changed', { action: 'reordered' });
    }

    const actor = getAuth(req).user;
    await logActivity({
      action: 'CATEGORY_REORDERED',
      entity: 'Category',
      description: `Category order updated (${ids.length} categories)`,
      userId: actor.id,
      actorEmail: actor.email,
      actorRole: actor.role,
      request: req,
    });

    res.json({ categories: categories.map(serializeCategory) });
  }),
);

/** PATCH /api/categories/:id - rename or edit a category (admin only). */
categoriesRouter.patch(
  '/:id',
  authenticate,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { id } = idParamSchema.parse(req.params);
    const body = categoryBodySchema.partial().parse(req.body);

    const existing = await prisma.category.findUnique({ where: { id } });
    if (!existing) throw notFound('That category no longer exists.');

    if (body.name) {
      const duplicate = await prisma.category.findFirst({
        where: { name: { equals: body.name, mode: 'insensitive' }, NOT: { id } },
      });
      if (duplicate) throw conflict('Another category already uses that name.');
    }

    const updated = await prisma.category.update({
      where: { id },
      data: {
        ...(body.name ? { name: body.name, slug: await uniqueSlug(body.name, id) } : {}),
        ...(body.description !== undefined ? { description: body.description } : {}),
        ...(body.imageUrl !== undefined ? { imageUrl: body.imageUrl } : {}),
        ...(body.sortOrder !== undefined ? { sortOrder: body.sortOrder } : {}),
        ...(body.isActive !== undefined ? { isActive: body.isActive } : {}),
      },
      include: CATEGORY_INCLUDE,
    });

    const category = serializeCategory(updated);
    for (const role of ['ADMIN', 'KITCHEN', 'CUSTOMER'] as const) {
      emitToRole(role, 'category:changed', { action: 'updated', category });
    }

    const actor = getAuth(req).user;
    await logActivity({
      action: 'CATEGORY_UPDATED',
      entity: 'Category',
      entityId: id,
      description: `Category "${updated.name}" updated`,
      userId: actor.id,
      actorEmail: actor.email,
      actorRole: actor.role,
      request: req,
    });

    res.json({ category });
  }),
);

/** DELETE /api/categories/:id - only empty categories can be removed. */
categoriesRouter.delete(
  '/:id',
  authenticate,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { id } = idParamSchema.parse(req.params);
    const existing = await prisma.category.findUnique({
      where: { id },
      include: { _count: { select: { products: true } } },
    });
    if (!existing) throw notFound('That category no longer exists.');
    if (existing._count.products > 0) {
      throw conflict(
        `Move or delete the ${existing._count.products} product(s) in this category first.`,
      );
    }

    await prisma.category.delete({ where: { id } });

    for (const role of ['ADMIN', 'KITCHEN', 'CUSTOMER'] as const) {
      emitToRole(role, 'category:changed', { action: 'deleted', categoryId: id });
    }

    const actor = getAuth(req).user;
    await logActivity({
      action: 'CATEGORY_DELETED',
      entity: 'Category',
      entityId: id,
      description: `Category "${existing.name}" deleted`,
      userId: actor.id,
      actorEmail: actor.email,
      actorRole: actor.role,
      request: req,
    });

    res.json({ success: true });
  }),
);
