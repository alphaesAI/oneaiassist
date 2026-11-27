-- W1: WhatsApp Cloud API connection details reported by Meta.
ALTER TABLE "WhatsAppNumber" ADD COLUMN IF NOT EXISTS "displayPhoneNumber" TEXT;
ALTER TABLE "WhatsAppNumber" ADD COLUMN IF NOT EXISTS "verifiedName" TEXT;
ALTER TABLE "WhatsAppNumber" ADD COLUMN IF NOT EXISTS "messagingLimitTier" TEXT;
ALTER TABLE "WhatsAppNumber" ADD COLUMN IF NOT EXISTS "lastVerifiedAt" TIMESTAMP(3);
ALTER TABLE "WhatsAppNumber" ADD COLUMN IF NOT EXISTS "webhookSubscribedAt" TIMESTAMP(3);
ALTER TABLE "WhatsAppNumber" ADD COLUMN IF NOT EXISTS "lastError" TEXT;

-- An empty phone number ID must not collide with another empty one.
UPDATE "WhatsAppNumber" SET "metaPhoneNumberId" = NULL WHERE "metaPhoneNumberId" = '';

-- One Meta phone number belongs to exactly one tenant, so an incoming webhook can never be
-- delivered to the wrong tenant. This fails on purpose if two tenants already share a number.
CREATE UNIQUE INDEX IF NOT EXISTS "WhatsAppNumber_metaPhoneNumberId_key" ON "WhatsAppNumber"("metaPhoneNumberId");

-- The old per-tenant verify token is no longer used (the platform env value is). Clear stored copies.
UPDATE "WhatsAppNumber" SET "metaVerifyToken" = NULL WHERE "metaVerifyToken" IS NOT NULL;
