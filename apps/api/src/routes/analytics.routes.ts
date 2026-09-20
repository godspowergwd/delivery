import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../lib/http';
import { authenticate, requireAdmin } from '../middleware/authenticate';
import { getAnalyticsCharts, getAnalyticsOverview } from '../services/analytics.service';
import { prisma } from '../lib/prisma';

export const analyticsRouter = Router();

const chartQuerySchema = z.object({
  period: z.enum(['daily', 'weekly', 'monthly', 'yearly']).default('weekly'),
  from: z.string().trim().optional(),
  to: z.string().trim().optional(),
});

function optionalDate(value?: string): Date | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

/** GET /api/analytics/overview - KPI cards for the admin dashboard. */
analyticsRouter.get(
  '/overview',
  authenticate,
  requireAdmin,
  asyncHandler(async (_req, res) => {
    res.json({ overview: await getAnalyticsOverview() });
  }),
);

/** GET /api/analytics/charts - revenue/orders/customer trends for a period. */
analyticsRouter.get(
  '/charts',
  authenticate,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const query = chartQuerySchema.parse(req.query);
    const charts = await getAnalyticsCharts(
      query.period,
      optionalDate(query.from),
      optionalDate(query.to),
    );
    res.json({ charts });
  }),
);

/** GET /api/analytics/search - global search across orders, products, people and categories. */
analyticsRouter.get(
  '/search',
  authenticate,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const query = z
      .object({ q: z.string().trim().min(1).max(120), limit: z.coerce.number().int().min(1).max(20).default(5) })
      .parse(req.query);
    const term = query.q;
    const limit = query.limit;

    const [orders, products, categories, customers, staff] = await Promise.all([
      prisma.order.findMany({
        where: {
          OR: [
            { orderNumber: { contains: term, mode: 'insensitive' } },
            { deliveryPhone: { contains: term, mode: 'insensitive' } },
            { customer: { name: { contains: term, mode: 'insensitive' } } },
          ],
        },
        select: { id: true, orderNumber: true, status: true, total: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
        take: limit,
      }),
      prisma.product.findMany({
        where: {
          OR: [
            { name: { contains: term, mode: 'insensitive' } },
            { description: { contains: term, mode: 'insensitive' } },
          ],
        },
        select: { id: true, name: true, price: true, isAvailable: true, isArchived: true },
        take: limit,
      }),
      prisma.category.findMany({
        where: { name: { contains: term, mode: 'insensitive' } },
        select: { id: true, name: true, slug: true, isActive: true },
        take: limit,
      }),
      prisma.user.findMany({
        where: {
          role: 'CUSTOMER',
          OR: [
            { name: { contains: term, mode: 'insensitive' } },
            { email: { contains: term, mode: 'insensitive' } },
            { phone: { contains: term, mode: 'insensitive' } },
          ],
        },
        select: { id: true, name: true, email: true, phone: true, isActive: true },
        take: limit,
      }),
      prisma.user.findMany({
        where: {
          role: { in: ['KITCHEN', 'ADMIN'] },
          OR: [
            { name: { contains: term, mode: 'insensitive' } },
            { email: { contains: term, mode: 'insensitive' } },
          ],
        },
        select: { id: true, name: true, email: true, role: true, isActive: true },
        take: limit,
      }),
    ]);

    res.json({
      query: term,
      orders: orders.map((order) => ({
        id: order.id,
        orderNumber: order.orderNumber,
        status: order.status,
        total: Number(order.total),
        createdAt: order.createdAt.toISOString(),
      })),
      products: products.map((product) => ({
        id: product.id,
        name: product.name,
        price: Number(product.price),
        isAvailable: product.isAvailable,
        isArchived: product.isArchived,
      })),
      categories,
      customers,
      staff,
    });
  }),
);