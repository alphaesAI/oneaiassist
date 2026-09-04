import 'dotenv/config';
import { Client } from 'pg';

async function main() {
  console.log('Applying contextMessageId migration to Message table as database owner...');
  const connStr = 'postgresql://neondb_owner:npg_RrHoFq2wKSP3@ep-withered-hat-ahhoyqot.c-3.us-east-1.aws.neon.tech/neondb?sslmode=require';

  const client = new Client({
    connectionString: connStr,
    ssl: { rejectUnauthorized: false }
  });

  await client.connect();

  try {
    await client.query(`
      ALTER TABLE "Message" ADD COLUMN IF NOT EXISTS "contextMessageId" TEXT;
    `);
    await client.query(`
      GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO oneai_app;
    `);
    console.log('✅ Added contextMessageId column to Message table & granted permissions!');
    console.log('✅ Added contextMessageId column to Message table!');
  } catch (err) {
    console.error('❌ Migration failed:', err);
  } finally {
    await client.end();
  }
}

main();
