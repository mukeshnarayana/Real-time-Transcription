import pg from 'pg';
import { env } from '../config/env.js';

const { Pool } = pg;

export const pool = new Pool({
  connectionString: env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 10000,
  idleTimeoutMillis: 30000,
  max: 10,
});

pool.on('error', (err) => {
  console.error('Unexpected PostgreSQL pool error:', err.message);
});

/**
 * Verifies database connectivity with one retry to accommodate Neon cold starts.
 */
export async function verifyDbConnection() {
  try {
    await pool.query('SELECT 1');
  } catch (firstErr) {
    console.warn('Initial database connection failed (retrying once for cold start):', firstErr.message);
    await pool.query('SELECT 1');
  }
}
