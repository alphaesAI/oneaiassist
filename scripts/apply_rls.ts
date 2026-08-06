import 'dotenv/config';
import { Client } from 'pg';
import fs from 'fs';
import path from 'path';

async function run() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is not defined in env.');
  }

  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false }
  });
  await client.connect();
  console.log('Connected to Neon database.');

  const sqlPath = path.join(process.cwd(), 'prisma/migrations/rls_policies.sql');
  const sql = fs.readFileSync(sqlPath, 'utf8');

  console.log('Applying Row Level Security SQL policies...');
  await client.query(sql);
  console.log('Row Level Security policies applied successfully!');

  await client.end();
}

run().catch(err => {
  console.error('Error applying RLS policies:', err);
  process.exit(1);
});
