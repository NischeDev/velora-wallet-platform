import { performance } from 'node:perf_hooks';

import type { Logger } from 'pino';

interface SqlHealthClient {
  query(queryText: string): Promise<unknown>;
}

interface CacheHealthClient {
  readonly isReady: boolean;
  ping(): Promise<string>;
}

export interface DependencyHealth {
  status: 'up' | 'down';
  latencyMs: number;
}

export interface HealthRepository {
  checkDatabase(): Promise<DependencyHealth>;
  checkCache(): Promise<DependencyHealth>;
}

export class InfrastructureHealthRepository implements HealthRepository {
  public constructor(
    private readonly database: SqlHealthClient,
    private readonly cache: CacheHealthClient,
    private readonly logger: Logger,
  ) {}

  public async checkDatabase(): Promise<DependencyHealth> {
    return this.measure('PostgreSQL', async () => {
      await this.database.query('SELECT 1');
    });
  }

  public async checkCache(): Promise<DependencyHealth> {
    return this.measure('Redis', async () => {
      if (!this.cache.isReady) {
        throw new Error('Redis client is not ready');
      }

      await this.cache.ping();
    });
  }

  private async measure(name: string, check: () => Promise<void>): Promise<DependencyHealth> {
    const startedAt = performance.now();

    try {
      await check();
      return {
        status: 'up',
        latencyMs: Math.round((performance.now() - startedAt) * 100) / 100,
      };
    } catch (error) {
      this.logger.warn({ err: error, dependency: name }, 'Dependency health check failed');
      return {
        status: 'down',
        latencyMs: Math.round((performance.now() - startedAt) * 100) / 100,
      };
    }
  }
}
