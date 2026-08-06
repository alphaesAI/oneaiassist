import 'dotenv/config';
import { Client } from 'pg';

async function run() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });
  await client.connect();
  console.log('Connected to database.');

  // Check current user role attributes
  const userAttributesQuery = `
    SELECT rolname, rolsuper, rolbypassrls, rolcreatedb 
    FROM pg_roles 
    WHERE rolname = current_user;
  `;
  const userRes = await client.query(userAttributesQuery);
  console.log('\n--- Current User Attributes ---');
  console.table(userRes.rows);

  await client.end();
}

run().catch(console.error);
