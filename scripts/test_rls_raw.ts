import 'dotenv/config';
import { Client } from 'pg';

async function run() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });
  await client.connect();
  console.log('Connected to database.');

  try {
    // 1. Get tenants
    const tenantsRes = await client.query('SELECT id, name FROM "Tenant" ORDER BY slug;');
    console.log('Tenants in DB:', tenantsRes.rows);
    if (tenantsRes.rows.length < 2) {
      console.log('Need at least 2 tenants. Run test_isolation.ts first.');
      return;
    }
    const tenantA = tenantsRes.rows[0];
    const tenantB = tenantsRes.rows[1];

    // 2. Query as Tenant A inside a transaction
    console.log(`\n--- Query as Tenant A (${tenantA.name} - ${tenantA.id}) ---`);
    await client.query('BEGIN;');
    await client.query(`SELECT set_config('app.current_tenant_id', $1, true);`, [tenantA.id]);
    const resA = await client.query('SELECT id, "displayName", "tenantId" FROM "Contact";');
    console.log('Query result count:', resA.rows.length);
    console.log('Rows:', resA.rows);
    await client.query('COMMIT;');

    // 3. Query as Tenant B inside a transaction
    console.log(`\n--- Query as Tenant B (${tenantB.name} - ${tenantB.id}) ---`);
    await client.query('BEGIN;');
    await client.query(`SELECT set_config('app.current_tenant_id', $1, true);`, [tenantB.id]);
    const resB = await client.query('SELECT id, "displayName", "tenantId" FROM "Contact";');
    console.log('Query result count:', resB.rows.length);
    console.log('Rows:', resB.rows);
    await client.query('COMMIT;');

  } finally {
    await client.end();
  }
}

run().catch(console.error);
