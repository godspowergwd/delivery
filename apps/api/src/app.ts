import express, { type Express } from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import morgan from 'morgan';
import { corsOptions, originGuard, securityHeaders } from './middleware/security';
import { globalLimiter } from './middleware/rateLimit';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { apiRouter } from './routes';
import { ensureUploadDir } from './middleware/upload';
import { UPLOAD_DIR, isProduction } from './config/env';
import { logger } from './lib/logger';

/** Builds the Express application (kept separate so tests can import it). */
export function createApp(): Express {
  const app = express();

  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  ensureUploadDir();

  app.use(securityHeaders);
  app.use(cors(corsOptions));
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));
  app.use(cookieParser());
  app.use(originGuard);

  app.use(
    morgan(isProduction ? 'combined' : 'dev', {
      skip: (req) => req.path === '/api/health',
    }),
  );

  // Uploaded product images are served straight from disk.
  app.use(
    '/uploads',
    express.static(UPLOAD_DIR, {
      maxAge: '30d',
      fallthrough: true,
      index: false,
    }),
  );

  app.use('/api', globalLimiter, apiRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  logger.info('Express application configured');
  return app;
}