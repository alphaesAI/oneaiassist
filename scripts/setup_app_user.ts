import 'dotenv/config';
import { Client } from 'pg';

async function run() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });
  await client.connect();
  console.log('Connected to database as neondb_owner.');

  try {
    // 1. Create the role if it doesn't exist
    console.log('Creating database role: oneai_app...');
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'oneai_app') THEN
          CREATE ROLE oneai_app WITH LOGIN PASSWORD 'AppPassword123!';
        END IF;
      END
      $$;
    `);

    // 2. Grant schema and table permissions
    console.log('Granting privileges to oneai_app...');
    await client.query('GRANT USAGE ON SCHEMA public TO oneai_app;');
    await client.query('GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO oneai_app;');
    await client.query('GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO oneai_app;');
    await client.query('ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO oneai_app;');

    // 3. Verify user was created and doesn't have bypassrls
    const res = await client.query("SELECT rolname, rolsuper, rolbypassrls FROM pg_roles WHERE rolname = 'oneai_app';");
    console.log('\n--- New User Attributes ---');
    console.table(res.rows);

    console.log('✅ oneai_app setup successfully.');
  } catch (err) {
    console.error('Error setting up database role:', err);
  } finally {
    await client.end();
  }
}

run();
