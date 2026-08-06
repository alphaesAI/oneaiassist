import 'dotenv/config';
import { pool } from '../lib/db/index';

async function main() {
  const client = await pool.connect();
  try {
    console.log('Creating Marketing enums and tables via raw SQL...');

    await client.query(`
      DO $$ BEGIN
        CREATE TYPE "MarketingCampaignType" AS ENUM ('ORGANIC', 'PAID');
      EXCEPTION WHEN duplicate_object THEN null; END $$;

      DO $$ BEGIN
        CREATE TYPE "MarketingCampaignStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'PENDING', 'PUBLISHING', 'SUCCESS', 'FAILED');
      EXCEPTION WHEN duplicate_object THEN null; END $$;

      DO $$ BEGIN
        CREATE TYPE "CtrPrediction" AS ENUM ('LOW', 'MEDIUM', 'HIGH');
      EXCEPTION WHEN duplicate_object THEN null; END $$;

      DO $$ BEGIN
        CREATE TYPE "PreFlightAuditVerdict" AS ENUM ('PASS', 'REVIEW', 'BLOCK');
      EXCEPTION WHEN duplicate_object THEN null; END $$;

      DO $$ BEGIN
        CREATE TYPE "SocialPlatform" AS ENUM ('FACEBOOK', 'INSTAGRAM', 'LINKEDIN', 'YOUTUBE', 'META_ADS');
      EXCEPTION WHEN duplicate_object THEN null; END $$;

      DO $$ BEGIN
        CREATE TYPE "PlatformConnectionStatus" AS ENUM ('CONNECTED', 'NOT_CONNECTED');
      EXCEPTION WHEN duplicate_object THEN null; END $$;

      CREATE TABLE IF NOT EXISTS "public"."MarketingCampaign" (
        "id" TEXT NOT NULL,
        "tenantId" TEXT NOT NULL,
        "name" TEXT NOT NULL,
        "type" "public"."MarketingCampaignType" NOT NULL DEFAULT 'ORGANIC',
        "platforms" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
        "mediaUrl" TEXT,
        "caption" TEXT NOT NULL,
        "status" "public"."MarketingCampaignStatus" NOT NULL DEFAULT 'DRAFT',
        "scheduledAt" TIMESTAMP(3),
        "publishedAt" TIMESTAMP(3),
        "reach" INTEGER NOT NULL DEFAULT 0,
        "budget" DOUBLE PRECISION,
        "audienceTargeting" JSONB,
        "complianceScore" INTEGER,
        "ctrPrediction" "public"."CtrPrediction",
        "auditResult" "public"."PreFlightAuditVerdict",
        "auditDetails" JSONB,
        "abTestVariantOfId" TEXT,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "MarketingCampaign_pkey" PRIMARY KEY ("id")
      );

      CREATE TABLE IF NOT EXISTS "public"."PlatformConnection" (
        "id" TEXT NOT NULL,
        "tenantId" TEXT NOT NULL,
        "platform" "public"."SocialPlatform" NOT NULL,
        "status" "public"."PlatformConnectionStatus" NOT NULL DEFAULT 'NOT_CONNECTED',
        "accountName" TEXT,
        "accessToken" TEXT,
        "connectedAt" TIMESTAMP(3),
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "PlatformConnection_pkey" PRIMARY KEY ("id")
      );

      CREATE INDEX IF NOT EXISTS "MarketingCampaign_tenantId_idx" ON "public"."MarketingCampaign"("tenantId");
      CREATE INDEX IF NOT EXISTS "MarketingCampaign_abTestVariantOfId_idx" ON "public"."MarketingCampaign"("abTestVariantOfId");
      CREATE INDEX IF NOT EXISTS "MarketingCampaign_status_idx" ON "public"."MarketingCampaign"("status");
      CREATE INDEX IF NOT EXISTS "PlatformConnection_tenantId_idx" ON "public"."PlatformConnection"("tenantId");
      CREATE UNIQUE INDEX IF NOT EXISTS "PlatformConnection_tenantId_platform_key" ON "public"."PlatformConnection"("tenantId", "platform");
    `);

    console.log('Successfully created Marketing tables in PostgreSQL!');
  } catch (err) {
    console.error('Error creating marketing tables:', err);
  } finally {
    client.release();
    process.exit(0);
  }
}

main();
