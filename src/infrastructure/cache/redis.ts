import { createClient } from 'redis';
import type { Logger } from 'pino';

import type { Environment } from '../../config/environment.js';

export function createCacheClient(environment: Environment, logger: Logger) {
  const client = createClient({
    url: environment.REDIS_URL,
    socket: {
      connectTimeout: 5_000,
      reconnectStrategy: (retries) => Math.min(retries * 100, 3_000),
    },
  });

  client.on('error', (error) => {
    logger.error({ err: error }, 'Redis client error');
  });

  client.on('reconnecting', () => {
    logger.warn('Redis client reconnecting');
  });

  return client;
}

export type CacheClient = ReturnType<typeof createCacheClient>;

export async function verifyCacheConnection(client: CacheClient): Promise<void> {
  if (!client.isOpen) {
    await client.connect();
  }

  await client.ping();
}
