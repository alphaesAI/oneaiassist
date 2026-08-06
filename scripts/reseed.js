const { Client } = require('pg');
const { execSync } = require('child_process');
require('dotenv').config({ path: 'D:/codebase/oneaiassist_v1/.env' });

const tables = [
  'User',
  'TenantAIConfig',
  'Customer',
  'CustomerChannel',
  'Conversation',
  'Message',
  'Lead',
  'Application',
  'Policy',
  'PolicyCatalogItem',
  'PolicyDocumentChunk',
  'BroadcastCampaign',
  'BroadcastJob',
  'ReminderJob',
  'WhatsAppNumber',
  'Template',
  'AuditLog',
  'TenantAnnouncement',
  'TokenUsageLog',
  'TenantOnboardingProgress'
];

async function run() {
  const connectionString = "postgresql://neondb_owner:npg_RrHoFq2wKSP3@ep-withered-hat-ahhoyqot.c-3.us-east-1.aws.neon.tech/neondb?sslmode=require";

  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false }
  });
  await client.connect();

  console.log('🔒 Disabling Row Level Security on all tables...');
  for (const table of tables) {
    await client.query(`ALTER TABLE "${table}" DISABLE ROW LEVEL SECURITY;`);
  }
  console.log('✅ RLS disabled.');

  try {
    console.log('🌱 Seeding database...');
    execSync("npx ts-node -r dotenv/config -O \"{\\\"module\\\":\\\"commonjs\\\"}\" prisma/seed.ts", { stdio: 'inherit' });
    console.log('✅ Seeding completed successfully!');
  } catch (err) {
    console.error('❌ Error during seeding:', err);
  } finally {
    console.log('🔒 Re-enabling Row Level Security on all tables...');
    for (const table of tables) {
      await client.query(`ALTER TABLE "${table}" ENABLE ROW LEVEL SECURITY;`);
    }
    console.log('✅ RLS re-enabled.');
    await client.end();
  }
}

run().catch(err => {
  console.error('Reseed script failed:', err);
  process.exit(1);
});
