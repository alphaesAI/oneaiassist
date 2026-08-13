const { Client } = require('pg');

const sql = `
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'MessageType') THEN
    CREATE TYPE "MessageType" AS ENUM ('TEXT', 'IMAGE', 'VIDEO', 'DOCUMENT', 'AUDIO', 'LOCATION', 'OTHER');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'MessageStatus') THEN
    CREATE TYPE "MessageStatus" AS ENUM ('PENDING', 'SENT', 'DELIVERED', 'READ', 'FAILED');
  END IF;
END
$$;

ALTER TABLE "BotConfig" ADD COLUMN IF NOT EXISTS "stopKeyword" text DEFAULT 'STOP';
ALTER TABLE "Conversation" ADD COLUMN IF NOT EXISTS "automationEnabled" boolean DEFAULT true;

ALTER TABLE "Message" ADD COLUMN IF NOT EXISTS "messageType" "MessageType" DEFAULT 'TEXT';
ALTER TABLE "Message" ADD COLUMN IF NOT EXISTS "status" "MessageStatus" DEFAULT 'SENT';
ALTER TABLE "Message" ADD COLUMN IF NOT EXISTS "clientMessageId" text;
ALTER TABLE "Message" ADD COLUMN IF NOT EXISTS "providerMessageId" text;
ALTER TABLE "Message" ADD COLUMN IF NOT EXISTS "mediaId" text;
ALTER TABLE "Message" ADD COLUMN IF NOT EXISTS "sentAt" timestamp with time zone;
ALTER TABLE "Message" ADD COLUMN IF NOT EXISTS "deliveredAt" timestamp with time zone;
ALTER TABLE "Message" ADD COLUMN IF NOT EXISTS "readAt" timestamp with time zone;
ALTER TABLE "Message" ADD COLUMN IF NOT EXISTS "failedAt" timestamp with time zone;

DROP INDEX IF EXISTS "Message_clientMessageId_key";
CREATE UNIQUE INDEX IF NOT EXISTS "Message_clientMessageId_key" ON "Message"("clientMessageId");
`;

async function run() {
  const connectionStrings = [
    'postgresql://oneai_app:AppPassword123!@ep-withered-hat-ahhoyqot.c-3.us-east-1.aws.neon.tech/neondb?sslmode=require',
    'postgresql://neondb_owner:npg_RrHoFq2wKSP3@ep-withered-hat-ahhoyqot.c-3.us-east-1.aws.neon.tech/neondb?sslmode=require'
  ];

  for (const conn of connectionStrings) {
    const user = conn.includes('neondb_owner') ? 'neondb_owner' : 'oneai_app';
    console.log(`Trying to run migrations as user: ${user}...`);
    const client = new Client({ connectionString: conn });
    try {
      await client.connect();
      await client.query(sql);
      console.log(`✅ Migrations completed successfully as ${user}!`);
      await client.end();
      return;
    } catch (err) {
      console.error(`Failed to migrate as ${user}:`, err.message);
      try { await client.end(); } catch {}
    }
  }
  process.exit(1);
}

run();
