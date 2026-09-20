import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, paginate, paginateQuery } from '../lib/http';
import { idParamSchema, optionalBooleanQuery, paginationSchema } from '../lib/validation';
import { authenticate, getAuth, requireAdmin } from '../middleware/authenticate';
import { prisma } from '../lib/prisma';
import { notFound } from '../lib/errors';
import { markAllNotificationsRead, markNotificationRead, notifyRole, serializeNotification } from '../services/notification.service';
import { emitToUser } from '../realtime/socket';

export const notificationsRouter = Router();

const listSchema = paginationSchema.extend({
  unreadOnly: optionalBooleanQuery,
  type: z
    .enum(['ORDER_UPDATE', 'PROMOTION', 'BUSINESS_ALERT', 'LOW_STOCK', 'SYSTEM'])
    .optional(),
});

const broadcastSchema = z.object({
  title: z.string().trim().min(2).max(120),
  body: z.string().trim().min(2).max(600),
  audience: z.enum(['CUSTOMER', 'KITCHEN', 'ADMIN']),
  type: z.enum(['PROMOTION', 'BUSINESS_ALERT', 'SYSTEM']).default('PROMOTION'),
  link: z.string().trim().max(200).nullable().optional(),
});

/** GET /api/notifications - the signed-in account's notifications. */
notificationsRouter.get(
  '/',
  authenticate,
  asyncHandler(async (req, res) => {
    const { user } = getAuth(req);
    const query = listSchema.parse(req.query);
    const { skip, take } = paginateQuery(query);

    const where = {
      userId: user.id,
      ...(query.unreadOnly ? { isRead: false } : {}),
      ...(query.type ? { type: query.type } : {}),
    };

    const [items, total, unread] = await Promise.all([
      prisma.notification.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take }),
      prisma.notification.count({ where }),
      prisma.notification.count({ where: { userId: user.id, isRead: false } }),
    ]);

    res.json({
      ...paginate(items.map(serializeNotification), total, {
        page: query.page,
        pageSize: query.pageSize,
        skip,
        take,
      }),
      unread,
    });
  }),
);

/** POST /api/notifications/:id/read */
notificationsRouter.post(
  '/:id/read',
  authenticate,
  asyncHandler(async (req, res) => {
    const { id } = idParamSchema.parse(req.params);
    const { user } = getAuth(req);
    const updated = await markNotificationRead(user.id, id);
    if (!updated) throw notFound('That notification no longer exists.');
    emitToUser(user.id, 'notification:read', { notificationId: id, all: false });
    res.json({ success: true });
  }),
);

/** POST /api/notifications/read-all */
notificationsRouter.post(
  '/read-all',
  authenticate,
  asyncHandler(async (req, res) => {
    const { user } = getAuth(req);
    const count = await markAllNotificationsRead(user.id);
    emitToUser(user.id, 'notification:read', { notificationId: null, all: true });
    res.json({ success: true, updated: count });
  }),
);

/** DELETE /api/notifications/:id */
notificationsRouter.delete(
  '/:id',
  authenticate,
  asyncHandler(async (req, res) => {
    const { id } = idParamSchema.parse(req.params);
    const { user } = getAuth(req);
    const result = await prisma.notification.deleteMany({ where: { id, userId: user.id } });
    if (result.count === 0) throw notFound('That notification no longer exists.');
    res.json({ success: true });
  }),
);

/** POST /api/notifications/broadcast - admin promotion / alert to a whole role. */
notificationsRouter.post(
  '/broadcast',
  authenticate,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const body = broadcastSchema.parse(req.body);
    const actor = getAuth(req).user;
    const recipients = await notifyRole(body.audience, {
      title: body.title,
      body: body.body,
      type: body.type,
      audience: body.audience,
      link: body.link ?? null,
      createdById: actor.id,
    });
    res.status(201).json({ success: true, recipients });
  }),
);