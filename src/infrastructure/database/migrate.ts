import { resolve } from 'node:path';

import { createLogger } from '../../common/logger/logger.js';
import { environment } from '../../config/environment.js';
import { runMigrations } from './migration-runner.js';
import { createDatabasePool } from './postgres.js';

const logger = createLogger(environment);
const database = createDatabasePool(environment, logger);

runMigrations(database, resolve('migrations'), logger)
  .then(() => logger.info('Database migrations completed'))
  .catch((error: unknown) => {
    logger.fatal({ err: error }, 'Database migration failed');
    process.exitCode = 1;
  })
  .finally(async () => database.end());
