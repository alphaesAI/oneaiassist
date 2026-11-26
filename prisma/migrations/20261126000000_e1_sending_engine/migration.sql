-- AlterEnum
ALTER TYPE "BroadcastJobStatus" ADD VALUE IF NOT EXISTS 'SKIPPED_SUPPRESSED';
ALTER TYPE "BroadcastJobStatus" ADD VALUE IF NOT EXISTS 'SKIPPED_INVALID';
ALTER TYPE "BroadcastJobStatus" ADD VALUE IF NOT EXISTS 'CANCELLED';

-- AlterTable
ALTER TABLE "BroadcastCampaign" ADD COLUMN IF NOT EXISTS "audienceBuiltAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "completedAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "idempotencyKey" TEXT,
ADD COLUMN IF NOT EXISTS "lastError" TEXT,
ADD COLUMN IF NOT EXISTS "startedAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "totalRecipients" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "BroadcastJob" ADD COLUMN IF NOT EXISTS "channel" "Channel" NOT NULL DEFAULT 'WHATSAPP',
ADD COLUMN IF NOT EXISTS "lockedAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "lockedBy" TEXT,
ADD COLUMN IF NOT EXISTS "providerMessageId" TEXT,
ADD COLUMN IF NOT EXISTS "recipient" TEXT NOT NULL DEFAULT '',
ADD COLUMN IF NOT EXISTS "variant" TEXT;

-- Deduplicate existing BroadcastJob rows by (campaignId, customerId), keeping the newest
DELETE FROM "BroadcastJob" a
USING "BroadcastJob" b
WHERE a.id <> b.id
  AND a."campaignId" = b."campaignId"
  AND a."customerId" = b."customerId"
  AND (
    COALESCE(a."processedAt", a."scheduledFor") < COALESCE(b."processedAt", b."scheduledFor")
    OR (COALESCE(a."processedAt", a."scheduledFor") = COALESCE(b."processedAt", b."scheduledFor") AND a.id < b.id)
  );

-- CreateIndex
CREATE INDEX IF NOT EXISTS "BroadcastCampaign_status_scheduledAt_idx" ON "BroadcastCampaign"("status", "scheduledAt");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "BroadcastCampaign_tenantId_idempotencyKey_key" ON "BroadcastCampaign"("tenantId", "idempotencyKey");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "BroadcastJob_tenantId_status_scheduledFor_idx" ON "BroadcastJob"("tenantId", "status", "scheduledFor");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "BroadcastJob_campaignId_customerId_key" ON "BroadcastJob"("campaignId", "customerId");
