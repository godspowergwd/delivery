#!/usr/bin/env node
/**
 * Quick database inspector used to confirm the local development cluster is
 * healthy and seeded. Run with: node scripts/db-inspect.mjs
 */
import pg from 'pg';

const url =
  process.env.DATABASE_URL ||
  'postgresql://postgres:postgres@127.0.0.1:5433/delivery_system';

const TABLES = [
  'User',
  'Category',
  'Product',
  'Address',
  'Favorite',
  'Order',
  'OrderItem',
  'Notification',
  'ActivityLog',
  'Setting',
];

const client = new pg.Client({ connectionString: url });

try {
  await client.connect();
  const tables = await client.query(
    "select table_name from information_schema.tables where table_schema = 'public' order by 1",
  );
  console.log('Tables:', tables.rows.map((r) => r.table_name).join(', '));

  for (const table of TABLES) {
    try {
      const result = await client.query(`select count(*)::int as n from "${table}"`);
      console.log(`  ${table} = ${result.rows[0].n}`);
    } catch (error) {
      console.log(`  ${table} = ERROR (${String(error.message).split('\n')[0]})`);
    }
  }

  const accounts = await client.query(
    'select email, role, "isActive" from "User" order by role, email',
  );
  console.log('\nAccounts:');
  for (const row of accounts.rows) {
    console.log(`  ${row.role.padEnd(8)} ${row.email} active=${row.isActive}`);
  }
} catch (error) {
  console.error('Database inspection failed:', error.message);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}