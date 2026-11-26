-- AlterTable
ALTER TABLE "TenantEmailConfig" ADD COLUMN IF NOT EXISTS "autoPausedAt" TIMESTAMP(3);
ALTER TABLE "TenantEmailConfig" ADD COLUMN IF NOT EXISTS "autoPauseReason" TEXT;
ALTER TABLE "TenantEmailConfig" ADD COLUMN IF NOT EXISTS "encryptedWebhookSecret" TEXT;

-- AlterTable
ALTER TABLE "EmailEvent" ADD COLUMN IF NOT EXISTS "providerEventId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "EmailEvent_tenantId_providerEventId_key" ON "EmailEvent"("tenantId", "providerEventId");
CREATE INDEX IF NOT EXISTS "EmailEvent_tenantId_campaignId_eventType_idx" ON "EmailEvent"("tenantId", "campaignId", "eventType");
CREATE INDEX IF NOT EXISTS "EmailEvent_tenantId_eventType_createdAt_idx" ON "EmailEvent"("tenantId", "eventType", "createdAt");
CREATE INDEX IF NOT EXISTS "BroadcastJob_providerMessageId_idx" ON "BroadcastJob"("providerMessageId");
