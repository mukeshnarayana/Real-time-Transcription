import { pool } from '../db/pool.js';

const SORT_WHITELIST = {
  created_at: 'created_at',
  updated_at: 'updated_at',
};

const ORDER_WHITELIST = {
  asc: 'ASC',
  desc: 'DESC',
};

const LIST_QUERIES = {
  created_at_ASC: `
    SELECT id, text, language_hint, source, duration_sec, created_at, updated_at
    FROM transcriptions
    WHERE ($1::text IS NULL OR text ILIKE $1)
    ORDER BY created_at ASC, id ASC
    LIMIT $2 OFFSET $3
  `,
  created_at_DESC: `
    SELECT id, text, language_hint, source, duration_sec, created_at, updated_at
    FROM transcriptions
    WHERE ($1::text IS NULL OR text ILIKE $1)
    ORDER BY created_at DESC, id DESC
    LIMIT $2 OFFSET $3
  `,
  updated_at_ASC: `
    SELECT id, text, language_hint, source, duration_sec, created_at, updated_at
    FROM transcriptions
    WHERE ($1::text IS NULL OR text ILIKE $1)
    ORDER BY updated_at ASC, id ASC
    LIMIT $2 OFFSET $3
  `,
  updated_at_DESC: `
    SELECT id, text, language_hint, source, duration_sec, created_at, updated_at
    FROM transcriptions
    WHERE ($1::text IS NULL OR text ILIKE $1)
    ORDER BY updated_at DESC, id DESC
    LIMIT $2 OFFSET $3
  `,
};

export async function checkDbHealth() {
  try {
    await pool.query('SELECT 1');
    return true;
  } catch {
    return false;
  }
}

export async function createTranscription({
  text,
  language_hint = 'auto',
  source = 'live',
  duration_sec = null,
}) {
  const { rows } = await pool.query(
    `
      INSERT INTO transcriptions (text, language_hint, source, duration_sec)
      VALUES ($1, $2, $3, $4)
      RETURNING id, text, language_hint, source, duration_sec, created_at, updated_at
    `,
    [text, language_hint, source, duration_sec]
  );
  return rows[0];
}

export async function listTranscriptions({ page, limit, q, sort, order }) {
  const sortKey = SORT_WHITELIST[sort] || 'created_at';
  const orderKey = ORDER_WHITELIST[order] || 'DESC';
  const queryKey = `${sortKey}_${orderKey}`;
  const listSql = LIST_QUERIES[queryKey];

  const searchPattern = q && q.length > 0 ? `%${q}%` : null;
  const offset = (page - 1) * limit;

  const [countResult, dataResult] = await Promise.all([
    pool.query(
      `
        SELECT COUNT(*)::int AS total
        FROM transcriptions
        WHERE ($1::text IS NULL OR text ILIKE $1)
      `,
      [searchPattern]
    ),
    pool.query(listSql, [searchPattern, limit, offset]),
  ]);

  const total = countResult.rows[0]?.total ?? 0;

  return {
    rows: dataResult.rows,
    total,
  };
}

export async function getTranscriptionById(id) {
  const { rows } = await pool.query(
    `
      SELECT id, text, language_hint, source, duration_sec, created_at, updated_at
      FROM transcriptions
      WHERE id = $1
    `,
    [id]
  );
  return rows[0] || null;
}

export async function updateTranscription(id, { text, language_hint }) {
  const { rows } = await pool.query(
    `
      UPDATE transcriptions
      SET
        text = COALESCE($2, text),
        language_hint = COALESCE($3, language_hint),
        updated_at = NOW()
      WHERE id = $1
      RETURNING id, text, language_hint, source, duration_sec, created_at, updated_at
    `,
    [id, text ?? null, language_hint ?? null]
  );
  return rows[0] || null;
}

export async function deleteTranscription(id) {
  const { rowCount } = await pool.query(
    `
      DELETE FROM transcriptions
      WHERE id = $1
    `,
    [id]
  );
  return rowCount > 0;
}
