-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS "postalAddress" TEXT;

-- AlterTable
ALTER TABLE "TenantEmailConfig" ADD COLUMN IF NOT EXISTS "postalAddress" TEXT;
