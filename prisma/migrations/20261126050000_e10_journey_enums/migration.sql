-- Enum values used by the automation engine (E10).
-- EXITED_BOUNCED was added to the database earlier without a migration file; IF NOT EXISTS makes this safe to re-run.
ALTER TYPE "JourneyEnrollmentStatus" ADD VALUE IF NOT EXISTS 'EXITED_BOUNCED';
ALTER TYPE "JourneyTriggerType" ADD VALUE IF NOT EXISTS 'LIST_JOINED';
ALTER TYPE "JourneyTriggerType" ADD VALUE IF NOT EXISTS 'EMAIL_OPENED';
