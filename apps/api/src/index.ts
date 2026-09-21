import http from 'node:http';
import { createApp } from './app';
import { env } from './config/env';
import { logger } from './lib/logger';
import { connectDatabase, disconnectDatabase } from './lib/prisma';
import { closeRealtime, initRealtime } from './realtime/socket';
import { ensureUploadDir } from './middleware/upload';
import { ensureReportDir } from './services/storage.service';

async function bootstrap(): Promise<void> {
  ensureUploadDir();
  ensureReportDir();

  // One connectivity probe (connectDatabase logs its own timing), then listen.
  await connectDatabase();

  const app = createApp();
  const server = http.createServer(app);
  initRealtime(server);

  await new Promise<void>((resolve) => {
    server.listen(env.PORT, () => resolve());
  });

  logger.info(`API listening on ${env.API_PUBLIC_URL} (port ${env.PORT})`);
  logger.info(`Realtime websocket ready on the same origin (Socket.IO)`);
  logger.info(`Web app expected at ${env.APP_PUBLIC_URL}`);

  const shutdown = async (signal: string): Promise<void> => {
    logger.warn(`Received ${signal}, shutting down gracefully...`);
    await closeRealtime();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await disconnectDatabase();
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('unhandledRejection', (reason) => {
    logger.error('Unhandled promise rejection', { reason });
  });
  process.on('uncaughtException', (error) => {
    logger.error('Uncaught exception', { message: error.message, stack: error.stack });
    process.exit(1);
  });
}

bootstrap().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  logger.error(`Failed to start the API: ${message}`);
  process.exit(1);
});