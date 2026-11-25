import fs from 'node:fs';
import { pool, verifyDbConnection } from './pool.js';

async function initDb() {
  try {
    const schemaPath = new URL('./schema.sql', import.meta.url);
    const schemaSql = fs.readFileSync(schemaPath, 'utf8');

    await verifyDbConnection();
    await pool.query(schemaSql);
    console.log('Database schema initialized successfully.');
  } catch (err) {
    console.error('Failed to initialize database schema:', err.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

initDb();
