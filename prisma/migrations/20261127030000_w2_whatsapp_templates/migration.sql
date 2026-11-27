-- W2: WhatsApp template details kept in step with Meta.
ALTER TABLE "Template" ADD COLUMN IF NOT EXISTS "headerType" TEXT NOT NULL DEFAULT 'NONE';
ALTER TABLE "Template" ADD COLUMN IF NOT EXISTS "variables" JSONB;
ALTER TABLE "Template" ADD COLUMN IF NOT EXISTS "metaTemplateId" TEXT;
ALTER TABLE "Template" ADD COLUMN IF NOT EXISTS "metaStatus" TEXT;
ALTER TABLE "Template" ADD COLUMN IF NOT EXISTS "rejectionReason" TEXT;
ALTER TABLE "Template" ADD COLUMN IF NOT EXISTS "qualityScore" TEXT;
ALTER TABLE "Template" ADD COLUMN IF NOT EXISTS "submittedAt" TIMESTAMP(3);
ALTER TABLE "Template" ADD COLUMN IF NOT EXISTS "lastSyncedAt" TIMESTAMP(3);

-- Existing templates that have header text are text-header templates.
UPDATE "Template" SET "headerType" = 'TEXT'
WHERE "channel" = 'WHATSAPP' AND "header" IS NOT NULL AND btrim("header") <> '';

CREATE INDEX IF NOT EXISTS "Template_tenantId_metaTemplateId_idx" ON "Template"("tenantId", "metaTemplateId");
