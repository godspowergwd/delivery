import { Router } from 'express';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { asyncHandler, paginate, paginateQuery } from '../lib/http';
import { emailSchema, idParamSchema, paginationSchema, passwordSchema, phoneSchema } from '../lib/validation';
import { authenticate, getAuth, requireAdmin } from '../middleware/authenticate';
import { prisma } from '../lib/prisma';
import { badRequest, conflict, forbidden, notFound } from '../lib/errors';
import { hashPassword } from '../lib/password';
import { resetUserPassword, toAuthUser } from '../services/auth.service';
import { serializeAddress } from '../services/serializers';
import { logActivity } from '../services/activity-log.service';
import { emitToRole } from '../realtime/socket';
import { notifyUser } from '../services/notification.service';

export const usersRouter = Router();

const ROLE_VALUES = ['CUSTOMER', 'KITCHEN', 'DRIVER', 'ADMIN'] as const;

const profileSchema = z.object({
  name: z.string().trim().min(2, 'Name is too short').max(120).optional(),
  phone: phoneSchema.optional(),
  avatarUrl: z.string().trim().max(500).nullable().optional(),
});

const listUsersSchema = paginationSchema.extend({
  role: z.enum(ROLE_VALUES).optional(),
  q: z.string().trim().max(120).optional(),
  status: z.enum(['active', 'disabled']).optional(),
});

const createUserSchema = z.object({
  name: z.string().trim().min(2, 'Name is too short').max(120),
  email: emailSchema,
  phone: phoneSchema.optional(),
  password: passwordSchema,
  role: z.enum(ROLE_VALUES),
});

const adminUpdateSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  email: emailSchema.optional(),
  phone: phoneSchema.nullable().optional(),
  role: z.enum(ROLE_VALUES).optional(),
  isActive: z.boolean().optional(),
  avatarUrl: z.string().trim().max(500).nullable().optional(),
});

const resetPasswordSchema = z.object({ newPassword: passwordSchema.optional() });

/** GET /api/users/me - full profile for the signed-in account. */
usersRouter.get(
  '/me',
  authenticate,
  asyncHandler(async (req, res) => {
    const auth = getAuth(req);
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: auth.user.id },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        role: true,
        isActive: true,
        isProtected: true,
        avatarUrl: true,
        createdAt: true,
        lastLoginAt: true,
        addresses: { orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }] },
        _count: { select: { orders: true, favorites: true } },
      },
    });

    res.json({
      user: toAuthUser(user),
      addresses: user.addresses.map(serializeAddress),
      stats: { orders: user._count.orders, favorites: user._count.favorites },
    });
  }),
);

/** PATCH /api/users/me - update your own profile. */
usersRouter.patch(
  '/me',
  authenticate,
  asyncHandler(async (req, res) => {
    const body = profileSchema.parse(req.body);
    const auth = getAuth(req);

    const updated = await prisma.user.update({
      where: { id: auth.user.id },
      data: {
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.phone !== undefined ? { phone: body.phone } : {}),
        ...(body.avatarUrl !== undefined ? { avatarUrl: body.avatarUrl } : {}),
      },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        role: true,
        isActive: true,
        isProtected: true,
        avatarUrl: true,
        createdAt: true,
        lastLoginAt: true,
      },
    });

    await logActivity({
      action: 'PROFILE_UPDATED',
      entity: 'User',
      entityId: updated.id,
      description: `${updated.name} updated their profile`,
      userId: updated.id,
      actorEmail: updated.email,
      actorRole: updated.role,
      request: req,
    });

    res.json({ user: toAuthUser(updated) });
  }),
);

/** GET /api/users - paginated staff & customer directory (admin only). */
usersRouter.get(
  '/',
  authenticate,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const query = listUsersSchema.parse(req.query);
    const { skip, take } = paginateQuery(query);

    const where: Prisma.UserWhereInput = {
      ...(query.role ? { role: query.role } : {}),
      ...(query.status ? { isActive: query.status === 'active' } : {}),
      ...(query.q
        ? {
            OR: [
              { name: { contains: query.q, mode: 'insensitive' as const } },
              { email: { contains: query.q, mode: 'insensitive' as const } },
              { phone: { contains: query.q, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      prisma.user.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }],
        skip,
        take,
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          role: true,
          isActive: true,
          isProtected: true,
          avatarUrl: true,
          createdAt: true,
          lastLoginAt: true,
          _count: { select: { orders: true } },
        },
      }),
      prisma.user.count({ where }),
    ]);

    res.json(
      paginate(
        items.map((user) => ({ ...toAuthUser(user), orderCount: user._count.orders })),
        total,
        { page: query.page, pageSize: query.pageSize, skip, take },
      ),
    );
  }),
);

/** POST /api/users - create a staff or customer account (admin only). */
usersRouter.post(
  '/',
  authenticate,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const body = createUserSchema.parse(req.body);

    const duplicate = await prisma.user.findUnique({ where: { email: body.email } });
    if (duplicate) throw conflict('An account with that email already exists.');

    const created = await prisma.user.create({
      data: {
        name: body.name,
        email: body.email,
        phone: body.phone ?? null,
        role: body.role,
        passwordHash: await hashPassword(body.password),
      },
    });

    emitToRole('ADMIN', 'user:changed', { action: 'created', userId: created.id });

    const actor = getAuth(req).user;
    await logActivity({
      action: 'USER_CREATED',
      entity: 'User',
      entityId: created.id,
      description: `${created.name} (${created.role}) created`,
      userId: actor.id,
      actorEmail: actor.email,
      actorRole: actor.role,
      request: req,
    });

    res.status(201).json({ user: toAuthUser(created) });
  }),
);

/** GET /api/users/:id - single account for the admin detail view. */
usersRouter.get(
  '/:id',
  authenticate,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { id } = idParamSchema.parse(req.params);
    const user = await prisma.user.findUnique({
      where: { id },
      include: {
        _count: { select: { orders: true, favorites: true, addresses: true, sessions: true } },
        addresses: { orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }] },
      },
    });
    if (!user) throw notFound('That account no longer exists.');

    res.json({
      user: toAuthUser(user),
      addresses: user.addresses.map(serializeAddress),
      stats: {
        orders: user._count.orders,
        favorites: user._count.favorites,
        addresses: user._count.addresses,
        sessions: user._count.sessions,
      },
    });
  }),
);

/** PATCH /api/users/:id - edit any account profile (admin only). */
usersRouter.patch(
  '/:id',
  authenticate,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { id } = idParamSchema.parse(req.params);
    const body = adminUpdateSchema.parse(req.body);
    const actor = getAuth(req).user;

    const target = await prisma.user.findUnique({ where: { id } });
    if (!target) throw notFound('That account no longer exists.');
    if (target.isProtected && body.role && body.role !== target.role) {
      throw forbidden('The owner account cannot be demoted.');
    }

    if (body.email && body.email !== target.email) {
      const duplicate = await prisma.user.findUnique({ where: { email: body.email } });
      if (duplicate) throw conflict('Another account already uses that email.');
    }

    const updated = await prisma.user.update({
      where: { id },
      data: {
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.email !== undefined ? { email: body.email } : {}),
        ...(body.phone !== undefined ? { phone: body.phone } : {}),
        ...(body.role !== undefined ? { role: body.role } : {}),
        ...(body.isActive !== undefined ? { isActive: body.isActive } : {}),
        ...(body.avatarUrl !== undefined ? { avatarUrl: body.avatarUrl } : {}),
      },
    });

    emitToRole('ADMIN', 'user:changed', { action: 'updated', userId: updated.id });

    await logActivity({
      action: 'USER_UPDATED',
      entity: 'User',
      entityId: id,
      description: `${updated.name} (${updated.role}) updated`,
      metadata: { fields: Object.keys(body) },
      userId: actor.id,
      actorEmail: actor.email,
      actorRole: actor.role,
      request: req,
    });

    res.json({ user: toAuthUser(updated) });
  }),
);

/** POST /api/users/:id/disable - deactivate an account (admin only). */
usersRouter.post(
  '/:id/disable',
  authenticate,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { id } = idParamSchema.parse(req.params);
    const actor = getAuth(req).user;

    if (id === actor.id) throw forbidden('You cannot disable your own account.');
    const target = await prisma.user.findUnique({ where: { id } });
    if (!target) throw notFound('That account no longer exists.');
    if (target.isProtected) throw forbidden('The owner account cannot be disabled.');

    await prisma.session.updateMany({
      where: { userId: id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    const updated = await prisma.user.update({ where: { id }, data: { isActive: false } });

    await notifyUser(id, {
      title: 'Account disabled',
      body: 'Your account has been disabled by the business. Contact support for help.',
      type: 'SYSTEM',
      audience: 'USER',
    });

    emitToRole('ADMIN', 'user:changed', { action: 'updated', userId: id });

    await logActivity({
      action: 'USER_DISABLED',
      entity: 'User',
      entityId: id,
      description: `${updated.name} disabled`,
      userId: actor.id,
      actorEmail: actor.email,
      actorRole: actor.role,
      request: req,
    });

    res.json({ user: toAuthUser(updated) });
  }),
);

/** POST /api/users/:id/activate - reactivate an account (admin only). */
usersRouter.post(
  '/:id/activate',
  authenticate,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { id } = idParamSchema.parse(req.params);
    const actor = getAuth(req).user;

    const target = await prisma.user.findUnique({ where: { id } });
    if (!target) throw notFound('That account no longer exists.');

    const updated = await prisma.user.update({ where: { id }, data: { isActive: true } });

    await notifyUser(id, {
      title: 'Account reactivated',
      body: 'Good news! Your account is active again. You can sign in and order right away.',
      type: 'SYSTEM',
      audience: 'USER',
    });

    emitToRole('ADMIN', 'user:changed', { action: 'updated', userId: id });

    await logActivity({
      action: 'USER_ACTIVATED',
      entity: 'User',
      entityId: id,
      description: `${updated.name} activated`,
      userId: actor.id,
      actorEmail: actor.email,
      actorRole: actor.role,
      request: req,
    });

    res.json({ user: toAuthUser(updated) });
  }),
);

/** POST /api/users/:id/reset-password - returns the new temporary password once. */
usersRouter.post(
  '/:id/reset-password',
  authenticate,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { id } = idParamSchema.parse(req.params);
    const body = resetPasswordSchema.parse(req.body ?? {});
    const actor = getAuth(req).user;
    const { temporaryPassword } = await resetUserPassword(id, actor, body.newPassword);
    res.json({ success: true, temporaryPassword });
  }),
);

/** DELETE /api/users/:id - remove an account (order history must be forced). */
usersRouter.delete(
  '/:id',
  authenticate,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { id } = idParamSchema.parse(req.params);
    const force = String(req.query.force ?? '').toLowerCase() === 'true';
    const actor = getAuth(req).user;

    if (id === actor.id) throw forbidden('You cannot delete your own account.');
    const target = await prisma.user.findUnique({
      where: { id },
      include: { _count: { select: { orders: true } } },
    });
    if (!target) throw notFound('That account no longer exists.');
    if (target.isProtected) throw forbidden('The owner account cannot be deleted.');
    if (target._count.orders > 0 && !force) {
      throw conflict(
        `This account has ${target._count.orders} order(s). Disable it instead, or confirm deletion to erase its history.`,
      );
    }

    await prisma.session.updateMany({
      where: { userId: id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    await prisma.user.delete({ where: { id } });

    emitToRole('ADMIN', 'user:changed', { action: 'deleted', userId: id });
    emitToRole('ADMIN', 'analytics:refresh', {});

    await logActivity({
      action: 'USER_DELETED',
      entity: 'User',
      entityId: id,
      description: `${target.name} (${target.role}) deleted`,
      metadata: { ordersRemoved: target._count.orders, forced: force },
      userId: actor.id,
      actorEmail: actor.email,
      actorRole: actor.role,
      request: req,
    });

    res.json({ success: true });
  }),
);
