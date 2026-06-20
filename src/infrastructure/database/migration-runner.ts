import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { Logger } from 'pino';

import type { DatabasePool } from './postgres.js';

interface AppliedMigrationRow {
  name: string;
  checksum: string;
}

export async function runMigrations(
  database: DatabasePool,
  migrationsDirectory: string,
  logger: Logger,
): Promise<void> {
  const client = await database.connect();

  try {
    await client.query("SELECT pg_advisory_lock(hashtext('digital-wallet-migrations'))");
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        name TEXT PRIMARY KEY,
        checksum CHAR(64) NOT NULL,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    const files = (await readdir(migrationsDirectory))
      .filter((file) => /^\d+_[a-z0-9_]+\.sql$/.test(file))
      .sort();

    const appliedResult = await client.query<AppliedMigrationRow>(
      'SELECT name, checksum FROM schema_migrations ORDER BY name',
    );
    const applied = new Map(appliedResult.rows.map((row) => [row.name, row.checksum]));

    for (const file of files) {
      const sql = await readFile(join(migrationsDirectory, file), 'utf8');
      const checksum = createHash('sha256').update(sql).digest('hex');
      const existingChecksum = applied.get(file);

      if (existingChecksum !== undefined) {
        if (existingChecksum !== checksum) {
          throw new Error(`Applied migration ${file} was modified after execution`);
        }
        continue;
      }

      logger.info({ migration: file }, 'Applying database migration');
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (name, checksum) VALUES ($1, $2)', [
          file,
          checksum,
        ]);
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    }
  } finally {
    await client.query("SELECT pg_advisory_unlock(hashtext('digital-wallet-migrations'))");
    client.release();
  }
}
