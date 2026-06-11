import pg from "pg";

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
});

async function query(sql, params = []) {
  const result = await pool.query(sql, params);
  const isSelect =
    sql.trim().toUpperCase().startsWith("SELECT") ||
    sql.trim().toUpperCase().startsWith("WITH");
  if (isSelect) return result.rows;
  return { changes: result.rowCount };
}

async function get(sql, params = []) {
  const rows = await query(sql, params);
  return rows[0] || null;
}

async function all(sql, params = []) {
  return await query(sql, params);
}

async function run(sql, params = []) {
  return await query(sql, params);
}

async function getDb() {
  await pool.query("SELECT 1");
  console.log("Connected to PostgreSQL via Supabase");
  return pool;
}

export { getDb, get, all, run };
export default { getDb, get, all, run };
