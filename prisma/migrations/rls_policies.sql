-- Enable Row Level Security (RLS) on all tenant-scoped tables and FORCE RLS for table owners

-- 1. User
ALTER TABLE "User" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "User" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS user_tenant_isolation ON "User";
CREATE POLICY user_tenant_isolation ON "User"
  FOR ALL
  USING (
    "tenantId" = current_setting('app.current_tenant_id', true)
    OR current_setting('app.current_user_role', true) = 'PLATFORM_OWNER'
  );

-- 2. TenantAIConfig
ALTER TABLE "TenantAIConfig" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TenantAIConfig" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_ai_config_tenant_isolation ON "TenantAIConfig";
CREATE POLICY tenant_ai_config_tenant_isolation ON "TenantAIConfig"
  FOR ALL
  USING (
    "tenantId" = current_setting('app.current_tenant_id', true)
  );

-- 3. Customer
ALTER TABLE "Customer" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Customer" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS customer_tenant_isolation ON "Customer";
CREATE POLICY customer_tenant_isolation ON "Customer"
  FOR ALL
  USING (
    "tenantId" = current_setting('app.current_tenant_id', true)
  );

-- 4. CustomerChannel
ALTER TABLE "CustomerChannel" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CustomerChannel" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS customer_channel_tenant_isolation ON "CustomerChannel";
CREATE POLICY customer_channel_tenant_isolation ON "CustomerChannel"
  FOR ALL
  USING (
    "tenantId" = current_setting('app.current_tenant_id', true)
  );

-- 5. Conversation
ALTER TABLE "Conversation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Conversation" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS conversation_tenant_isolation ON "Conversation";
CREATE POLICY conversation_tenant_isolation ON "Conversation"
  FOR ALL
  USING (
    "tenantId" = current_setting('app.current_tenant_id', true)
    OR current_setting('app.current_user_role', true) = 'PLATFORM_OWNER'
  );

-- 6. Message
ALTER TABLE "Message" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Message" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS message_tenant_isolation ON "Message";
CREATE POLICY message_tenant_isolation ON "Message"
  FOR ALL
  USING (
    "tenantId" = current_setting('app.current_tenant_id', true)
  );

-- 7. Lead
ALTER TABLE "Lead" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Lead" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS lead_tenant_isolation ON "Lead";
CREATE POLICY lead_tenant_isolation ON "Lead"
  FOR ALL
  USING (
    "tenantId" = current_setting('app.current_tenant_id', true)
  );

-- 8. Application
ALTER TABLE "Application" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Application" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS application_tenant_isolation ON "Application";
CREATE POLICY application_tenant_isolation ON "Application"
  FOR ALL
  USING (
    "tenantId" = current_setting('app.current_tenant_id', true)
  );

-- 9. Policy
ALTER TABLE "Policy" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Policy" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS policy_tenant_isolation ON "Policy";
CREATE POLICY policy_tenant_isolation ON "Policy"
  FOR ALL
  USING (
    "tenantId" = current_setting('app.current_tenant_id', true)
  );

-- 10. PolicyCatalogItem
ALTER TABLE "PolicyCatalogItem" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PolicyCatalogItem" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS policy_catalog_item_tenant_isolation ON "PolicyCatalogItem";
CREATE POLICY policy_catalog_item_tenant_isolation ON "PolicyCatalogItem"
  FOR ALL
  USING (
    "tenantId" = current_setting('app.current_tenant_id', true)
  );

-- 11. PolicyDocumentChunk
ALTER TABLE "PolicyDocumentChunk" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PolicyDocumentChunk" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS policy_document_chunk_tenant_isolation ON "PolicyDocumentChunk";
CREATE POLICY policy_document_chunk_tenant_isolation ON "PolicyDocumentChunk"
  FOR ALL
  USING (
    "tenantId" = current_setting('app.current_tenant_id', true)
  );

-- 12. BroadcastCampaign
ALTER TABLE "BroadcastCampaign" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "BroadcastCampaign" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS broadcast_campaign_tenant_isolation ON "BroadcastCampaign";
CREATE POLICY broadcast_campaign_tenant_isolation ON "BroadcastCampaign"
  FOR ALL
  USING (
    "tenantId" = current_setting('app.current_tenant_id', true)
  );

-- 13. BroadcastJob
ALTER TABLE "BroadcastJob" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "BroadcastJob" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS broadcast_job_tenant_isolation ON "BroadcastJob";
CREATE POLICY broadcast_job_tenant_isolation ON "BroadcastJob"
  FOR ALL
  USING (
    "tenantId" = current_setting('app.current_tenant_id', true)
  );

-- 14. ReminderJob
ALTER TABLE "ReminderJob" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ReminderJob" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS reminder_job_tenant_isolation ON "ReminderJob";
CREATE POLICY reminder_job_tenant_isolation ON "ReminderJob"
  FOR ALL
  USING (
    "tenantId" = current_setting('app.current_tenant_id', true)
  );

-- 15. WhatsAppNumber
ALTER TABLE "WhatsAppNumber" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "WhatsAppNumber" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS whatsapp_number_tenant_isolation ON "WhatsAppNumber";
CREATE POLICY whatsapp_number_tenant_isolation ON "WhatsAppNumber"
  FOR ALL
  USING (
    "tenantId" = current_setting('app.current_tenant_id', true)
  );

-- 16. Template
ALTER TABLE "Template" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Template" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS template_tenant_isolation ON "Template";
CREATE POLICY template_tenant_isolation ON "Template"
  FOR ALL
  USING (
    "tenantId" = current_setting('app.current_tenant_id', true)
  );

-- 17. AuditLog
ALTER TABLE "AuditLog" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AuditLog" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS audit_log_tenant_isolation ON "AuditLog";
CREATE POLICY audit_log_tenant_isolation ON "AuditLog"
  FOR ALL
  USING (
    "tenantId" = current_setting('app.current_tenant_id', true)
    OR "tenantId" IS NULL
    OR current_setting('app.current_user_role', true) = 'PLATFORM_OWNER'
  );

-- 18. TenantAnnouncement
ALTER TABLE "TenantAnnouncement" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TenantAnnouncement" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_announcement_isolation ON "TenantAnnouncement";
CREATE POLICY tenant_announcement_isolation ON "TenantAnnouncement"
  FOR ALL
  USING (
    "tenantId" = current_setting('app.current_tenant_id', true)
    OR current_setting('app.current_user_role', true) = 'PLATFORM_OWNER'
  );

-- 19. TokenUsageLog
ALTER TABLE "TokenUsageLog" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TokenUsageLog" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS token_usage_log_tenant_isolation ON "TokenUsageLog";
CREATE POLICY token_usage_log_tenant_isolation ON "TokenUsageLog"
  FOR ALL
  USING (
    "tenantId" = current_setting('app.current_tenant_id', true)
    OR current_setting('app.current_user_role', true) = 'PLATFORM_OWNER'
  );

-- 20. TenantOnboardingProgress
ALTER TABLE "TenantOnboardingProgress" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TenantOnboardingProgress" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_onboarding_progress_isolation ON "TenantOnboardingProgress";
CREATE POLICY tenant_onboarding_progress_isolation ON "TenantOnboardingProgress"
  FOR ALL
  USING (
    "tenantId" = current_setting('app.current_tenant_id', true)
    OR current_setting('app.current_user_role', true) = 'PLATFORM_OWNER'
  );

-- 21. IntakeFlow
ALTER TABLE "IntakeFlow" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "IntakeFlow" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS intake_flow_tenant_isolation ON "IntakeFlow";
CREATE POLICY intake_flow_tenant_isolation ON "IntakeFlow"
  FOR ALL
  USING (
    "tenantId" = current_setting('app.current_tenant_id', true)
    OR current_setting('app.current_user_role', true) = 'PLATFORM_OWNER'
  );
