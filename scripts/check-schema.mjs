import pg from 'pg';

const client = new pg.Client({
  connectionString: 'postgresql://postgres:postgres@localhost:5433/delivery_system',
});

try {
  await client.connect();
  const roles = await client.query(
    `SELECT enumlabel FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid WHERE t.typname = 'Role' ORDER BY enumsortorder`,
  );
  console.log('ROLES:', roles.rows.map((r) => r.enumlabel).join(','));
  const col = await client.query(
    `SELECT column_name FROM information_schema.columns WHERE table_name = 'Order' AND column_name = 'driverId'`,
  );
  console.log('driverId column:', col.rows.length ? 'YES' : 'NO');
  const fk = await client.query(
    `SELECT COUNT(*)::int AS c FROM pg_constraint WHERE conrelid = '"Order"'::regclass AND contype = 'f' AND conname ILIKE '%driver%'`,
  );
  console.log('driver FK constraints:', fk.rows[0].c);
  process.exit(0);
} catch (err) {
  console.error('FAIL:', err.message);
  process.exit(1);
} finally {
  await client.end().catch(() => {});
}