import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../lib/http';
import { idParamSchema } from '../lib/validation';
import { authenticate, getAuth } from '../middleware/authenticate';
import { prisma } from '../lib/prisma';
import { notFound } from '../lib/errors';
import { serializeAddress } from '../services/serializers';

export const addressesRouter = Router();

const addressBodySchema = z.object({
  label: z.string().trim().min(1).max(40).default('Home'),
  line1: z.string().trim().min(5, 'Enter the street address').max(200),
  area: z.string().trim().max(120).nullable().optional(),
  city: z.string().trim().min(2, 'Enter the city or town').max(120),
  notes: z.string().trim().max(200).nullable().optional(),
  isDefault: z.boolean().default(false),
});

/** GET /api/addresses - the customer's saved delivery addresses. */
addressesRouter.get(
  '/',
  authenticate,
  asyncHandler(async (req, res) => {
    const { user } = getAuth(req);
    const addresses = await prisma.address.findMany({
      where: { userId: user.id },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
    });
    res.json({ addresses: addresses.map(serializeAddress) });
  }),
);

/** POST /api/addresses */
addressesRouter.post(
  '/',
  authenticate,
  asyncHandler(async (req, res) => {
    const body = addressBodySchema.parse(req.body);
    const { user } = getAuth(req);
    const existingCount = await prisma.address.count({ where: { userId: user.id } });
    const isDefault = body.isDefault || existingCount === 0;

    const created = await prisma.$transaction(async (tx) => {
      if (isDefault) {
        await tx.address.updateMany({ where: { userId: user.id }, data: { isDefault: false } });
      }
      return tx.address.create({
        data: {
          userId: user.id,
          label: body.label,
          line1: body.line1,
          area: body.area ?? null,
          city: body.city,
          notes: body.notes ?? null,
          isDefault,
        },
      });
    });

    res.status(201).json({ address: serializeAddress(created) });
  }),
);

/** PATCH /api/addresses/:id */
addressesRouter.patch(
  '/:id',
  authenticate,
  asyncHandler(async (req, res) => {
    const { id } = idParamSchema.parse(req.params);
    const body = addressBodySchema.partial().parse(req.body);
    const { user } = getAuth(req);

    const existing = await prisma.address.findFirst({ where: { id, userId: user.id } });
    if (!existing) throw notFound('That address no longer exists.');

    const updated = await prisma.$transaction(async (tx) => {
      if (body.isDefault) {
        await tx.address.updateMany({ where: { userId: user.id }, data: { isDefault: false } });
      }
      return tx.address.update({
        where: { id },
        data: {
          ...(body.label !== undefined ? { label: body.label } : {}),
          ...(body.line1 !== undefined ? { line1: body.line1 } : {}),
          ...(body.area !== undefined ? { area: body.area } : {}),
          ...(body.city !== undefined ? { city: body.city } : {}),
          ...(body.notes !== undefined ? { notes: body.notes } : {}),
          ...(body.isDefault !== undefined ? { isDefault: body.isDefault } : {}),
        },
      });
    });

    res.json({ address: serializeAddress(updated) });
  }),
);

/** POST /api/addresses/:id/default */
addressesRouter.post(
  '/:id/default',
  authenticate,
  asyncHandler(async (req, res) => {
    const { id } = idParamSchema.parse(req.params);
    const { user } = getAuth(req);

    const existing = await prisma.address.findFirst({ where: { id, userId: user.id } });
    if (!existing) throw notFound('That address no longer exists.');

    await prisma.$transaction([
      prisma.address.updateMany({ where: { userId: user.id }, data: { isDefault: false } }),
      prisma.address.update({ where: { id }, data: { isDefault: true } }),
    ]);

    const addresses = await prisma.address.findMany({
      where: { userId: user.id },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
    });
    res.json({ addresses: addresses.map(serializeAddress) });
  }),
);

/** DELETE /api/addresses/:id */
addressesRouter.delete(
  '/:id',
  authenticate,
  asyncHandler(async (req, res) => {
    const { id } = idParamSchema.parse(req.params);
    const { user } = getAuth(req);

    const existing = await prisma.address.findFirst({ where: { id, userId: user.id } });
    if (!existing) throw notFound('That address no longer exists.');

    await prisma.address.delete({ where: { id } });

    // Always keep exactly one default address when any remain.
    if (existing.isDefault) {
      const next = await prisma.address.findFirst({
        where: { userId: user.id },
        orderBy: { createdAt: 'desc' },
      });
      if (next) {
        await prisma.address.update({ where: { id: next.id }, data: { isDefault: true } });
      }
    }

    const addresses = await prisma.address.findMany({
      where: { userId: user.id },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
    });
    res.json({ addresses: addresses.map(serializeAddress) });
  }),
);