#!/usr/bin/env node
/**
 * Diagnostic helper: prints the connection target and the tables of the database
 * named by DATABASE_URL (defaults to the project local cluster on port 5433).
 */
import { Client } from 'pg';

const connectionString =
  process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@127.0.0.1:5433/delivery_system';
const { hostname, port, pathname } = new URL(connectionString);
console.log(`[db] host=${hostname} port=${port} database=${pathname.slice(1)}`);

const client = new Client({ connectionString });
try {
  await client.connect();
  const { rows } = await client.query(
    "select table_name from information_schema.tables where table_schema = 'public' order by table_name",
  );
  console.log(`[db] tables: ${rows.map((row) => row.table_name).join(', ') || '(none)'}`);

  const indexes = await client.query(
    "select tablename, indexname from pg_indexes where schemaname = 'public' and tablename in ('User', 'Session', 'ActivityLog') order by tablename, indexname",
  );
  for (const row of indexes.rows) console.log(`[db] index ${row.tablename}.${row.indexname}`);
} finally {
  await client.end();
}
