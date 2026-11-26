-- Columns that were added to the database for E10 without a migration file.
ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS "timeZone" TEXT DEFAULT 'UTC';

ALTER TABLE "JourneyEnrollment" ADD COLUMN IF NOT EXISTS "lockedAt" TIMESTAMP(3);
ALTER TABLE "JourneyEnrollment" ADD COLUMN IF NOT EXISTS "lockedBy" TEXT;
ALTER TABLE "JourneyEnrollment" ADD COLUMN IF NOT EXISTS "attempts" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "JourneyEnrollment" ADD COLUMN IF NOT EXISTS "lastError" TEXT;
CREATE INDEX IF NOT EXISTS "JourneyEnrollment_lockedAt_idx" ON "JourneyEnrollment"("lockedAt");

-- Start of the current run of a contact through a journey (reset on re-enrollment).
ALTER TABLE "JourneyEnrollment" ADD COLUMN IF NOT EXISTS "enrolledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Journey email steps get their own campaign row, marked so the worker never builds an audience for it.
ALTER TABLE "BroadcastCampaign" ADD COLUMN IF NOT EXISTS "kind" TEXT NOT NULL DEFAULT 'BROADCAST';
ALTER TABLE "BroadcastCampaign" ADD COLUMN IF NOT EXISTS "journeyId" TEXT;
ALTER TABLE "BroadcastCampaign" ADD COLUMN IF NOT EXISTS "journeyStepId" TEXT;

-- Hidden campaigns created by the first version of the journey engine: mark them so they can never be treated as a broadcast again.
UPDATE "BroadcastCampaign" SET "kind" = 'JOURNEY' WHERE "name" LIKE '[Journey] %' AND "kind" = 'BROADCAST';

CREATE UNIQUE INDEX IF NOT EXISTS "BroadcastCampaign_journeyId_journeyStepId_key" ON "BroadcastCampaign"("journeyId", "journeyStepId");
CREATE INDEX IF NOT EXISTS "BroadcastCampaign_tenantId_kind_idx" ON "BroadcastCampaign"("tenantId", "kind");
