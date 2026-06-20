import type { HealthRepository } from './health.repository.js';

export interface ReadinessResult {
  status: 'ready' | 'not_ready';
  timestamp: string;
  checks: {
    database: Awaited<ReturnType<HealthRepository['checkDatabase']>>;
    cache: Awaited<ReturnType<HealthRepository['checkCache']>>;
  };
}

export class HealthService {
  public constructor(private readonly repository: HealthRepository) {}

  public getLiveness(): { status: 'alive'; timestamp: string } {
    return {
      status: 'alive',
      timestamp: new Date().toISOString(),
    };
  }

  public async getReadiness(): Promise<ReadinessResult> {
    const [database, cache] = await Promise.all([
      this.repository.checkDatabase(),
      this.repository.checkCache(),
    ]);

    return {
      status: database.status === 'up' && cache.status === 'up' ? 'ready' : 'not_ready',
      timestamp: new Date().toISOString(),
      checks: {
        database,
        cache,
      },
    };
  }
}
