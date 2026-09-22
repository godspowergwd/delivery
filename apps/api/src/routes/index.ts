import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { asyncHandler } from '../lib/http';
import { authRouter } from './auth.routes';
import { categoriesRouter } from './categories.routes';
import { productsRouter } from './products.routes';
import { ordersRouter } from './orders.routes';
import { kitchenRouter } from './kitchen.routes';
import { driverRouter } from './driver.routes';
import { usersRouter } from './users.routes';
import { addressesRouter } from './addresses.routes';
import { favoritesRouter } from './favorites.routes';
import { notificationsRouter } from './notifications.routes';
import { receiptsRouter } from './receipts.routes';
import { reportsRouter } from './reports.routes';
import { analyticsRouter } from './analytics.routes';
import { settingsRouter } from './settings.routes';
import { uploadsRouter } from './uploads.routes';
import { logsRouter } from './logs.routes';
import { geoRouter } from './geo.routes';

export const apiRouter = Router();

apiRouter.get(
  '/health',
  asyncHandler(async (_req, res) => {
    await prisma.$queryRaw`SELECT 1`;
    res.json({
      status: 'ok',
      time: new Date().toISOString(),
      uptimeSeconds: Math.round(process.uptime()),
    });
  }),
);

apiRouter.use('/auth', authRouter);
apiRouter.use('/categories', categoriesRouter);
apiRouter.use('/products', productsRouter);
apiRouter.use('/orders', ordersRouter);
apiRouter.use('/kitchen', kitchenRouter);
apiRouter.use('/driver', driverRouter);
apiRouter.use('/users', usersRouter);
apiRouter.use('/addresses', addressesRouter);
apiRouter.use('/favorites', favoritesRouter);
apiRouter.use('/notifications', notificationsRouter);
apiRouter.use('/receipts', receiptsRouter);
apiRouter.use('/reports', reportsRouter);
apiRouter.use('/analytics', analyticsRouter);
apiRouter.use('/settings', settingsRouter);
apiRouter.use('/uploads', uploadsRouter);
apiRouter.use('/logs', logsRouter);
apiRouter.use('/geo', geoRouter);