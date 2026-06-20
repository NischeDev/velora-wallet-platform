import pg from 'pg';
import type { Logger } from 'pino';

import type { Environment } from '../../config/environment.js';

const { Pool } = pg;

export type DatabasePool = pg.Pool;

export function createDatabasePool(environment: Environment, logger: Logger): DatabasePool {
  const pool = new Pool({
    connectionString: environment.DATABASE_URL,
    max: environment.DATABASE_POOL_MAX,
    idleTimeoutMillis: environment.DATABASE_IDLE_TIMEOUT_MS,
    connectionTimeoutMillis: environment.DATABASE_CONNECTION_TIMEOUT_MS,
    allowExitOnIdle: false,
    ssl: environment.DATABASE_SSL ? { rejectUnauthorized: true } : false,
    application_name: 'digital-wallet-api',
  });

  pool.on('error', (error) => {
    logger.error({ err: error }, 'Unexpected error on an idle PostgreSQL client');
  });

  pool.on('connect', () => {
    logger.debug('PostgreSQL client added to the pool');
  });

  return pool;
}

export async function verifyDatabaseConnection(pool: DatabasePool): Promise<void> {
  await pool.query('SELECT 1');
}
