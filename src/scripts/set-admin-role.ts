import pg from 'pg';

import { environment } from '../config/environment.js';

const { Pool } = pg;
const requestedRole = process.argv[2];
const email = process.argv[3]?.trim().toLowerCase();

if ((requestedRole !== 'ADMIN' && requestedRole !== 'USER') || !email) {
  throw new Error('Usage: npm run admin:grant -- user@example.com (or admin:revoke)');
}

const pool = new Pool({
  connectionString: environment.DATABASE_URL,
  ssl: environment.DATABASE_SSL ? { rejectUnauthorized: true } : false,
  application_name: 'velora-role-admin',
});

const client = await pool.connect();
try {
  await client.query('BEGIN');
  await client.query('LOCK TABLE users IN SHARE ROW EXCLUSIVE MODE');
  const userResult = await client.query<{ email: string; role: 'USER' | 'ADMIN' }>(
    'SELECT email, role FROM users WHERE email = $1 FOR UPDATE',
    [email],
  );
  const user = userResult.rows[0];
  if (!user) throw new Error(`No user exists with email ${email}`);

  if (requestedRole === 'USER' && user.role === 'ADMIN') {
    const admins = await client.query<{ count: string }>(
      "SELECT COUNT(*)::text AS count FROM users WHERE role = 'ADMIN' AND status = 'ACTIVE'",
    );
    if (Number(admins.rows[0]!.count) <= 1) {
      throw new Error('Cannot revoke the final active administrator');
    }
  }

  await client.query('UPDATE users SET role = $2, updated_at = NOW() WHERE email = $1', [
    email,
    requestedRole,
  ]);
  await client.query('COMMIT');
  console.log(`${email} now has the ${requestedRole} role`);
} catch (error) {
  await client.query('ROLLBACK');
  throw error;
} finally {
  client.release();
  await pool.end();
}
