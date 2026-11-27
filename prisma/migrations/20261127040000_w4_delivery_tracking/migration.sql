-- W4: per-message delivery tracking reported by the provider.
ALTER TABLE "BroadcastJob" ADD COLUMN IF NOT EXISTS "deliveredAt" TIMESTAMP(3);
ALTER TABLE "BroadcastJob" ADD COLUMN IF NOT EXISTS "readAt" TIMESTAMP(3);
ALTER TABLE "BroadcastJob" ADD COLUMN IF NOT EXISTS "failedAt" TIMESTAMP(3);
ALTER TABLE "BroadcastJob" ADD COLUMN IF NOT EXISTS "errorCode" TEXT;
CREATE INDEX IF NOT EXISTS "BroadcastJob_tenantId_providerMessageId_idx" ON "BroadcastJob"("tenantId", "providerMessageId");
