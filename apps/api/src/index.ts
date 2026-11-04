import http from 'node:http';
import fs from 'node:fs';
import { createApp } from './app';
import { env, isProduction, loadTestAccountCount, loadTestAttestationPath, loadTestSafeConfiguration, mapboxMockEnabled } from './config/env';
import { logger } from './lib/logger';
import { connectDatabase, disconnectDatabase } from './lib/prisma';
import { closeRealtime, initRealtime } from './realtime/socket';
import { ensureUploadDir } from './middleware/upload';
import { ensureReportDir } from './services/storage.service';
import { startPushAlertWorker } from './services/push-alert.service';

async function bootstrap(): Promise<void> {
  ensureUploadDir();
  ensureReportDir();

  const app = createApp();
  const server = http.createServer(app);
  initRealtime(server);

  // Bind first so Render sees an open port and /api/health answers even while
  // the database is still waking up; the DB probe runs in the background.
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(env.PORT, '0.0.0.0', () => resolve());
  });

  void (async () => {
    for (let attempt = 1; attempt <= 10; attempt += 1) {
      try {
        await connectDatabase();
        return;
      } catch (error) {
        logger.error('Database not ready yet', {
          attempt,
          errorType: error instanceof Error ? error.name : typeof error,
        });
        await new Promise((r) => setTimeout(r, Math.min(2_000 * attempt, 15_000)));
      }
    }
  })();
  startPushAlertWorker();

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
  process.on('uncaughtException', (error: NodeJS.ErrnoException) => {
    const message = String(error.message ?? '').replace(/postgres(ql)?:\/\/\S+/gi, '[redacted]').slice(0, 300);
    logger.error('Uncaught exception', { errorType: error.name, code: error.code, message });
    // Idle pooled DB sockets dropped by Supabase/pgbouncer surface as uncaught
    // errors; the pool reconnects on demand, so they must not kill the API.
    const transientDb = /Connection terminated|terminating connection|ECONNRESET|ETIMEDOUT|EPIPE|57P01|57P03/i.test(`${error.code ?? ''} ${message}`);
    if (!transientDb) process.exit(1);
  });
}

bootstrap().catch((error: unknown) => {
  logger.error('Failed to start the API', {
    errorType: error instanceof Error ? error.name : typeof error,
  });
  process.exit(1);
});