import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, paginate, paginateQuery } from '../lib/http';
import { paginationSchema } from '../lib/validation';
import { authenticate, requireAdmin } from '../middleware/authenticate';
import { prisma } from '../lib/prisma';

export const logsRouter = Router();

const logQuerySchema = paginationSchema.extend({
  action: z.string().trim().max(60).optional(),
  entity: z.string().trim().max(60).optional(),
  q: z.string().trim().max(120).optional(),
  from: z.string().trim().optional(),
  to: z.string().trim().optional(),
});

function optionalDate(value?: string, endOfDay = false): Date | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return undefined;
  if (endOfDay) date.setHours(23, 59, 59, 999);
  return date;
}

/** GET /api/logs - activity audit trail (admin only). */
logsRouter.get(
  '/',
  authenticate,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const query = logQuerySchema.parse(req.query);
    const { skip, take } = paginateQuery(query);

    const where = {
      ...(query.action ? { action: query.action } : {}),
      ...(query.entity ? { entity: query.entity } : {}),
      ...(query.from || query.to
        ? {
            createdAt: {
              ...(optionalDate(query.from) ? { gte: optionalDate(query.from) } : {}),
              ...(optionalDate(query.to, true) ? { lte: optionalDate(query.to, true) } : {}),
            },
          }
        : {}),
      ...(query.q
        ? {
            OR: [
              { description: { contains: query.q, mode: 'insensitive' as const } },
              { actorEmail: { contains: query.q, mode: 'insensitive' as const } },
              { action: { contains: query.q, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      prisma.activityLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
        include: { user: { select: { name: true, role: true } } },
      }),
      prisma.activityLog.count({ where }),
    ]);

    res.json(
      paginate(
        items.map((log) => ({
          id: log.id,
          action: log.action,
          entity: log.entity,
          entityId: log.entityId,
          description: log.description,
          metadata: log.metadata,
          actorName: log.user?.name ?? 'System',
          actorEmail: log.actorEmail,
          actorRole: log.actorRole ?? log.user?.role ?? null,
          ip: log.ip,
          userAgent: log.userAgent,
          createdAt: log.createdAt.toISOString(),
        })),
        total,
        { page: query.page, pageSize: query.pageSize, skip, take },
      ),
    );
  }),
);

/** GET /api/logs/filters - distinct actions and entities for the filter controls. */
logsRouter.get(
  '/filters',
  authenticate,
  requireAdmin,
  asyncHandler(async (_req, res) => {
    const [actions, entities] = await Promise.all([
      prisma.activityLog.findMany({ distinct: ['action'], select: { action: true } }),
      prisma.activityLog.findMany({ distinct: ['entity'], select: { entity: true } }),
    ]);
    res.json({
      actions: actions.map((row) => row.action).sort(),
      entities: entities.map((row) => row.entity).sort(),
    });
  }),
);