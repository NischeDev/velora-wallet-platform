import type { Server } from 'node:http';
import { resolve } from 'node:path';

import { createApp } from './app.js';
import { createLogger } from './common/logger/logger.js';
import { environment } from './config/environment.js';
import { createCacheClient, verifyCacheConnection } from './infrastructure/cache/redis.js';
import {
  createDatabasePool,
  verifyDatabaseConnection,
} from './infrastructure/database/postgres.js';
import { runMigrations } from './infrastructure/database/migration-runner.js';

const logger = createLogger(environment);
const database = createDatabasePool(environment, logger);
const cache = createCacheClient(environment, logger);

async function closeServer(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}

async function bootstrap(): Promise<void> {
  await Promise.all([verifyDatabaseConnection(database), verifyCacheConnection(cache)]);
  await runMigrations(database, resolve('migrations'), logger);
  logger.info('PostgreSQL and Redis connections verified');

  const app = createApp({ environment, logger, database, cache });
  const server = app.listen(environment.PORT, environment.HOST, () => {
    logger.info(
      { host: environment.HOST, port: environment.PORT },
      'Digital Wallet API is listening',
    );
  });

  let shuttingDown = false;

  const shutdown = async (reason: string, exitCode: number): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;

    logger.info({ reason }, 'Graceful shutdown started');

    const forceExitTimer = setTimeout(() => {
      logger.fatal('Graceful shutdown timed out; forcing exit');
      process.exit(1);
    }, environment.SHUTDOWN_TIMEOUT_MS);
    forceExitTimer.unref();

    try {
      await closeServer(server);
      await Promise.all([database.end(), cache.isOpen ? cache.quit() : Promise.resolve()]);
      logger.info('Graceful shutdown completed');
      process.exit(exitCode);
    } catch (error) {
      logger.fatal({ err: error }, 'Graceful shutdown failed');
      process.exit(1);
    }
  };

  process.once('SIGTERM', () => void shutdown('SIGTERM', 0));
  process.once('SIGINT', () => void shutdown('SIGINT', 0));
  process.once('uncaughtException', (error) => {
    logger.fatal({ err: error }, 'Uncaught exception');
    void shutdown('uncaughtException', 1);
  });
  process.once('unhandledRejection', (reason) => {
    logger.fatal({ err: reason }, 'Unhandled promise rejection');
    void shutdown('unhandledRejection', 1);
  });
}

bootstrap().catch(async (error: unknown) => {
  logger.fatal({ err: error }, 'Application failed to start');
  await Promise.allSettled([database.end(), cache.isOpen ? cache.quit() : Promise.resolve()]);
  process.exit(1);
});
