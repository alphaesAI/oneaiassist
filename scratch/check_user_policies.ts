import 'dotenv/config';
import { Client } from 'pg';

async function checkPolicies() {
  const connStr = 'postgresql://neondb_owner:npg_RrHoFq2wKSP3@ep-withered-hat-ahhoyqot.c-3.us-east-1.aws.neon.tech/neondb?sslmode=require';
  const client = new Client({ connectionString: connStr, ssl: { rejectUnauthorized: false } });
  await client.connect();

  const res = await client.query(`
    SELECT polname, polcmd, polqual, polwithcheck, relrowsecurity
    FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    WHERE c.relname = 'User';
  `);
  console.log('User policies:', res.rows);
  await client.end();
}

checkPolicies();
