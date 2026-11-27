-- W5: replies and opt-outs linked to the campaign message they answer.
ALTER TABLE "BroadcastJob" ADD COLUMN IF NOT EXISTS "repliedAt" TIMESTAMP(3);
ALTER TABLE "BroadcastJob" ADD COLUMN IF NOT EXISTS "optedOutAt" TIMESTAMP(3);
