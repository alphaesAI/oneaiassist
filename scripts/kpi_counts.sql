SELECT COUNT(*) AS leads FROM "Lead" WHERE "tenantId" = 'tenant_pme_ff9xl';
SELECT COUNT(*) AS policies FROM "Policy" WHERE "tenantId" = 'tenant_pme_ff9xl';
SELECT COUNT(*) AS active_convs FROM "Conversation" WHERE "tenantId" = 'tenant_pme_ff9xl' AND "status" = 'OPEN';
