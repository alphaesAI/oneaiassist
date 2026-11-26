-- AlterTable
ALTER TABLE "Customer" ADD COLUMN     "customFields" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN     "emailConsentProof" TEXT,
ALTER COLUMN "emailConsentStatus" SET DEFAULT 'PENDING';

-- CreateTable
CREATE TABLE "ContactList" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContactList_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContactListMember" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "listId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContactListMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomFieldDefinition" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "fieldType" TEXT NOT NULL DEFAULT 'TEXT',
    "options" JSONB,
    "required" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomFieldDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContactImportJob" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "listId" TEXT,
    "fileName" TEXT NOT NULL,
    "csvContent" TEXT NOT NULL,
    "consentSource" TEXT,
    "consentProof" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "totalRows" INTEGER NOT NULL DEFAULT 0,
    "importedCount" INTEGER NOT NULL DEFAULT 0,
    "updatedCount" INTEGER NOT NULL DEFAULT 0,
    "skippedCount" INTEGER NOT NULL DEFAULT 0,
    "errors" JSONB,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "ContactImportJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ContactList_tenantId_idx" ON "ContactList"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "ContactList_tenantId_name_key" ON "ContactList"("tenantId", "name");

-- CreateIndex
CREATE INDEX "ContactListMember_tenantId_listId_idx" ON "ContactListMember"("tenantId", "listId");

-- CreateIndex
CREATE INDEX "ContactListMember_tenantId_customerId_idx" ON "ContactListMember"("tenantId", "customerId");

-- CreateIndex
CREATE UNIQUE INDEX "ContactListMember_listId_customerId_key" ON "ContactListMember"("listId", "customerId");

-- CreateIndex
CREATE INDEX "CustomFieldDefinition_tenantId_idx" ON "CustomFieldDefinition"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "CustomFieldDefinition_tenantId_key_key" ON "CustomFieldDefinition"("tenantId", "key");

-- CreateIndex
CREATE INDEX "ContactImportJob_tenantId_status_idx" ON "ContactImportJob"("tenantId", "status");

-- CreateIndex
CREATE INDEX "ContactImportJob_status_createdAt_idx" ON "ContactImportJob"("status", "createdAt");

-- CreateIndex
CREATE INDEX "Customer_tenantId_email_idx" ON "Customer"("tenantId", "email");

-- AddForeignKey
ALTER TABLE "ContactList" ADD CONSTRAINT "ContactList_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContactListMember" ADD CONSTRAINT "ContactListMember_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContactListMember" ADD CONSTRAINT "ContactListMember_listId_fkey" FOREIGN KEY ("listId") REFERENCES "ContactList"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContactListMember" ADD CONSTRAINT "ContactListMember_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomFieldDefinition" ADD CONSTRAINT "CustomFieldDefinition_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContactImportJob" ADD CONSTRAINT "ContactImportJob_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

