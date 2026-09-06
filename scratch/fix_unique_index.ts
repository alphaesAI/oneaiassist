import { Client } from 'pg';

async function fixSchema() {
  const client = new Client({
    connectionString:
      'postgresql://neondb_owner:npg_RrHoFq2wKSP3@ep-withered-hat-ahhoyqot.c-3.us-east-1.aws.neon.tech/neondb?sslmode=require',
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();

  console.log('Altering InboundMessageJob columns to nullable...');
  await client.query(`
    ALTER TABLE "InboundMessageJob" ALTER COLUMN "conversationId" DROP NOT NULL;
    ALTER TABLE "InboundMessageJob" ALTER COLUMN "messageId" DROP NOT NULL;
  `);

  console.log('✅ InboundMessageJob conversationId & messageId are now nullable.');
  await client.end();
}

fixSchema().catch(console.error);
