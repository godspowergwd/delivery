import http from 'node:http';
import fs from 'node:fs';
import { createApp } from './app';
import { env, isProduction, loadTestAccountCount, loadTestAttestationPath, loadTestSafeConfiguration, mapboxMockEnabled } from './config/env';
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

  if (!isProduction) {
    fs.writeFileSync(loadTestAttestationPath, JSON.stringify({
      pid: process.pid,
      port: env.PORT,
      startedAt: Date.now(),
      loadTestSafe: loadTestSafeConfiguration,
      mapboxMock: mapboxMockEnabled,
      loadTestAccountCount,
    }));
  }

  logger.info(`API listening on ${env.API_PUBLIC_URL} (port ${env.PORT})`);
  logger.info(`Realtime websocket ready on the same origin (Socket.IO)`);
  logger.info(`Web app expected at ${env.APP_PUBLIC_URL}`);

  const shutdown = async (signal: string): Promise<void> => {
    logger.warn(`Received ${signal}, shutting down gracefully...`);
    await closeRealtime();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    try {
      const attestation = JSON.parse(fs.readFileSync(loadTestAttestationPath, 'utf8')) as { pid?: number };
      if (attestation.pid === process.pid) fs.rmSync(loadTestAttestationPath, { force: true });
    } catch {
      // Missing or unreadable attestations do not block process shutdown.
    }
    await disconnectDatabase();
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('unhandledRejection', (reason) => {
    logger.error('Unhandled promise rejection', {
      errorType: reason instanceof Error ? reason.name : typeof reason,
    });
  });
  process.on('uncaughtException', (error) => {
    logger.error('Uncaught exception', { errorType: error.name });
    process.exit(1);
  });
}

bootstrap().catch((error: unknown) => {
  logger.error('Failed to start the API', {
    errorType: error instanceof Error ? error.name : typeof error,
  });
  process.exit(1);
});