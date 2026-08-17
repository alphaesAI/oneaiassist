-- Add unique constraint to InboundMessageJob.messageId
-- Prevents duplicate webhook deliveries from being processed twice.
-- Pre-flight check confirmed 0 existing rows, no dedup needed.

CREATE UNIQUE INDEX "InboundMessageJob_messageId_key" ON "InboundMessageJob"("messageId");
