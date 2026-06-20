import { createHash } from 'node:crypto';

import type { Logger } from 'pino';

import { ConflictError } from '../../common/errors/app-error.js';
import type { Environment } from '../../config/environment.js';
import type { CacheClient } from '../../infrastructure/cache/redis.js';
import type { DatabasePool } from '../../infrastructure/database/postgres.js';
import {
  withTransaction,
  type TransactionClient,
} from '../../infrastructure/database/transaction.js';
import type { IdempotencyRepository } from './idempotency.repository.js';

export interface IdempotentResult<T> {
  statusCode: number;
  body: T;
  replayed: boolean;
}

interface CachedResult<T> {
  requestHash: string;
  statusCode: number;
  body: T;
}

export class IdempotencyService {
  public constructor(
    private readonly database: DatabasePool,
    private readonly cache: CacheClient,
    private readonly repository: IdempotencyRepository,
    private readonly environment: Environment,
    private readonly logger: Logger,
  ) {}

  public async execute<T>(input: {
    userId: string;
    key: string;
    endpoint: string;
    request: unknown;
    operation: (client: TransactionClient) => Promise<{ statusCode: number; body: T }>;
  }): Promise<IdempotentResult<T>> {
    const requestHash = createHash('sha256').update(canonicalJson(input.request)).digest('hex');
    const cacheKey = `idem:${input.userId}:${input.endpoint}:${input.key}`;
    const cached = await this.readCache<T>(cacheKey);

    if (cached) {
      this.assertSameRequest(cached.requestHash, requestHash);
      return { statusCode: cached.statusCode, body: cached.body, replayed: true };
    }

    const result = await withTransaction(this.database, async (client) => {
      const row = await this.repository.claim(client, {
        userId: input.userId,
        key: input.key,
        endpoint: input.endpoint,
        requestHash,
        expiresAt: new Date(Date.now() + this.environment.IDEMPOTENCY_TTL_SECONDS * 1000),
      });

      this.assertSameRequest(row.request_hash, requestHash);

      if (row.status === 'COMPLETED') {
        return {
          statusCode: row.response_status!,
          body: row.response_body as T,
          replayed: true,
        };
      }

      const operationResult = await input.operation(client);
      await this.repository.complete(
        client,
        row.id,
        operationResult.statusCode,
        operationResult.body,
      );
      return { ...operationResult, replayed: false };
    });

    await this.writeCache(cacheKey, {
      requestHash,
      statusCode: result.statusCode,
      body: result.body,
    });
    return result;
  }

  private assertSameRequest(originalHash: string, currentHash: string): void {
    if (originalHash !== currentHash) {
      throw new ConflictError(
        'This Idempotency-Key was already used with a different request',
        'IDEMPOTENCY_KEY_REUSED',
      );
    }
  }

  private async readCache<T>(key: string): Promise<CachedResult<T> | null> {
    try {
      if (!this.cache.isReady) return null;
      const value = await this.cache.get(key);
      return value ? (JSON.parse(value) as CachedResult<T>) : null;
    } catch (error) {
      this.logger.warn({ err: error }, 'Redis idempotency read failed; using PostgreSQL');
      return null;
    }
  }

  private async writeCache<T>(key: string, value: CachedResult<T>): Promise<void> {
    try {
      if (!this.cache.isReady) return;
      await this.cache.set(key, JSON.stringify(value), {
        expiration: { type: 'EX', value: this.environment.IDEMPOTENCY_TTL_SECONDS },
      });
    } catch (error) {
      this.logger.warn(
        { err: error },
        'Redis idempotency write failed; PostgreSQL remains authoritative',
      );
    }
  }
}

function canonicalJson(value: unknown): string {
  if (value === undefined) return 'null';
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;

  const object = value as Record<string, unknown>;
  return `{${Object.keys(object)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(object[key])}`)
    .join(',')}}`;
}
