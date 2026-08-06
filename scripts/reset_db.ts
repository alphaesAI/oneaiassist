import { Client } from 'pg';

async function run() {
  const client = new Client({
    connectionString: "postgresql://neondb_owner:npg_RrHoFq2wKSP3@ep-withered-hat-ahhoyqot.c-3.us-east-1.aws.neon.tech/neondb?sslmode=require",
    ssl: { rejectUnauthorized: false }
  });
  await client.connect();
  console.log('Connected to database as owner. Resetting public schema...');

  try {
    await client.query('DROP SCHEMA public CASCADE;');
    await client.query('CREATE SCHEMA public;');
    await client.query('GRANT ALL ON SCHEMA public TO public;');
    console.log('✅ Public schema dropped and recreated successfully.');
  } catch (err) {
    console.error('Error resetting database:', err);
  } finally {
    await client.end();
  }
}

run().catch(console.error);
